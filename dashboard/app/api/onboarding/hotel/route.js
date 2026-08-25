import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
import {
  assertHotelIdMatchesContext,
  buildSafeLocationChangeAudit,
  confirmHotelTimezoneIntegrity,
  buildValidatedHotelProfileUpdate,
  isAuthorizedHotelLocationRole
} from '../../../../../shared/location/hotel-location-integrity.js';

const allowedFields = [
  'name',
  'brand_name',
  'country_code',
  'city',
  'timezone',
  'default_language',
  'check_in_time',
  'check_out_time',
  'address',
  'phone',
  'whatsapp_number',
  'description'
];

const cleanText = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

export async function PATCH(request) {
  try {
    const context = await getCurrentHotelForRequest(request);
    const { supabase, hotel, user, role, platformRole } = context;
    const body = await request.json().catch(() => ({}));
    assertHotelIdMatchesContext({ requestedHotelId: body.hotelId || body.hotel_id, currentHotelId: hotel?.id });

    if (context.fallback || !user?.id || !hotel?.id || !isAuthorizedHotelLocationRole({ role, platformRole })) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }

    if (body.action === 'confirm_timezone_integrity') {
      const { hotel: confirmedHotel, confirmation } = await confirmHotelTimezoneIntegrity({
        supabase,
        hotelId: hotel.id,
        body
      });

      const audit = buildSafeLocationChangeAudit({
        previousValues: confirmation.previousValues,
        newValues: confirmation.newValues,
        changedFields: confirmation.changedFields
      });

      await writeEnterpriseAuditLog({
        supabase,
        actor: user,
        actorRole: role,
        actorPlatformRole: platformRole,
        hotelId: hotel.id,
        action: 'hotel_timezone_integrity_confirmed',
        entityType: 'hotel',
        oldValues: audit.previous_values,
        newValues: audit.new_values,
        metadata: {
          event_type: 'hotel_timezone_integrity_confirmed',
          ...audit
        }
      });

      return NextResponse.json({
        ok: true,
        hotel: confirmedHotel
      });
    }

    const locationUpdate = buildValidatedHotelProfileUpdate({ body, existingHotel: hotel });
    const updates = allowedFields.reduce((payload, field) => {
      if (body[field] !== undefined) {
        payload[field] = cleanText(body[field]);
      }

      return payload;
    }, {
      updated_at: new Date().toISOString()
    });

    if (!updates.name) {
      delete updates.name;
    }

    Object.assign(updates, locationUpdate.updates);

    const { data, error } = await supabase
      .from('hotels')
      .update(updates)
      .eq('id', hotel.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (locationUpdate.changedLocationFields.length) {
      const audit = buildSafeLocationChangeAudit({
        previousValues: locationUpdate.previousValues,
        newValues: locationUpdate.newValues,
        changedFields: [...locationUpdate.changedLocationFields, 'timezone_integrity_status']
      });

      await writeEnterpriseAuditLog({
        supabase,
        actor: user,
        actorRole: role,
        actorPlatformRole: platformRole,
        hotelId: hotel.id,
        action: 'hotel_location_timezone_updated',
        entityType: 'hotel',
        oldValues: audit.previous_values,
        newValues: audit.new_values,
        metadata: {
          event_type: 'hotel_location_timezone_updated',
          ...audit
        }
      });
    }

    return NextResponse.json({
      ok: true,
      hotel: data
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not update hotel setup'
    }, { status: error.status || 400 });
  }
}
