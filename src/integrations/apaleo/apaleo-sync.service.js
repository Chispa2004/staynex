import { scheduleReservationAutomations } from '../../services/automation.service.js';
import { createOrUpdateReservation } from '../../services/reservation.service.js';
import { logger } from '../../utils/logger.js';
import { getReservations } from './apaleo-reservations.service.js';
import { normalizeApaleoReservation } from './apaleo-normalizer.service.js';

export const syncReservationsFromApaleo = async ({
  hotelId,
  from,
  to,
  status
} = {}) => {
  const rawReservations = await getReservations({
    from,
    to,
    status
  });
  const summary = {
    fetched: rawReservations.length,
    synced: 0,
    skipped: 0,
    errors: []
  };

  for (const rawReservation of rawReservations) {
    const normalized = normalizeApaleoReservation(rawReservation);

    if (!normalized?.pms_reservation_id) {
      summary.skipped += 1;
      summary.errors.push({
        pms_reservation_id: null,
        error: 'Reservation skipped: missing Apaleo reservation id'
      });
      continue;
    }

    try {
      const { reservation } = await createOrUpdateReservation({
        ...normalized,
        hotel_id: hotelId
      });

      await scheduleReservationAutomations(reservation);
      summary.synced += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({
        pms_reservation_id: normalized.pms_reservation_id,
        error: error.message
      });
      logger.warn('Apaleo reservation sync skipped one reservation', {
        pmsReservationId: normalized.pms_reservation_id,
        error: error.message
      });
    }
  }

  logger.info('Apaleo reservations sync completed', summary);
  return summary;
};
