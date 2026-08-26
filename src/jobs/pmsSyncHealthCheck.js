import { getSupabase } from '../services/supabase.service.js';
import { logger } from '../utils/logger.js';
import {
  pmsConnectionSelectForSurface,
  serializePmsConnectionsSafe
} from '../../shared/pms/safe-connection.js';

const PMS_HEALTH_CHECK_SELECT = pmsConnectionSelectForSurface('health');

const staleHours = () => {
  const parsed = Number(process.env.PMS_SYNC_STALE_HOURS || 24);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
};

const safeRows = async (query, label) => {
  const { data, error } = await query;

  if (error) {
    if (/does not exist|schema cache|column/i.test(error.message || error.details || '')) {
      logger.warn('pms_sync_health_schema_missing', {
        label,
        message: error.message
      });
      return [];
    }

    throw error;
  }

  return data || [];
};

export const pmsSyncHealthCheck = async () => {
  const supabase = getSupabase();
  const connections = await safeRows(
    supabase
      .from('hotel_pms_connections')
      .select(PMS_HEALTH_CHECK_SELECT)
      .order('updated_at', { ascending: false }),
    'hotel_pms_connections'
  );
  const safeConnections = serializePmsConnectionsSafe(connections, { surface: 'health' });
  const staleCutoff = Date.now() - staleHours() * 60 * 60 * 1000;
  const enabledConnections = safeConnections.filter((item) => item.enabled);
  const failed = enabledConnections.filter((item) => item.sync_status === 'failed' || item.last_sync_error);
  const stale = enabledConnections.filter((item) => {
    if (!item.last_sync_at) {
      return true;
    }

    return new Date(item.last_sync_at).getTime() < staleCutoff;
  });

  const summary = {
    jobName: 'pmsSyncHealthCheck',
    totalConnections: safeConnections.length,
    enabledConnections: enabledConnections.length,
    failedConnections: failed.length,
    staleConnections: stale.length,
    staleAfterHours: staleHours(),
    failed: failed.map((item) => ({
      id: item.id,
      hotelId: item.hotel_id,
      provider: item.provider,
      syncStatus: item.sync_status,
      lastSyncError: item.last_sync_error
    })),
    stale: stale.map((item) => ({
      id: item.id,
      hotelId: item.hotel_id,
      provider: item.provider,
      lastSyncAt: item.last_sync_at
    }))
  };

  logger.info('pms_sync_health_check_completed', summary);
  return summary;
};
