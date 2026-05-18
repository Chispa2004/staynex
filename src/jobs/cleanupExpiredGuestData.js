import { createHash } from 'node:crypto';
import { getSupabase } from '../services/supabase.service.js';
import { logger } from '../utils/logger.js';

const JOB_NAME = 'cleanupExpiredGuestData';
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MESSAGE_BODY_RETENTION_DAYS = 90;
const DEFAULT_LIMIT = 500;
const ANONYMIZED_MESSAGE = '[Message anonymized by Staynex GDPR retention]';

const isMissingTableOrColumn = (error) => (
  error?.code === '42P01'
  || error?.code === '42703'
  || /does not exist|schema cache|column/i.test(error?.message || '')
  || /does not exist|schema cache|column/i.test(error?.details || '')
  || /does not exist|schema cache|column/i.test(error?.hint || '')
);

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const isoDate = (date) => date.toISOString().slice(0, 10);

const hashValue = (value) => {
  if (!value) {
    return null;
  }

  return createHash('sha256')
    .update(String(value))
    .digest('hex');
};

const safeRows = async (query, label) => {
  const { data, error } = await query;

  if (error) {
    if (isMissingTableOrColumn(error)) {
      logger.warn('retention job skipped missing schema', {
        jobName: JOB_NAME,
        label,
        message: error.message
      });
      return [];
    }

    throw error;
  }

  return data || [];
};

const safeUpdate = async ({ query, label }) => {
  const { data, error, count } = await query;

  if (error) {
    if (isMissingTableOrColumn(error)) {
      logger.warn('retention update skipped missing schema', {
        jobName: JOB_NAME,
        label,
        message: error.message
      });
      return { rows: [], count: 0, skipped: true };
    }

    throw error;
  }

  return {
    rows: data || [],
    count: Number(count || data?.length || 0),
    skipped: false
  };
};

const insertAuditLog = async ({ supabase, hotelId, status, error = null, metadata = {}, recordsScanned = 0, recordsAnonymized = 0, recordsDeleted = 0 }) => {
  const payload = {
    hotel_id: hotelId,
    job_name: JOB_NAME,
    run_at: new Date().toISOString(),
    records_scanned: recordsScanned,
    records_anonymized: recordsAnonymized,
    records_deleted: recordsDeleted,
    status,
    error,
    metadata
  };

  const { error: auditError } = await supabase
    .from('data_retention_audit_logs')
    .insert(payload);

  if (auditError && !isMissingTableOrColumn(auditError)) {
    logger.warn('data_retention_audit_log_failed', {
      hotelId,
      message: auditError.message
    });
  }
};

const getHotels = async ({ supabase, hotelId = null }) => {
  let query = supabase
    .from('hotels')
    .select('*')
    .order('created_at', { ascending: true });

  if (hotelId) {
    query = query.eq('id', hotelId);
  }

  return safeRows(query, 'hotels');
};

const anonymizeHotelData = async ({ supabase, hotel, dryRun, now, limit }) => {
  const hotelId = hotel.id;
  const retentionDays = toPositiveInt(
    hotel.anonymize_after_checkout_days || hotel.guest_data_retention_days,
    DEFAULT_RETENTION_DAYS
  );
  const messageRetentionDays = toPositiveInt(
    hotel.delete_message_body_after_days,
    DEFAULT_MESSAGE_BODY_RETENTION_DAYS
  );
  const checkoutCutoff = isoDate(addDays(now, -retentionDays));
  const messageCutoff = addDays(now, -messageRetentionDays).toISOString();
  const summary = {
    hotelId,
    hotelName: hotel.name || null,
    dryRun,
    checkoutCutoff,
    messageCutoff,
    reservationsScanned: 0,
    guestsAnonymized: 0,
    reservationsAnonymized: 0,
    conversationsScanned: 0,
    messagesAnonymized: 0,
    guestMemoryAnonymized: 0,
    experienceBookingsAnonymized: 0,
    aiLogsAnonymized: 0,
    errors: []
  };

  const reservations = await safeRows(
    supabase
      .from('reservations')
      .select('id, hotel_id, guest_id, guest_name, guest_email, guest_phone, departure_date, status')
      .eq('hotel_id', hotelId)
      .lt('departure_date', checkoutCutoff)
      .limit(limit),
    'expired_reservations'
  );
  summary.reservationsScanned = reservations.length;

  const reservationIds = reservations.map((item) => item.id).filter(Boolean);
  const guestIds = [...new Set(reservations.map((item) => item.guest_id).filter(Boolean))];

  const conversations = guestIds.length
    ? await safeRows(
      supabase
        .from('conversations')
        .select('id, guest_id')
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .limit(limit),
      'expired_conversations'
    )
    : [];
  const conversationIds = conversations.map((item) => item.id).filter(Boolean);
  summary.conversationsScanned = conversations.length;

  if (dryRun) {
    const oldMessages = conversationIds.length
      ? await safeRows(
        supabase
          .from('messages')
          .select('id')
          .in('conversation_id', conversationIds)
          .lt('created_at', messageCutoff)
          .limit(limit),
        'expired_messages_dry_run'
      )
      : [];

    summary.guestsAnonymized = guestIds.length;
    summary.reservationsAnonymized = reservationIds.length;
    summary.messagesAnonymized = oldMessages.length;
    summary.guestMemoryAnonymized = guestIds.length;
    summary.experienceBookingsAnonymized = guestIds.length;
    summary.aiLogsAnonymized = guestIds.length;
    return summary;
  }

  if (guestIds.length) {
    for (const guestId of guestIds) {
      const anonymizedPhone = `anon-${hashValue(`${hotelId}:${guestId}`).slice(0, 24)}`;
      const result = await safeUpdate({
        label: 'guests',
        query: supabase
          .from('guests')
          .update({
            phone_number: anonymizedPhone,
            current_room: null
          })
          .eq('hotel_id', hotelId)
          .eq('id', guestId)
          .select('id')
      });
      summary.guestsAnonymized += result.count;
    }
  }

  if (reservationIds.length) {
    const result = await safeUpdate({
      label: 'reservations',
      query: supabase
        .from('reservations')
        .update({
          guest_name: 'Guest anonymized',
          guest_email: null,
          guest_phone: null,
          notes: null,
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId)
        .in('id', reservationIds)
        .select('id')
    });
    summary.reservationsAnonymized += result.count;
  }

  if (conversationIds.length) {
    const messageResult = await safeUpdate({
      label: 'messages',
      query: supabase
        .from('messages')
        .update({
          content: ANONYMIZED_MESSAGE,
          translated_text: null,
          metadata: {
            anonymized: true,
            anonymized_at: new Date().toISOString(),
            retention_job: JOB_NAME
          }
        })
        .in('conversation_id', conversationIds)
        .lt('created_at', messageCutoff)
        .select('id')
    });
    summary.messagesAnonymized += messageResult.count;
  }

  if (guestIds.length) {
    const memoryResult = await safeUpdate({
      label: 'guest_memory',
      query: supabase
        .from('guest_memory')
        .update({
          memory_value: '[anonymized]',
          is_active: false,
          metadata: {
            anonymized: true,
            anonymized_at: new Date().toISOString(),
            retention_job: JOB_NAME
          },
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .select('id')
    });
    summary.guestMemoryAnonymized += memoryResult.count;

    const bookingResult = await safeUpdate({
      label: 'experience_booking_requests',
      query: supabase
        .from('experience_booking_requests')
        .update({
          guest_name: 'Guest anonymized',
          room_number: null,
          notes: null,
          metadata: {
            anonymized: true,
            anonymized_at: new Date().toISOString(),
            retention_job: JOB_NAME
          },
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .in('status', ['completed', 'cancelled', 'rejected'])
        .select('id')
    });
    summary.experienceBookingsAnonymized += bookingResult.count;

    const aiLogResult = await safeUpdate({
      label: 'ai_logs',
      query: supabase
        .from('ai_logs')
        .update({
          raw_guest_message: null,
          generated_response: null
        })
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .select('id')
    });
    summary.aiLogsAnonymized += aiLogResult.count;
  }

  await safeUpdate({
    label: 'hotels_last_cleanup',
    query: supabase
      .from('hotels')
      .update({
        last_data_retention_cleanup_at: new Date().toISOString()
      })
      .eq('id', hotelId)
      .select('id')
  });

  return summary;
};

export const cleanupExpiredGuestData = async ({ hotelId = null, dryRun = false, limit = DEFAULT_LIMIT, now = new Date() } = {}) => {
  const supabase = getSupabase();
  const hotels = await getHotels({ supabase, hotelId });
  const results = [];

  for (const hotel of hotels) {
    try {
      const summary = await anonymizeHotelData({
        supabase,
        hotel,
        dryRun,
        now,
        limit
      });
      const recordsAnonymized = summary.guestsAnonymized
        + summary.reservationsAnonymized
        + summary.messagesAnonymized
        + summary.guestMemoryAnonymized
        + summary.experienceBookingsAnonymized
        + summary.aiLogsAnonymized;

      if (!dryRun) {
        await insertAuditLog({
          supabase,
          hotelId: hotel.id,
          status: 'success',
          recordsScanned: summary.reservationsScanned + summary.conversationsScanned,
          recordsAnonymized,
          recordsDeleted: 0,
          metadata: summary
        });
      }

      logger.info('gdpr_retention_cleanup_completed', summary);
      results.push(summary);
    } catch (error) {
      logger.error('gdpr_retention_cleanup_failed', {
        hotelId: hotel.id,
        message: error.message
      });
      if (!dryRun) {
        await insertAuditLog({
          supabase,
          hotelId: hotel.id,
          status: 'failed',
          error: error.message
        });
      }
      results.push({
        hotelId: hotel.id,
        dryRun,
        error: error.message
      });
    }
  }

  return {
    jobName: JOB_NAME,
    dryRun,
    hotelsProcessed: results.length,
    results
  };
};
