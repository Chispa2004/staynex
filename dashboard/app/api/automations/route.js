import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import {
  DEFAULT_INTELLIGENT_AUTOMATIONS,
  calculateAutomationCenterMetrics,
  isMissingAutomationEngineTables,
  mergeAutomationDefaults,
  normalizeAutomationForInsert
} from '@/lib/automation-engine';

const isMissingAutomationTables = (error) => (
  error?.message?.includes('automation_rules')
  || error?.message?.includes('scheduled_messages')
  || error?.details?.includes('automation_rules')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('automation_rules')
  || error?.hint?.includes('scheduled_messages')
  || isMissingAutomationEngineTables(error)
);

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (!isMissingAutomationTables(error)) {
      throw error;
    }

    return fallback;
  }

  return data || fallback;
};

const safeQuery = async (query, fallback = []) => {
  try {
    return await safeRows(query, fallback);
  } catch (error) {
    if (isMissingAutomationTables(error)) {
      return fallback;
    }

    throw error;
  }
};

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'automations')) {
      return NextResponse.json({ hotel, scheduledMessages: [], rules: [], error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ hotel, hotelId: null, scheduledMessages: [], rules: [] });
    }

    let migrationRequired = false;
    const optionalEngineRows = async (query) => {
      const { data, error } = await query;

      if (error) {
        if (isMissingAutomationEngineTables(error)) {
          migrationRequired = true;
          return [];
        }

        throw error;
      }

      return data || [];
    };

    const [scheduledMessages, rules, engineAutomations, automationRuns] = await Promise.all([
      safeQuery(supabase
        .from('scheduled_messages')
        .select('*')
        .eq('hotel_id', hotel.id)
        .order('scheduled_for', { ascending: false })
        .limit(150)),
      safeQuery(supabase
        .from('automation_rules')
        .select('*')
        .eq('hotel_id', hotel.id)
        .order('automation_type', { ascending: true })),
      optionalEngineRows(supabase
        .from('automations')
        .select('*')
        .eq('hotel_id', hotel.id)
        .order('created_at', { ascending: true })),
      optionalEngineRows(supabase
        .from('automation_runs')
        .select('*')
        .eq('hotel_id', hotel.id)
        .order('created_at', { ascending: false })
        .limit(250))
    ]);

    const guestIds = [...new Set((scheduledMessages || []).map((item) => item.guest_id).filter(Boolean))];
    const reservationIds = [...new Set((scheduledMessages || []).map((item) => item.reservation_id).filter(Boolean))];

    const [{ data: guests = [] }, { data: reservations = [] }] = await Promise.all([
      guestIds.length
        ? supabase.from('guests').select('id, phone_number, current_room').eq('hotel_id', hotel.id).in('id', guestIds)
        : Promise.resolve({ data: [] }),
      reservationIds.length
        ? supabase.from('reservations').select('id, pms_reservation_id, guest_name, arrival_date, departure_date').eq('hotel_id', hotel.id).in('id', reservationIds)
        : Promise.resolve({ data: [] })
    ]);

    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
    const automations = mergeAutomationDefaults(engineAutomations);
    const metrics = calculateAutomationCenterMetrics({
      automations,
      runs: automationRuns,
      scheduledMessages
    });

    return NextResponse.json({
      hotel,
      hotelId: hotel.id,
      rules: rules || [],
      automations,
      automationRuns,
      metrics,
      migrationRequired,
      scheduledMessages: (scheduledMessages || []).map((message) => ({
        ...message,
        guest: guestsById.get(message.guest_id) || null,
        reservation: reservationsById.get(message.reservation_id) || null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        scheduledMessages: [],
        rules: [],
        automations: DEFAULT_INTELLIGENT_AUTOMATIONS,
        automationRuns: [],
        error: error.message
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const { supabase, hotel, role, user } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'automations')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ ok: false, error: 'No hotel available' }, { status: 400 });
    }

    const body = await request.json();
    const automationType = body?.automationType || body?.type;
    const defaultAutomation = DEFAULT_INTELLIGENT_AUTOMATIONS.find((item) => item.type === automationType);

    if (!defaultAutomation) {
      return NextResponse.json({ ok: false, error: 'Unknown automation type' }, { status: 400 });
    }

    const automationRecord = {
      ...normalizeAutomationForInsert({
        hotelId: hotel.id,
        automation: defaultAutomation,
        userId: user?.id || null
      }),
      active: Boolean(body?.active)
    };

    const { data, error } = await supabase
      .from('automations')
      .upsert(automationRecord, { onConflict: 'hotel_id,type' })
      .select('*')
      .single();

    if (error) {
      if (isMissingAutomationTables(error)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Automation engine SQL migration required.',
            migrationRequired: true
          },
          { status: 409 }
        );
      }

      throw error;
    }

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel.id,
      automation: data
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
