import { scheduleReservationAutomations } from '../../services/automation.service.js';
import { createOrUpdateReservation } from '../../services/reservation.service.js';
import { logger } from '../../utils/logger.js';
import { decryptSecret } from '../../utils/encryption.js';
import { getReservations } from './apaleo-reservations.service.js';
import { normalizeApaleoReservation } from './apaleo-normalizer.service.js';

const connectionToConfig = (connection) => {
  if (!connection) {
    return null;
  }

  return {
    clientId: connection.client_id,
    clientSecret: decryptSecret(connection.encrypted_client_secret),
    accountCode: connection.account_code,
    baseUrl: connection.base_url || 'https://api.apaleo.com',
    scope: connection.metadata?.scope || ''
  };
};

export const syncReservationsFromApaleo = async ({
  hotelId,
  from,
  to,
  status,
  connection = null
} = {}) => {
  const config = connectionToConfig(connection);
  const rawReservations = await getReservations({
    from,
    to,
    status,
    config
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
