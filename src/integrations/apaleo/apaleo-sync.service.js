import { scheduleReservationAutomations } from '../../services/automation.service.js';
import { createOrUpdateReservation } from '../../services/reservation.service.js';
import { logger } from '../../utils/logger.js';
import { decryptSecret } from '../../utils/encryption.js';
import { getReservations } from './apaleo-reservations.service.js';
import { normalizeApaleoReservation } from './apaleo-normalizer.service.js';
import {
  getPmsBatchSize,
  getPmsMaxReservations
} from '../../services/scalability-guard.service.js';

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
  connection = null,
  pageSize = getPmsBatchSize(),
  maxReservations = getPmsMaxReservations()
} = {}) => {
  const config = connectionToConfig(connection);
  const batchSize = Math.max(1, Number(pageSize) || getPmsBatchSize());
  const reservationLimit = Math.max(1, Number(maxReservations) || getPmsMaxReservations());

  logger.info('Apaleo sync started', {
    hotelId,
    from,
    to,
    status: status || 'any',
    batchSize,
    maxReservations: reservationLimit
  });
  const rawReservations = await getReservations({
    from,
    to,
    status,
    config,
    pageSize: batchSize,
    maxReservations: reservationLimit
  });
  logger.info('Apaleo reservations fetched', {
    count: rawReservations.length
  });
  const summary = {
    fetched: rawReservations.length,
    synced: 0,
    skipped: 0,
    errors: [],
    totalFetched: rawReservations.length,
    totalProcessed: 0,
    totalInserted: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    batchSize,
    maxReservations: reservationLimit,
    batches: [],
    lastSyncedAt: null
  };

  for (let offset = 0; offset < rawReservations.length; offset += batchSize) {
    const batch = rawReservations.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;
    const batchSummary = {
      batchNumber,
      size: batch.length,
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };

    logger.info('Apaleo reservations batch processing started', {
      hotelId,
      batchNumber,
      size: batch.length,
      totalFetched: rawReservations.length
    });

    for (const rawReservation of batch) {
      const normalized = normalizeApaleoReservation(rawReservation);
      summary.totalProcessed += 1;
      batchSummary.processed += 1;

      if (!normalized?.pms_reservation_id) {
        summary.skipped += 1;
        summary.totalSkipped += 1;
        batchSummary.skipped += 1;
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
        const createdAt = reservation?.created_at ? new Date(reservation.created_at).getTime() : null;
        const updatedAt = reservation?.updated_at ? new Date(reservation.updated_at).getTime() : null;
        const looksUpdated = createdAt && updatedAt && Math.abs(updatedAt - createdAt) > 1000;

        if (looksUpdated) {
          summary.totalUpdated += 1;
          batchSummary.updated += 1;
        } else {
          summary.totalInserted += 1;
          batchSummary.inserted += 1;
        }

        summary.synced += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.totalSkipped += 1;
        batchSummary.skipped += 1;
        batchSummary.errors += 1;
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

    summary.lastSyncedAt = new Date().toISOString();
    summary.batches.push(batchSummary);

    logger.info('Apaleo reservations batch processed', {
      hotelId,
      ...batchSummary,
      totalProcessed: summary.totalProcessed,
      totalInserted: summary.totalInserted,
      totalUpdated: summary.totalUpdated,
      totalSkipped: summary.totalSkipped
    });
  }

  logger.info('Apaleo reservations normalized and synced', {
    fetched: summary.fetched,
    synced: summary.synced,
    skipped: summary.skipped,
    errors: summary.errors.length,
    batches: summary.batches.length
  });
  logger.info('Apaleo reservations sync completed', summary);
  return summary;
};
