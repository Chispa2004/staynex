import { getSupabase } from '../services/supabase.service.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MESSAGE_BODY_RETENTION_DAYS = 90;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const safeRows = async (query, label) => {
  const { data, error } = await query;

  if (error) {
    if (/does not exist|schema cache|column/i.test(error.message || error.details || '')) {
      logger.warn('message_retention_health_schema_missing', {
        label,
        message: error.message
      });
      return [];
    }

    throw error;
  }

  return data || [];
};

const getHotelsForRetentionHealth = async (supabase) => {
  const { data, error } = await supabase
    .from('hotels')
    .select('id, name, delete_message_body_after_days, last_data_retention_cleanup_at')
    .order('created_at', { ascending: true });

  if (!error) {
    return data || [];
  }

  if (!/delete_message_body_after_days|last_data_retention_cleanup_at|schema cache|column/i.test(error.message || error.details || '')) {
    throw error;
  }

  logger.warn('message_retention_health_using_legacy_hotel_schema', {
    message: error.message
  });

  return safeRows(
    supabase
      .from('hotels')
      .select('id, name')
      .order('created_at', { ascending: true }),
    'hotels_legacy'
  );
};

const countRows = async (query, label) => {
  const { count, error } = await query;

  if (error) {
    if (/does not exist|schema cache|column/i.test(error.message || error.details || '')) {
      logger.warn('message_retention_health_count_skipped', {
        label,
        message: error.message
      });
      return 0;
    }

    throw error;
  }

  return count || 0;
};

export const messageRetentionHealthCheck = async () => {
  const supabase = getSupabase();
  const hotels = await getHotelsForRetentionHealth(supabase);
  const results = [];

  for (const hotel of hotels) {
    const retentionDays = toPositiveInt(
      hotel.delete_message_body_after_days,
      DEFAULT_MESSAGE_BODY_RETENTION_DAYS
    );
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

    const conversations = await safeRows(
      supabase
        .from('conversations')
        .select('id')
        .eq('hotel_id', hotel.id)
        .limit(1000),
      'conversations'
    );
    const conversationIds = conversations.map((item) => item.id).filter(Boolean);
    const oldMessageCount = conversationIds.length
      ? await countRows(
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', conversationIds)
          .lt('created_at', cutoff.toISOString()),
        'messages'
      )
      : 0;

    results.push({
      hotelId: hotel.id,
      hotelName: hotel.name,
      retentionDays,
      oldMessageCount,
      lastCleanupRun: hotel.last_data_retention_cleanup_at || null
    });
  }

  const summary = {
    jobName: 'messageRetentionHealthCheck',
    hotelsChecked: results.length,
    hotelsWithOldMessages: results.filter((item) => item.oldMessageCount > 0).length,
    results
  };

  logger.info('message_retention_health_check_completed', summary);
  return summary;
};
