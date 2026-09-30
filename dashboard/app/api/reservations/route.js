import { parseOperationalFilter } from '../../../../shared/operational-metrics.js';
import { loadOperationalMetrics } from '@/lib/operational-metrics';
import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess, getPermissionsForRole } from '@/lib/permissions';

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const CANCELLED_RESERVATION_STATUSES = new Set(['cancelled', 'canceled', 'no_show', 'void']);
const COMPLETED_RESERVATION_STATUSES = new Set(['completed', 'checked_out', 'departed']);

const getJourneyStatus = (reservation) => {
  const today = getTodayKey();
  const rawStatus = String(reservation.status || '').toLowerCase();

  if (CANCELLED_RESERVATION_STATUSES.has(rawStatus)) {
    return 'cancelled';
  }

  if (COMPLETED_RESERVATION_STATUSES.has(rawStatus) || (reservation.departure_date && today > reservation.departure_date)) {
    return 'post_stay';
  }

  if (
    reservation.arrival_date
    && reservation.departure_date
    && today >= reservation.arrival_date
    && today <= reservation.departure_date
  ) {
    return 'in_house';
  }

  return 'pre_arrival';
};

export async function GET(request) {
  try {
    const { supabase, hotel, role, accessDenied } = await getCurrentHotelForRequest(request, { readOnly: true, includeDirectory: false });
    if (new URL(request.url).searchParams.get('view') === 'metrics') {
      if (accessDenied || !hotel?.id || !canAccess(role, 'reservations')) return NextResponse.json({error:'Acceso al hotel denegado.'},{status:403});
      const filter = parseOperationalFilter(new URL(request.url).searchParams, 'reservations');
      if (filter.hotelId && filter.hotelId !== hotel.id) return NextResponse.json({error:'Acceso al hotel denegado.'},{status:403});
      const {items,...metrics} = await loadOperationalMetrics({supabase,hotel,kind:'reservations',filter});
      return NextResponse.json({hotel,hotelId:hotel.id,role,reservations:items,metrics},{headers:{'Cache-Control':'no-store'}});
    }

    if (!canAccess(role, 'reservations')) {
      return NextResponse.json({ hotel, reservations: [], error: 'Access denied' }, { status: 403 });
    }

    let query = supabase
      .from('reservations')
      .select('*, automation_events(*)')
      .order('arrival_date', { ascending: true, nullsFirst: false })
      .limit(100);

    if (hotel?.id) {
      query = query.eq('hotel_id', hotel.id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const reservations = data || [];
    const guestIds = [...new Set(
      reservations
        .map((reservation) => reservation.guest_id)
        .filter(Boolean)
    )];
    let conversationsByGuestId = {};

    if (guestIds.length > 0) {
      let conversationsQuery = supabase
        .from('conversations')
        .select('id, guest_id, status, last_message_at, created_at')
        .in('guest_id', guestIds);

      if (hotel?.id) {
        conversationsQuery = conversationsQuery.eq('hotel_id', hotel.id);
      }

      const { data: conversations, error: conversationsError } = await conversationsQuery
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (conversationsError) {
        throw conversationsError;
      }

      conversationsByGuestId = (conversations || []).reduce((acc, conversation) => {
        if (!acc[conversation.guest_id]) {
          acc[conversation.guest_id] = conversation;
        }

        return acc;
      }, {});
    }

    return NextResponse.json({
      hotel,
      hotelId: hotel?.id || null,
      role,
      permissions: getPermissionsForRole(role),
      reservations: reservations.map((reservation) => {
        const linkedConversation = reservation.guest_id
          ? conversationsByGuestId[reservation.guest_id] || null
          : null;

        return {
          ...reservation,
          computedJourneyStatus: getJourneyStatus(reservation),
          linkedConversation,
          conversationId: linkedConversation?.id || null
        };
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        reservations: [],
        error: error.message
      },
      { status: error.status || 500 }
    );
  }
}
