import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';
import {
  createOperationalEvent,
  createPmsIntelligenceLog,
  getHotelOperationalSummary,
  getLatestOccupancySnapshot,
  getOperationalContextForGuest,
  getOperationalContextForRoom,
  upsertGuestStayContext,
  upsertOccupancySnapshot,
  upsertRoomStatusSnapshot
} from './pms-operational-context.service.js';
import { dateKey, detectCheckinEvents, detectCheckoutTomorrow, determineStayPhase, daysBetweenDates } from './pms-checkin.service.js';
import { inferRoomStatusFromReservation } from './pms-room-status.service.js';
import { getOccupancyContext, syncOccupancySnapshot } from './pms-occupancy.service.js';
import { detectRevenueSignals } from './pms-revenue-context.service.js';

const isSchemaMissing = (error) => (
  error?.message?.includes('guest_stay_context')
  || error?.message?.includes('room_status_snapshots')
  || error?.message?.includes('hotel_occupancy_snapshots')
  || error?.message?.includes('pms_intelligence_logs')
);

const safeRows = async (query, label) => {
  const { data, error } = await query;

  if (error) {
    if (isSchemaMissing(error)) {
      logger.warn('pms_intelligence_schema_missing', { label, message: error.message });
      return [];
    }

    throw error;
  }

  return data || [];
};

export const buildGuestStayContextFromReservation = ({
  reservation = {},
  occupancy = null,
  guestMemory = [],
  now = new Date()
} = {}) => {
  const arrival = dateKey(reservation.arrival_date);
  const departure = dateKey(reservation.departure_date);
  const stayPhase = determineStayPhase(reservation, now);
  const revenueSignals = detectRevenueSignals({
    reservation,
    occupancy,
    guestMemory,
    now
  });

  return {
    hotel_id: reservation.hotel_id || reservation.hotelId || null,
    guest_id: reservation.guest_id || reservation.guestId || null,
    reservation_id: reservation.id || reservation.reservation_id || null,
    room_number: reservation.room_number || reservation.current_room || reservation.roomNumber || null,
    room_type: reservation.room_type || null,
    rate_plan: reservation.rate_plan || null,
    arrival_date: arrival,
    departure_date: departure,
    checked_in_at: stayPhase === 'in_house' || stayPhase === 'pre_checkout' ? reservation.checked_in_at || null : null,
    checked_out_at: stayPhase === 'checked_out' ? reservation.checked_out_at || null : null,
    nights: arrival && departure ? Math.max(0, daysBetweenDates(arrival, departure)) : null,
    adults: Number.isFinite(Number(reservation.adults)) ? Number(reservation.adults) : null,
    children: Number.isFinite(Number(reservation.children)) ? Number(reservation.children) : null,
    language: reservation.language || reservation.guest_language || null,
    country: reservation.country || reservation.guest_country || null,
    vip_score: revenueSignals.vipScore,
    stay_phase: stayPhase,
    revenue_potential: revenueSignals.revenuePotential,
    upgrade_eligible: revenueSignals.upgradeEligible,
    late_checkout_eligible: revenueSignals.lateCheckoutEligible,
    transfer_likely: revenueSignals.transferLikely,
    experience_likely: revenueSignals.experienceLikely,
    raw_payload: {
      source: 'reservation',
      pms_provider: reservation.pms_provider || null,
      pms_reservation_id: reservation.pms_reservation_id || null,
      status: reservation.status || null
    }
  };
};

export const persistReservationOperationalContext = async ({
  reservation,
  previousContext = null,
  occupancy = null,
  guestMemory = [],
  now = new Date(),
  supabase = getSupabase()
} = {}) => {
  if (!reservation?.hotel_id || !reservation?.id) {
    return {
      context: null,
      events: [],
      roomStatus: null
    };
  }

  const context = buildGuestStayContextFromReservation({
    reservation,
    occupancy,
    guestMemory,
    now
  });
  const savedContext = await upsertGuestStayContext({ context, supabase });
  const roomStatus = inferRoomStatusFromReservation(reservation, now);
  const savedRoomStatus = roomStatus
    ? await upsertRoomStatusSnapshot({
      snapshot: {
        hotel_id: reservation.hotel_id,
        ...roomStatus
      },
      supabase
    })
    : null;
  const checkinEvents = detectCheckinEvents(reservation, previousContext, now);
  const checkoutTomorrow = detectCheckoutTomorrow(reservation, now);
  const revenueEvents = [
    context.vip_score >= 70 ? { event_type: 'vip_guest_detected', confidence: context.vip_score / 100, reason: 'vip_score_threshold' } : null,
    context.upgrade_eligible ? { event_type: 'upgrade_opportunity_detected', confidence: 0.72, reason: 'room_and_occupancy_context' } : null,
    checkoutTomorrow.matches ? { event_type: 'checkout_tomorrow', confidence: checkoutTomorrow.confidence, reason: 'departure_date_tomorrow' } : null
  ].filter(Boolean);
  const events = [...checkinEvents, ...revenueEvents];

  for (const event of events) {
    await createOperationalEvent({
      hotelId: reservation.hotel_id,
      reservationId: reservation.id,
      guestId: reservation.guest_id,
      roomNumber: context.room_number,
      eventType: event.event_type,
      eventSource: 'pms_intelligence',
      eventPayload: {
        reason: event.reason,
        stay_phase: context.stay_phase,
        vip_score: context.vip_score,
        revenue_potential: context.revenue_potential
      },
      occurredAt: now.toISOString(),
      processedAt: now.toISOString(),
      supabase
    });
  }

  await createPmsIntelligenceLog({
    hotelId: reservation.hotel_id,
    guestId: reservation.guest_id,
    reservationId: reservation.id,
    logType: 'guest_stay_context_built',
    confidence: 0.82,
    inputPayload: { reservation_id: reservation.id, pms_provider: reservation.pms_provider },
    outputContext: context,
    supabase
  });

  return {
    context: savedContext || context,
    events,
    roomStatus: savedRoomStatus || roomStatus
  };
};

export const buildPmsIntelligenceContext = async ({
  hotelId,
  guestId = null,
  reservationId = null,
  roomNumber = null,
  reservation = null,
  supabase = getSupabase()
} = {}) => {
  if (!hotelId) {
    return {
      stayPhase: null,
      roomStatus: null,
      occupancy: null,
      vipScore: 0,
      revenuePotential: 0,
      upgradeEligible: false,
      lateCheckoutEligible: false,
      transferLikely: false,
      experienceLikely: false,
      operationalWarnings: ['missing_hotel_context'],
      recommendedActions: []
    };
  }

  const [stayContext, roomStatus, occupancySnapshot, summary] = await Promise.all([
    getOperationalContextForGuest({ hotelId, guestId, reservationId, supabase }),
    getOperationalContextForRoom({ hotelId, roomNumber: roomNumber || reservation?.room_number || reservation?.current_room, supabase }),
    getLatestOccupancySnapshot({ hotelId, supabase }),
    getHotelOperationalSummary({ hotelId, supabase })
  ]);
  const fallbackContext = reservation
    ? buildGuestStayContextFromReservation({
      reservation: {
        ...reservation,
        hotel_id: hotelId,
        guest_id: guestId || reservation.guest_id
      },
      occupancy: occupancySnapshot
    })
    : null;
  const context = stayContext || fallbackContext || {};
  const occupancy = getOccupancyContext(occupancySnapshot);
  const warnings = [
    !stayContext && reservation ? 'guest_stay_context_fallback_from_reservation' : null,
    !roomStatus ? 'room_status_unknown' : null,
    !occupancy ? 'occupancy_unknown' : null,
    roomStatus?.maintenance_status === 'maintenance' ? 'room_in_maintenance' : null,
    roomStatus?.maintenance_status === 'out_of_order' ? 'room_out_of_order' : null,
    roomStatus?.housekeeping_status === 'dirty' ? 'room_dirty' : null
  ].filter(Boolean);
  const recommendedActions = [
    context.stay_phase === 'pre_checkout' && context.late_checkout_eligible ? 'offer_late_checkout' : null,
    context.upgrade_eligible ? 'offer_upgrade' : null,
    roomStatus?.housekeeping_status === 'dirty' ? 'check_room_status_before_reply' : null,
    roomStatus?.maintenance_status === 'maintenance' ? 'escalate_to_maintenance' : null,
    Number(context.vip_score || 0) >= 70 ? 'vip_follow_up' : null
  ].filter(Boolean);

  return {
    stayPhase: context.stay_phase || null,
    roomStatus: roomStatus ? {
      roomNumber: roomStatus.room_number,
      roomType: roomStatus.room_type,
      housekeepingStatus: roomStatus.housekeeping_status,
      maintenanceStatus: roomStatus.maintenance_status,
      occupancyStatus: roomStatus.occupancy_status,
      lastUpdatedAt: roomStatus.last_updated_at
    } : null,
    occupancy,
    vipScore: Number(context.vip_score || 0),
    revenuePotential: Number(context.revenue_potential || 0),
    upgradeEligible: Boolean(context.upgrade_eligible),
    lateCheckoutEligible: Boolean(context.late_checkout_eligible),
    transferLikely: Boolean(context.transfer_likely),
    experienceLikely: Boolean(context.experience_likely),
    operationalWarnings: warnings,
    recommendedActions,
    guestStayContext: context,
    hotelSummary: summary
  };
};

export const runPmsIntelligenceRefresh = async ({
  hotelId = null,
  dryRun = false,
  now = new Date(),
  supabase = getSupabase()
} = {}) => {
  let reservationsQuery = supabase
    .from('reservations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (hotelId) {
    reservationsQuery = reservationsQuery.eq('hotel_id', hotelId);
  }

  const reservations = await safeRows(reservationsQuery, 'pms_intelligence_reservations');
  const hotelIds = [...new Set(reservations.map((reservation) => reservation.hotel_id).filter(Boolean))];
  const summary = {
    dryRun,
    reservationsScanned: reservations.length,
    guestContextsUpserted: 0,
    roomSnapshotsUpserted: 0,
    occupancySnapshotsUpserted: 0,
    eventsCreated: 0,
    logsCreated: 0,
    hotels: {}
  };

  for (const currentHotelId of hotelIds) {
    const hotelReservations = reservations.filter((reservation) => reservation.hotel_id === currentHotelId);
    const occupancySnapshot = syncOccupancySnapshot({
      hotelId: currentHotelId,
      reservations: hotelReservations,
      date: now
    });

    summary.hotels[currentHotelId] = {
      reservations: hotelReservations.length,
      occupancy: occupancySnapshot
    };

    if (!dryRun) {
      await upsertOccupancySnapshot({ snapshot: occupancySnapshot, supabase });
      summary.occupancySnapshotsUpserted += 1;
    }

    for (const reservation of hotelReservations) {
      const context = buildGuestStayContextFromReservation({
        reservation,
        occupancy: occupancySnapshot,
        now
      });
      const roomStatus = inferRoomStatusFromReservation(reservation, now);
      const checkinEvents = detectCheckinEvents(reservation, null, now);
      const checkoutTomorrow = detectCheckoutTomorrow(reservation, now);
      const events = [
        ...checkinEvents,
        checkoutTomorrow.matches ? { event_type: 'checkout_tomorrow', confidence: checkoutTomorrow.confidence, reason: 'departure_date_tomorrow' } : null,
        context.vip_score >= 70 ? { event_type: 'vip_guest_detected', confidence: context.vip_score / 100, reason: 'vip_score_threshold' } : null,
        context.upgrade_eligible ? { event_type: 'upgrade_opportunity_detected', confidence: 0.72, reason: 'room_and_occupancy_context' } : null
      ].filter(Boolean);

      if (dryRun) {
        summary.guestContextsUpserted += 1;
        if (roomStatus) summary.roomSnapshotsUpserted += 1;
        summary.eventsCreated += events.length;
        summary.logsCreated += 1;
        continue;
      }

      await upsertGuestStayContext({ context, supabase });
      summary.guestContextsUpserted += 1;

      if (roomStatus) {
        await upsertRoomStatusSnapshot({
          snapshot: { hotel_id: reservation.hotel_id, ...roomStatus },
          supabase
        });
        summary.roomSnapshotsUpserted += 1;
      }

      for (const event of events) {
        await createOperationalEvent({
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          guestId: reservation.guest_id,
          roomNumber: context.room_number,
          eventType: event.event_type,
          eventPayload: {
            reason: event.reason,
            dry_run: false,
            stay_phase: context.stay_phase,
            vip_score: context.vip_score
          },
          occurredAt: now.toISOString(),
          processedAt: now.toISOString(),
          supabase
        });
        summary.eventsCreated += 1;
      }

      await createPmsIntelligenceLog({
        hotelId: reservation.hotel_id,
        guestId: reservation.guest_id,
        reservationId: reservation.id,
        logType: 'pms_intelligence_job_context',
        confidence: 0.82,
        inputPayload: { reservation_id: reservation.id },
        outputContext: context,
        supabase
      });
      summary.logsCreated += 1;
    }
  }

  logger.info('pms_intelligence_refresh_completed', summary);
  return summary;
};
