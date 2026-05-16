import { getCurrentHotelForRequest } from './current-hotel';
import { writeEnterpriseAuditLog } from './enterprise-audit';
import { canAccess } from './permissions';

const isMissingBookingsTable = (error) => (
  error?.message?.includes('experience_booking_requests')
  || error?.details?.includes('experience_booking_requests')
  || error?.hint?.includes('experience_booking_requests')
);

export const BOOKING_STATUSES = ['pending', 'reviewing', 'confirmed', 'rejected', 'completed', 'cancelled'];

const normalizeBooking = (booking) => ({
  ...booking,
  estimated_revenue: Number(booking.estimated_revenue || 0),
  commission_estimate: Number(booking.commission_estimate || 0),
  metadata: booking.metadata || {}
});

const getExperienceBookingContext = async (request, permission = 'experience_bookings') => {
  const { supabase, hotel, role, user, platformRole } = await getCurrentHotelForRequest(request);

  if (!hotel?.id) {
    const error = new Error('No hotel available for experience bookings');
    error.status = 400;
    throw error;
  }

  if (!canAccess(role, permission)) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }

  if (platformRole === 'support' && permission.endsWith('_manage')) {
    const error = new Error('Support sessions are read-only by default');
    error.status = 403;
    throw error;
  }

  return { supabase, hotel, role, user, platformRole };
};

export const getExperienceBookings = async (request) => {
  const { supabase, hotel, role } = await getExperienceBookingContext(request);
  const { data, error } = await supabase
    .from('experience_booking_requests')
    .select('*')
    .eq('hotel_id', hotel.id)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    if (isMissingBookingsTable(error)) {
      return {
        hotel,
        role,
        bookings: [],
        missingTable: true
      };
    }

    throw error;
  }

  return {
    hotel,
    role,
    bookings: (data || []).map(normalizeBooking)
  };
};

export const updateExperienceBooking = async (request, payload = {}) => {
  const { supabase, hotel, role, user, platformRole } = await getExperienceBookingContext(request, 'experience_bookings_manage');
  const id = payload.id;

  if (!id) {
    const error = new Error('Booking id is required');
    error.status = 400;
    throw error;
  }

  const updates = {
    updated_at: new Date().toISOString()
  };

  if (payload.status !== undefined) {
    if (!BOOKING_STATUSES.includes(payload.status)) {
      const error = new Error('Invalid booking status');
      error.status = 400;
      throw error;
    }

    updates.status = payload.status;
  }

  if (payload.notes !== undefined) updates.notes = String(payload.notes || '').trim() || null;
  if (payload.requested_date !== undefined) updates.requested_date = payload.requested_date || null;
  if (payload.requested_time !== undefined) updates.requested_time = payload.requested_time || null;
  if (payload.guests_count !== undefined) updates.guests_count = payload.guests_count ? Number(payload.guests_count) : null;
  if (payload.estimated_revenue !== undefined) updates.estimated_revenue = Number(payload.estimated_revenue || 0);
  if (payload.commission_estimate !== undefined) updates.commission_estimate = Number(payload.commission_estimate || 0);
  if (payload.assign_to_me) updates.assigned_to_user = user?.id || null;
  if (payload.assigned_to_user !== undefined && ['owner', 'admin', 'manager'].includes(role)) {
    updates.assigned_to_user = payload.assigned_to_user || null;
  }

  const { data: existing } = await supabase
    .from('experience_booking_requests')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('experience_booking_requests')
    .update(updates)
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await syncRevenueForBooking({ supabase, booking: data }).catch((syncError) => {
    console.warn('Experience booking revenue sync failed', syncError.message);
  });

  const statusAction = data.status === 'confirmed'
    ? 'experience_booking_confirmed'
    : data.status === 'rejected'
      ? 'experience_booking_rejected'
      : 'experience_booking_updated';

  await writeEnterpriseAuditLog({
    supabase,
    request,
    actor: user,
    actorRole: role,
    actorPlatformRole: platformRole,
    hotelId: hotel.id,
    action: statusAction,
    entityType: 'experience_booking_request',
    entityId: data.id,
    oldValues: existing || {},
    newValues: data,
    metadata: { source: 'dashboard_experience_bookings' }
  });

  return normalizeBooking(data);
};

const syncRevenueForBooking = async ({ supabase, booking }) => {
  if (!['confirmed', 'completed', 'rejected', 'cancelled'].includes(booking.status)) {
    return null;
  }

  const conversionStatus = ['confirmed', 'completed'].includes(booking.status)
    ? 'accepted'
    : 'rejected';
  const { data: existing, error: existingError } = await supabase
    .from('upsell_conversions')
    .select('*')
    .eq('hotel_id', booking.hotel_id)
    .eq('source', 'experience_booking_request')
    .eq('conversation_id', booking.conversation_id)
    .eq('upsell_type', booking.metadata?.offer_type || 'experience_booking')
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (existingError.message?.includes('upsell_conversions')) return null;
    throw existingError;
  }

  const now = new Date().toISOString();
  const record = {
    hotel_id: booking.hotel_id,
    guest_id: booking.guest_id,
    reservation_id: booking.reservation_id,
    conversation_id: booking.conversation_id,
    upsell_type: booking.metadata?.offer_type || 'experience_booking',
    source: 'experience_booking_request',
    status: conversionStatus,
    estimated_amount: booking.estimated_revenue || 0,
    currency: 'EUR',
    notes: `Experience booking ${booking.id}: ${booking.experience_title}`,
    updated_at: now
  };

  if (conversionStatus === 'accepted') {
    record.accepted_at = now;
  }

  const query = existing?.id
    ? supabase.from('upsell_conversions').update(record).eq('id', existing.id)
    : supabase.from('upsell_conversions').insert(record);

  const { data, error } = await query.select('*').single();

  if (error) {
    if (error.message?.includes('upsell_conversions')) return null;
    throw error;
  }

  return data;
};
