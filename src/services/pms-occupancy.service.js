import { dateKey } from './pms-checkin.service.js';

const uniqueRooms = (reservations = []) => new Set(
  reservations
    .map((reservation) => reservation.room_number || reservation.current_room || reservation.roomNumber)
    .filter(Boolean)
);

export const syncOccupancySnapshot = ({
  hotelId,
  reservations = [],
  rooms = [],
  date = new Date(),
  rawPayload = null
} = {}) => {
  const targetDate = dateKey(date);
  const activeReservations = reservations.filter((reservation) => {
    const arrival = dateKey(reservation.arrival_date);
    const departure = dateKey(reservation.departure_date);
    const status = String(reservation.status || '').toLowerCase();
    return status === 'in_house' || (arrival && departure && targetDate >= arrival && targetDate < departure);
  });
  const arrivalsToday = reservations.filter((reservation) => dateKey(reservation.arrival_date) === targetDate).length;
  const departuresToday = reservations.filter((reservation) => dateKey(reservation.departure_date) === targetDate).length;
  const occupiedRooms = uniqueRooms(activeReservations).size || activeReservations.length;
  const totalRooms = rooms.length || Math.max(uniqueRooms(reservations).size, occupiedRooms);
  const availableRooms = Math.max(0, totalRooms - occupiedRooms);
  const occupancyPercent = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : null;

  return {
    hotel_id: hotelId,
    date: targetDate,
    occupancy_percent: occupancyPercent,
    occupied_rooms: occupiedRooms,
    available_rooms: availableRooms,
    arrivals_today: arrivalsToday,
    departures_today: departuresToday,
    stayovers_today: Math.max(0, activeReservations.length - arrivalsToday - departuresToday),
    adr: null,
    revpar: null,
    raw_payload: rawPayload || {
      source: 'reservations_fallback',
      total_reservations: reservations.length,
      total_rooms_source: rooms.length ? 'room_status_snapshots' : 'reservation_room_numbers'
    }
  };
};

export const getOccupancyContext = (snapshot = null) => {
  if (!snapshot) {
    return null;
  }

  return {
    date: snapshot.date,
    occupancyPercent: snapshot.occupancy_percent ?? snapshot.occupancyPercent ?? null,
    occupiedRooms: snapshot.occupied_rooms ?? snapshot.occupiedRooms ?? 0,
    availableRooms: snapshot.available_rooms ?? snapshot.availableRooms ?? 0,
    arrivalsToday: snapshot.arrivals_today ?? snapshot.arrivalsToday ?? 0,
    departuresToday: snapshot.departures_today ?? snapshot.departuresToday ?? 0,
    stayoversToday: snapshot.stayovers_today ?? snapshot.stayoversToday ?? 0,
    adr: snapshot.adr ?? null,
    revpar: snapshot.revpar ?? null
  };
};

export const detectLowOccupancy = (snapshot = null, threshold = 45) => {
  const occupancy = Number(snapshot?.occupancy_percent ?? snapshot?.occupancyPercent);
  return Number.isFinite(occupancy) && occupancy < threshold;
};

export const detectHighOccupancy = (snapshot = null, threshold = 85) => {
  const occupancy = Number(snapshot?.occupancy_percent ?? snapshot?.occupancyPercent);
  return Number.isFinite(occupancy) && occupancy >= threshold;
};
