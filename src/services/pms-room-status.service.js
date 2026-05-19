import { dateKey } from './pms-checkin.service.js';

const normalize = (value) => String(value || '').trim().toLowerCase();

export const normalizeRoomStatus = (room = {}) => {
  const housekeepingRaw = normalize(room.housekeeping_status || room.housekeepingStatus || room.cleaningStatus || room.status);
  const maintenanceRaw = normalize(room.maintenance_status || room.maintenanceStatus || room.outOfOrderStatus);
  const occupancyRaw = normalize(room.occupancy_status || room.occupancyStatus || room.occupancy);

  const housekeeping_status = ['clean', 'inspected'].includes(housekeepingRaw)
    ? housekeepingRaw
    : ['dirty', 'unclean', 'needs_cleaning', 'departure'].includes(housekeepingRaw)
      ? 'dirty'
      : 'unknown';
  const maintenance_status = ['maintenance', 'out_of_order'].includes(maintenanceRaw)
    ? maintenanceRaw
    : ['ooo', 'blocked'].includes(maintenanceRaw)
      ? 'out_of_order'
      : maintenanceRaw === 'ok' || maintenanceRaw === 'available'
        ? 'ok'
        : 'unknown';
  const occupancy_status = ['occupied', 'vacant', 'arriving', 'departing'].includes(occupancyRaw)
    ? occupancyRaw
    : 'unknown';

  return {
    room_number: String(room.room_number || room.roomNumber || room.unitName || room.unitId || '').trim() || null,
    room_type: room.room_type || room.roomType || room.unitGroup || null,
    housekeeping_status,
    maintenance_status,
    occupancy_status,
    current_guest_id: room.current_guest_id || room.currentGuestId || null,
    current_reservation_id: room.current_reservation_id || room.currentReservationId || null,
    next_arrival_at: room.next_arrival_at || room.nextArrivalAt || null,
    last_cleaned_at: room.last_cleaned_at || room.lastCleanedAt || null,
    raw_payload: room.raw_payload || room.rawPayload || room
  };
};

export const inferRoomStatusFromReservation = (reservation = {}, now = new Date()) => {
  const today = dateKey(now);
  const arrival = dateKey(reservation.arrival_date);
  const departure = dateKey(reservation.departure_date);
  const status = String(reservation.status || '').toLowerCase();
  const roomNumber = reservation.room_number || reservation.current_room || reservation.roomNumber || null;

  if (!roomNumber) {
    return null;
  }

  let occupancyStatus = 'unknown';

  if (status === 'in_house' || (arrival && departure && today >= arrival && today < departure)) {
    occupancyStatus = departure === today ? 'departing' : 'occupied';
  } else if (arrival === today) {
    occupancyStatus = 'arriving';
  } else if (departure && today >= departure) {
    occupancyStatus = 'vacant';
  }

  return normalizeRoomStatus({
    room_number: roomNumber,
    room_type: reservation.room_type,
    housekeeping_status: occupancyStatus === 'departing' ? 'dirty' : 'unknown',
    maintenance_status: 'unknown',
    occupancy_status: occupancyStatus,
    current_guest_id: occupancyStatus === 'occupied' || occupancyStatus === 'departing' ? reservation.guest_id : null,
    current_reservation_id: reservation.id,
    raw_payload: {
      source: 'reservation_fallback',
      reservation_id: reservation.id,
      pms_provider: reservation.pms_provider
    }
  });
};

export const detectHousekeepingDelay = (roomStatus = {}, now = new Date()) => {
  const status = normalizeRoomStatus(roomStatus);
  const lastUpdated = status.raw_payload?.last_updated_at || roomStatus.last_updated_at || roomStatus.lastUpdatedAt;
  const updatedAt = lastUpdated ? new Date(lastUpdated) : null;
  const ageHours = updatedAt && !Number.isNaN(updatedAt.getTime())
    ? (now.getTime() - updatedAt.getTime()) / 3600000
    : null;

  return {
    delayed: status.housekeeping_status === 'dirty' && (ageHours === null || ageHours >= 3),
    ageHours,
    event_type: 'housekeeping_delay_detected',
    confidence: status.housekeeping_status === 'dirty' ? 0.7 : 0
  };
};

export const syncRoomStatuses = (rooms = []) => rooms
  .map(normalizeRoomStatus)
  .filter((room) => room.room_number);
