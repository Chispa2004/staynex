import { UbikosAdapter } from '../src/services/pms/adapters/ubikos.adapter.js';
import { createPmsConnector } from '../src/integrations/pms/registry.js';
import {
  normalizeUbikosFolio,
  normalizeUbikosGuest,
  normalizeUbikosReservation,
  normalizeUbikosRoom
} from '../src/services/pms/normalizers/ubikos.normalizer.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const adapter = new UbikosAdapter({
  config: {
    enabled: false,
    sandbox: true,
    readOnly: true
  }
});

const health = await adapter.getConnectionHealth();

assert(health.provider === 'ubikos', 'Health check should identify Ubikos');
assert(health.status === 'not_configured', 'Ubikos should be not_configured without credentials');
assert(health.sandbox === true, 'Ubikos phase 1 should run in sandbox by default');
assert(health.readOnly === true, 'Ubikos phase 1 should be read-only');
assert(health.warnings.includes('credentials_missing'), 'Health check should warn about missing credentials');

const reservations = await adapter.searchReservations({ query: 'Cristian' });
assert(reservations.length === 1, 'Sandbox search should find Cristian reservation');
assert(reservations[0].reservation_id === '53108', 'Reservation 53108 should normalize correctly');
assert(reservations[0].guest_name === 'Cristian Cabre', 'Guest holder should normalize correctly');
assert(reservations[0].room_number === '302', 'Room 302 should normalize correctly');
assert(reservations[0].status === 'confirmed', 'CONFIRMADA should map to confirmed');
assert(reservations[0].balance_due === -188, 'Balance due should preserve observed Ubikos value');

const reservation = await adapter.getReservationDetails('53108');
assert(reservation.room_type === 'Vista mar DOUBLE ROOM', 'Reservation detail should expose room type');

const arrivals = await adapter.getArrivalsToday({ date: '2026-05-28' });
assert(arrivals.some((item) => item.reservation_id === '53108'), 'Arrivals today should include reservation 53108');

const departures = await adapter.getDeparturesToday({ date: '2026-05-28' });
assert(departures.some((item) => item.reservation_id === 'UBK-DEP-20260528-01'), 'Departures today should include checkout mock');

const inHouse = await adapter.getInHouseGuests();
assert(inHouse.some((item) => item.room_number === '203' && item.guest_name === 'Gregorio Pelai'), 'In-house guests should include room 203');

const rooms = await adapter.getRooms();
assert(rooms.some((room) => room.room_number === '308' && room.status === 'blocked'), 'Room 308 should normalize retained status as blocked');
assert(rooms.some((room) => room.room_number === '308' && room.maintenance_status === 'maintenance'), 'Room 308 should flag maintenance/blocked context');

const roomStatus = await adapter.getRoomStatus('308');
assert(roomStatus.incidents.includes('olor tabaco'), 'Room 308 should keep tobacco smell incident');

const roomSummary = await adapter.getRoomStatus();
assert(roomSummary.hotel_status.total_rooms === 42, 'Hotel status should expose total rooms');
assert(roomSummary.hotel_status.occupied_rooms === 24, 'Hotel status should expose occupied rooms');

const guest = await adapter.getGuestProfile('guest-inhouse-203');
assert(guest.name === 'Gregorio Pelai', 'Guest profile should normalize in-house guest');
assert(Array.isArray(guest.preferences), 'Guest preferences should normalize as array');

const folio = await adapter.getFolioSummary('53108');
assert(folio.available === true, 'Folio should be available from sandbox data');
assert(folio.outstandingBalance === -188, 'Folio should preserve negative observed pending amount');
assert(folio.lineItems.length === 1, 'Folio should include charges');
assert(folio.warnings.includes('negative_balance_observed_in_ubikos_mock'), 'Folio should keep warnings');

const missingReservation = normalizeUbikosReservation({});
assert(missingReservation.warnings.includes('reservation_id_missing'), 'Missing reservation id should warn');
assert(missingReservation.warnings.includes('guest_name_missing'), 'Missing guest name should warn');

const missingGuest = normalizeUbikosGuest({});
assert(missingGuest.warnings.includes('guest_id_missing'), 'Missing guest id should warn');

const missingRoom = normalizeUbikosRoom({});
assert(missingRoom.warnings.includes('room_number_missing'), 'Missing room number should warn');

const missingFolio = normalizeUbikosFolio({});
assert(missingFolio.warnings.includes('reservation_id_missing'), 'Missing folio reservation should warn');
assert(missingFolio.warnings.includes('folio_charges_missing'), 'Missing folio charges should warn');

const blockedAdapter = new UbikosAdapter({
  config: {
    enabled: true,
    sandbox: true,
    readOnly: false
  }
});

let blocked = false;
try {
  await blockedAdapter.searchReservations();
} catch (error) {
  blocked = error.code === 'UBIKOS_WRITE_MODE_NOT_ALLOWED';
}
assert(blocked, 'Adapter should fail closed if read-only mode is disabled');

const connector = createPmsConnector('ubikos', {
  config: {
    enabled: false,
    sandbox: true,
    readOnly: true
  }
});
assert(connector, 'Ubikos connector should be registered');
const connectorHealth = await connector.healthCheck();
assert(connectorHealth.provider === 'ubikos', 'Registered connector should delegate health check to adapter');
const connectorFolio = await connector.getGuestFolioSummary({ reservationId: '53108' });
assert(connectorFolio.available, 'Registered connector should expose folio summary');

const syncPreview = await connector.syncReservations();
assert(syncPreview.skipped && syncPreview.readOnly, 'Sync should remain disabled/read-only in phase 1');

console.log(JSON.stringify({
  ok: true,
  health,
  reservation: reservations[0],
  room308: roomStatus,
  folio
}, null, 2));
