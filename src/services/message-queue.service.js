import { createAiLog } from './ai-log.service.js';
import { getConversationContext, isHumanControlledConversation } from './conversation-context.service.js';
import { getSupabase } from './supabase.service.js';
import { sendWhatsAppMessage } from './twilio.service.js';
import { logger } from '../utils/logger.js';
import { shouldAiAutoRespond } from '../../shared/pilot/ai-safety.js';
import {
  AUTOMATION_RUNTIME_VERSION,
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  normalizeAutomationType
} from '../../shared/automations/catalog.js';
import {
  evaluateMessageScheduleStaleness,
  getReservationAutomationTerminalReason,
  isCanonicalAutomationScheduledMessage,
  isReservationTerminalForAutomations
} from '../../shared/automations/reservation-lifecycle.js';

const isSendAutomationsEnabled = () => process.env.SEND_AUTOMATIONS === 'true';

const isMissingScheduledMessagesTable = (error) => (
  error?.message?.includes('scheduled_messages')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('scheduled_messages')
);

const isMissingScheduledMessagesRuntimeColumn = (error) => (
  error?.code === '42703'
  || ['idempotency_key', 'execution_mode', 'runtime_version'].some((column) => (
    error?.message?.includes(column)
    || error?.details?.includes(column)
    || error?.hint?.includes(column)
  ))
);

const previewOnlyAutomationTypes = new Set([
  'pre_checkout_folio',
  'pre_checkout_folio_reminder',
  'review_request',
  'post_stay_review',
  'post_stay_review_intelligence'
]);

export const liveGateForScheduledMessage = (scheduledMessage = {}) => {
  const executionMode = String(
    scheduledMessage.execution_mode
    || scheduledMessage.metadata?.execution_mode
    || EXECUTION_MODES.PREVIEW
  );
  const certificationStatus = String(
    scheduledMessage.certification_status
    || scheduledMessage.metadata?.certification_status
    || normalizeAutomationType(scheduledMessage.automation_type).definition?.certificationStatus
    || CERTIFICATION_STATUSES.UNCERTIFIED
  );

  if (![EXECUTION_MODES.LIVE_LIMITED, EXECUTION_MODES.LIVE].includes(executionMode)) {
    return { allowed: false, reason: 'automation_mode_not_live' };
  }

  if (certificationStatus !== CERTIFICATION_STATUSES.CERTIFIED) {
    return { allowed: false, reason: 'automation_uncertified' };
  }

  return { allowed: true, reason: null };
};

export const isHotelAutomationLiveExplicitlyEnabled = (hotel = {}) => {
  const metadata = hotel.metadata || {};
  const mode = String(
    metadata.automation_execution_mode
    || metadata.automation_mode
    || hotel.automation_execution_mode
    || hotel.execution_mode
    || ''
  ).toLowerCase();

  return (
    metadata.automation_live_enabled === true
    && [EXECUTION_MODES.LIVE_LIMITED, EXECUTION_MODES.LIVE].includes(mode)
    && Boolean(metadata.automation_live_approved_at)
    && Boolean(metadata.automation_live_approved_by || metadata.automation_live_approval_id)
  );
};

const getHotelLiveAutomationGate = async (scheduledMessage = {}, { supabase = getSupabase() } = {}) => {
  if (!scheduledMessage.hotel_id) {
    return { allowed: false, reason: 'hotel_live_config_missing' };
  }

  try {
    const { data, error } = await supabase
      .from('hotels')
      .select('id, metadata, ai_auto_reply_enabled')
      .eq('id', scheduledMessage.hotel_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return { allowed: false, reason: 'hotel_live_config_missing' };
    }

    const autoReplyGate = shouldAiAutoRespond({
      hotel: data,
      env: process.env
    });

    if (!autoReplyGate.allowed) {
      return {
        allowed: false,
        reason: autoReplyGate.reason,
        autoReplyGate,
        hotel: data
      };
    }

    if (!isHotelAutomationLiveExplicitlyEnabled(data)) {
      return { allowed: false, reason: 'hotel_live_config_missing', hotel: data };
    }

    return { allowed: true, reason: null, hotel: data };
  } catch (error) {
    logger.warn('automation_hotel_live_gate_unavailable', {
      scheduledMessageId: scheduledMessage.id,
      hotelId: scheduledMessage.hotel_id,
      message: error.message
    });
    return { allowed: false, reason: 'hotel_live_config_unavailable' };
  }
};

export const getReservationSendTimeGate = async ({
  scheduledMessage = {},
  supabase = getSupabase()
} = {}) => {
  if (!scheduledMessage.hotel_id || !scheduledMessage.reservation_id) {
    return { allowed: false, reason: 'reservation_context_missing' };
  }

  try {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, hotel_id, status, arrival_date, departure_date')
      .eq('id', scheduledMessage.reservation_id)
      .eq('hotel_id', scheduledMessage.hotel_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return { allowed: false, reason: 'reservation_missing' };
    }

    if (isReservationTerminalForAutomations(data.status)) {
      return {
        allowed: false,
        reason: getReservationAutomationTerminalReason(data.status) || 'reservation_terminal_for_automations',
        reservationStatus: data.status,
        reservation: data
      };
    }

    return {
      allowed: true,
      reason: null,
      reservationStatus: data.status,
      reservation: data
    };
  } catch (error) {
    logger.warn('automation_reservation_send_time_gate_unavailable', {
      scheduledMessageId: scheduledMessage.id,
      hotelId: scheduledMessage.hotel_id,
      reservationId: scheduledMessage.reservation_id,
      message: error.message
    });
    return { allowed: false, reason: 'reservation_lookup_failed' };
  }
};

export const getReservationScheduleSendTimeGate = ({
  scheduledMessage = {},
  reservation = null
} = {}) => {
  const staleness = evaluateMessageScheduleStaleness({
    message: scheduledMessage,
    reservation
  });

  if (!staleness.dateDependent) {
    return {
      allowed: true,
      reason: null,
      dateDependent: false
    };
  }

  if (staleness.unverifiable) {
    return {
      allowed: false,
      reason: 'reservation_schedule_unverifiable',
      dateDependent: true
    };
  }

  if (staleness.stale) {
    return {
      allowed: false,
      reason: 'reservation_schedule_stale',
      dateDependent: true
    };
  }

  return {
    allowed: true,
    reason: null,
    dateDependent: true
  };
};

export const getDueScheduledMessages = async ({
  now = new Date(),
  limit = 50,
  supabase = getSupabase()
} = {}) => {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .not('idempotency_key', 'is', null)
    .not('execution_mode', 'is', null)
    .in('runtime_version', [AUTOMATION_RUNTIME_VERSION])
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingScheduledMessagesTable(error) || isMissingScheduledMessagesRuntimeColumn(error)) {
      return [];
    }

    throw error;
  }

  return (data || []).filter(isCanonicalAutomationScheduledMessage);
};

const updateScheduledMessageStatus = async (id, updates, { supabase = getSupabase() } = {}) => {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const processScheduledMessage = async (scheduledMessage, options = {}) => {
  let scopedSupabase = options.supabase || null;
  const getQueueSupabase = () => {
    scopedSupabase ||= getSupabase();
    return scopedSupabase;
  };

  if (!isCanonicalAutomationScheduledMessage(scheduledMessage)) {
    logger.info('automation_legacy_message_quarantined', {
      scheduledMessageId: scheduledMessage.id,
      automationType: scheduledMessage.automation_type
    });

    return {
      ...scheduledMessage,
      skipped: true,
      blocked: true,
      reason: 'legacy_automation_message_quarantined'
    };
  }

  const normalizedAutomation = normalizeAutomationType(scheduledMessage.automation_type);
  const automationTypeFamily = [
    normalizedAutomation.inputType,
    normalizedAutomation.canonicalType,
    scheduledMessage.metadata?.canonical_automation_type,
    scheduledMessage.metadata?.legacy_automation_type
  ].filter(Boolean);

  if (automationTypeFamily.some((type) => previewOnlyAutomationTypes.has(type))) {
    logger.info('automation_send_blocked_preview_only', {
      scheduledMessageId: scheduledMessage.id,
      automationType: scheduledMessage.automation_type
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'preview',
      error_message: null
    }, { supabase: getQueueSupabase() });
  }

  if (!isSendAutomationsEnabled()) {
    logger.info('Automation sending disabled; leaving message scheduled', {
      scheduledMessageId: scheduledMessage.id,
      automationType: scheduledMessage.automation_type
    });

    return {
      ...scheduledMessage,
      skipped: true
    };
  }

  const liveGate = liveGateForScheduledMessage(scheduledMessage);
  if (!liveGate.allowed) {
    logger.info('automation_send_blocked_by_runtime_gate', {
      scheduledMessageId: scheduledMessage.id,
      automationType: scheduledMessage.automation_type,
      reason: liveGate.reason
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'preview',
      error_message: liveGate.reason
    }, { supabase: getQueueSupabase() });
  }

  const hotelLiveGate = await getHotelLiveAutomationGate(scheduledMessage, { supabase: getQueueSupabase() });
  if (!hotelLiveGate.allowed) {
    logger.info('automation_send_blocked_by_hotel_live_gate', {
      scheduledMessageId: scheduledMessage.id,
      automationType: scheduledMessage.automation_type,
      reason: hotelLiveGate.reason
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'preview',
      error_message: hotelLiveGate.reason
    }, { supabase: getQueueSupabase() });
  }

  const reservationGate = await getReservationSendTimeGate({
    scheduledMessage,
    supabase: getQueueSupabase()
  });
  if (!reservationGate.allowed) {
    const checkedAt = new Date().toISOString();
    const terminalReason = getReservationAutomationTerminalReason(reservationGate.reservationStatus);
    logger.info('automation_send_blocked_by_reservation_lifecycle', {
      scheduledMessageId: scheduledMessage.id,
      hotelId: scheduledMessage.hotel_id,
      reservationId: scheduledMessage.reservation_id,
      automationType: scheduledMessage.automation_type,
      reason: reservationGate.reason
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: terminalReason ? 'cancelled' : 'failed',
      failed_at: terminalReason ? null : checkedAt,
      error_message: reservationGate.reason,
      metadata: {
        ...(scheduledMessage.metadata || {}),
        send_time_guard: {
          reason: reservationGate.reason,
          reservation_status: reservationGate.reservationStatus || null,
          runtime_version: AUTOMATION_RUNTIME_VERSION,
          checked_at: checkedAt
        }
      }
    }, { supabase: getQueueSupabase() });
  }

  const scheduleGate = getReservationScheduleSendTimeGate({
    scheduledMessage,
    reservation: reservationGate.reservation
  });
  if (!scheduleGate.allowed) {
    const checkedAt = new Date().toISOString();
    logger.info('automation_send_blocked_by_reservation_schedule', {
      scheduledMessageId: scheduledMessage.id,
      hotelId: scheduledMessage.hotel_id,
      reservationId: scheduledMessage.reservation_id,
      automationType: scheduledMessage.automation_type,
      reason: scheduleGate.reason
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'failed',
      failed_at: checkedAt,
      error_message: scheduleGate.reason,
      metadata: {
        ...(scheduledMessage.metadata || {}),
        send_time_guard: {
          reason: scheduleGate.reason,
          runtime_version: AUTOMATION_RUNTIME_VERSION,
          checked_at: checkedAt
        }
      }
    }, { supabase: getQueueSupabase() });
  }

  if (!scheduledMessage.send_to) {
    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: 'Missing send_to'
    }, { supabase: getQueueSupabase() });
  }

  if (scheduledMessage.conversation_id && scheduledMessage.hotel_id) {
    let aiState = null;
    let stateLookupFailed = false;

    try {
      aiState = await getConversationContext({
        hotelId: scheduledMessage.hotel_id,
        conversationId: scheduledMessage.conversation_id,
        throwOnError: true
      });
    } catch (error) {
      stateLookupFailed = true;
      logger.warn('automation_ai_state_lookup_failed', {
        scheduledMessageId: scheduledMessage.id,
        hotelId: scheduledMessage.hotel_id,
        conversationId: scheduledMessage.conversation_id,
        message: error.message
      });
    }

    const conversationGate = shouldAiAutoRespond({
      hotel: hotelLiveGate.hotel || { id: scheduledMessage.hotel_id },
      conversationState: aiState,
      stateLookupFailed,
      env: process.env
    });

    if (!conversationGate.allowed) {
      logger.info(
        isHumanControlledConversation(aiState)
          ? 'automation_blocked_by_human_takeover'
          : 'automation_blocked_by_ai_auto_response_gate',
        {
        scheduledMessageId: scheduledMessage.id,
        hotelId: scheduledMessage.hotel_id,
        conversationId: scheduledMessage.conversation_id,
        automationType: scheduledMessage.automation_type,
        reason: conversationGate.reason
        }
      );

      return updateScheduledMessageStatus(scheduledMessage.id, {
        status: 'failed',
        error_message: conversationGate.reason
      }, { supabase: getQueueSupabase() });
    }
  }

  try {
    const twilioMessage = await sendWhatsAppMessage({
      to: scheduledMessage.send_to,
      body: scheduledMessage.message_preview
    });
    const updated = await updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      error_message: null
    }, { supabase: getQueueSupabase() });

    await createAiLog({
      hotelId: scheduledMessage.hotel_id || null,
      guestId: scheduledMessage.guest_id || null,
      conversationId: scheduledMessage.conversation_id || null,
      detectedIntent: 'automation',
      generatedResponse: scheduledMessage.message_preview,
      aiProvider: scheduledMessage.ai_provider,
      aiModel: scheduledMessage.ai_model,
      fallbackUsed: scheduledMessage.automation_fallback,
      automationTriggered: true,
      automationType: scheduledMessage.automation_type,
      automationSent: true,
      automationFallback: scheduledMessage.automation_fallback
    });

    logger.info('Automation WhatsApp sent', {
      scheduledMessageId: scheduledMessage.id,
      twilioSid: twilioMessage?.sid || null
    });

    return updated;
  } catch (error) {
    logger.warn('Automation WhatsApp send failed', {
      scheduledMessageId: scheduledMessage.id,
      message: error.message
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: error.message
    }, { supabase: getQueueSupabase() });
  }
};

export const processDueScheduledMessages = async ({
  now = new Date(),
  limit = 50,
  supabase = getSupabase()
} = {}) => {
  const dueMessages = await getDueScheduledMessages({ now, limit, supabase });
  const results = [];

  for (const message of dueMessages) {
    results.push(await processScheduledMessage(message, { supabase }));
  }

  return results;
};
