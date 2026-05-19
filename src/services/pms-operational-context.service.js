import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const isMissingPmsIntelligenceSchema = (error) => (
  error?.message?.includes('pms_operational_events')
  || error?.message?.includes('room_status_snapshots')
  || error?.message?.includes('hotel_occupancy_snapshots')
  || error?.message?.includes('guest_stay_context')
  || error?.message?.includes('pms_intelligence_logs')
  || error?.details?.includes('pms_operational_events')
  || error?.details?.includes('room_status_snapshots')
  || error?.details?.includes('hotel_occupancy_snapshots')
  || error?.details?.includes('guest_stay_context')
  || error?.details?.includes('pms_intelligence_logs')
);

const safeDb = async (operation, fallback, label) => {
  try {
    return await operation();
  } catch (error) {
    if (isMissingPmsIntelligenceSchema(error)) {
      logger.warn('pms_intelligence_schema_missing', {
        label,
        message: error.message
      });
      return fallback;
    }

    throw error;
  }
};

const maybeSingleData = async (query, label) => safeDb(async () => {
  const { data, error } = await query;
  if (error) throw error;
  return data || null;
}, null, label);

const rowsData = async (query, label) => safeDb(async () => {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}, [], label);

export const createOperationalEvent = async ({
  hotelId,
  reservationId = null,
  guestId = null,
  roomNumber = null,
  eventType,
  eventSource = 'pms_intelligence',
  eventPayload = {},
  occurredAt = new Date().toISOString(),
  processedAt = null,
  supabase = getSupabase()
}) => {
  if (!hotelId || !eventType) {
    return null;
  }

  return safeDb(async () => {
    const { data, error } = await supabase
      .from('pms_operational_events')
      .insert({
        hotel_id: hotelId,
        reservation_id: reservationId,
        guest_id: guestId,
        room_number: roomNumber,
        event_type: eventType,
        event_source: eventSource,
        event_payload: eventPayload,
        occurred_at: occurredAt,
        processed_at: processedAt
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }, null, 'create_operational_event');
};

export const upsertGuestStayContext = async ({
  context,
  supabase = getSupabase()
}) => {
  if (!context?.hotel_id || !context?.reservation_id) {
    return null;
  }

  return safeDb(async () => {
    const { data, error } = await supabase
      .from('guest_stay_context')
      .upsert({
        ...context,
        last_updated_at: new Date().toISOString()
      }, { onConflict: 'reservation_id' })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }, null, 'upsert_guest_stay_context');
};

export const upsertRoomStatusSnapshot = async ({
  snapshot,
  supabase = getSupabase()
}) => {
  if (!snapshot?.hotel_id || !snapshot?.room_number) {
    return null;
  }

  return safeDb(async () => {
    const { data, error } = await supabase
      .from('room_status_snapshots')
      .upsert({
        ...snapshot,
        last_updated_at: new Date().toISOString()
      }, { onConflict: 'hotel_id,room_number' })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }, null, 'upsert_room_status_snapshot');
};

export const upsertOccupancySnapshot = async ({
  snapshot,
  supabase = getSupabase()
}) => {
  if (!snapshot?.hotel_id || !snapshot?.date) {
    return null;
  }

  return safeDb(async () => {
    const { data, error } = await supabase
      .from('hotel_occupancy_snapshots')
      .upsert(snapshot, { onConflict: 'hotel_id,date' })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }, null, 'upsert_occupancy_snapshot');
};

export const createPmsIntelligenceLog = async ({
  hotelId,
  guestId = null,
  reservationId = null,
  logType,
  confidence = null,
  inputPayload = {},
  outputContext = {},
  supabase = getSupabase()
}) => {
  if (!hotelId || !logType) {
    return null;
  }

  return safeDb(async () => {
    const { data, error } = await supabase
      .from('pms_intelligence_logs')
      .insert({
        hotel_id: hotelId,
        guest_id: guestId,
        reservation_id: reservationId,
        log_type: logType,
        confidence,
        input_payload: inputPayload,
        output_context: outputContext
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }, null, 'create_pms_intelligence_log');
};

export const getOperationalContextForGuest = async ({
  hotelId,
  guestId = null,
  reservationId = null,
  supabase = getSupabase()
}) => {
  if (!hotelId || (!guestId && !reservationId)) {
    return null;
  }

  let query = supabase
    .from('guest_stay_context')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('last_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reservationId) {
    query = supabase
      .from('guest_stay_context')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  } else if (guestId) {
    query = supabase
      .from('guest_stay_context')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('guest_id', guestId)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  return maybeSingleData(query, 'get_operational_context_for_guest');
};

export const getOperationalContextForRoom = async ({
  hotelId,
  roomNumber,
  supabase = getSupabase()
}) => {
  if (!hotelId || !roomNumber) {
    return null;
  }

  return maybeSingleData(
    supabase
      .from('room_status_snapshots')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('room_number', String(roomNumber))
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'get_operational_context_for_room'
  );
};

export const getLatestOccupancySnapshot = async ({
  hotelId,
  supabase = getSupabase()
}) => {
  if (!hotelId) {
    return null;
  }

  return maybeSingleData(
    supabase
      .from('hotel_occupancy_snapshots')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'get_latest_occupancy_snapshot'
  );
};

export const getHotelOperationalSummary = async ({
  hotelId,
  supabase = getSupabase()
}) => {
  if (!hotelId) {
    return {
      occupancy: null,
      rooms: {
        total: 0,
        ready: 0,
        dirty: 0,
        maintenance: 0,
        occupied: 0
      },
      vipGuests: 0,
      upgradeOpportunities: 0
    };
  }

  const [occupancy, rooms, stayContexts] = await Promise.all([
    getLatestOccupancySnapshot({ hotelId, supabase }),
    rowsData(
      supabase
        .from('room_status_snapshots')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('last_updated_at', { ascending: false })
        .limit(500),
      'summary_room_statuses'
    ),
    rowsData(
      supabase
        .from('guest_stay_context')
        .select('*')
        .eq('hotel_id', hotelId)
        .in('stay_phase', ['in_house', 'pre_checkout'])
        .limit(500),
      'summary_stay_contexts'
    )
  ]);

  return {
    occupancy,
    rooms: {
      total: rooms.length,
      ready: rooms.filter((room) => room.housekeeping_status === 'clean' || room.housekeeping_status === 'inspected').length,
      dirty: rooms.filter((room) => room.housekeeping_status === 'dirty').length,
      maintenance: rooms.filter((room) => ['maintenance', 'out_of_order'].includes(room.maintenance_status)).length,
      occupied: rooms.filter((room) => room.occupancy_status === 'occupied').length
    },
    vipGuests: stayContexts.filter((context) => Number(context.vip_score || 0) >= 70).length,
    upgradeOpportunities: stayContexts.filter((context) => context.upgrade_eligible).length,
    lateCheckoutEligible: stayContexts.filter((context) => context.late_checkout_eligible).length
  };
};
