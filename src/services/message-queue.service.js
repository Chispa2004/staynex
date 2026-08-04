import { createAiLog } from './ai-log.service.js';
import { getConversationContext, isHumanControlledConversation } from './conversation-context.service.js';
import { getSupabase } from './supabase.service.js';
import { sendWhatsAppMessage } from './twilio.service.js';
import { logger } from '../utils/logger.js';
import {
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  normalizeAutomationType
} from '../../shared/automations/catalog.js';

const isSendAutomationsEnabled = () => process.env.SEND_AUTOMATIONS === 'true';

const isMissingScheduledMessagesTable = (error) => (
  error?.message?.includes('scheduled_messages')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('scheduled_messages')
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

const getHotelLiveAutomationGate = async (scheduledMessage = {}) => {
  if (!scheduledMessage.hotel_id) {
    return { allowed: false, reason: 'hotel_live_config_missing' };
  }

  try {
    const { data, error } = await getSupabase()
      .from('hotels')
      .select('id, metadata')
      .eq('id', scheduledMessage.hotel_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || !isHotelAutomationLiveExplicitlyEnabled(data)) {
      return { allowed: false, reason: 'hotel_live_config_missing' };
    }

    return { allowed: true, reason: null };
  } catch (error) {
    logger.warn('automation_hotel_live_gate_unavailable', {
      scheduledMessageId: scheduledMessage.id,
      hotelId: scheduledMessage.hotel_id,
      message: error.message
    });
    return { allowed: false, reason: 'hotel_live_config_unavailable' };
  }
};

export const getDueScheduledMessages = async ({
  now = new Date(),
  limit = 50
} = {}) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingScheduledMessagesTable(error)) {
      return [];
    }

    throw error;
  }

  return data || [];
};

const updateScheduledMessageStatus = async (id, updates) => {
  const supabase = getSupabase();
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

export const processScheduledMessage = async (scheduledMessage) => {
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
    });
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
    });
  }

  const hotelLiveGate = await getHotelLiveAutomationGate(scheduledMessage);
  if (!hotelLiveGate.allowed) {
    logger.info('automation_send_blocked_by_hotel_live_gate', {
      scheduledMessageId: scheduledMessage.id,
      automationType: scheduledMessage.automation_type,
      reason: hotelLiveGate.reason
    });

    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'preview',
      error_message: hotelLiveGate.reason
    });
  }

  if (!scheduledMessage.send_to) {
    return updateScheduledMessageStatus(scheduledMessage.id, {
      status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: 'Missing send_to'
    });
  }

  if (scheduledMessage.conversation_id && scheduledMessage.hotel_id) {
    const aiState = await getConversationContext({
      hotelId: scheduledMessage.hotel_id,
      conversationId: scheduledMessage.conversation_id
    });

    if (isHumanControlledConversation(aiState)) {
      logger.info('automation_blocked_by_human_takeover', {
        scheduledMessageId: scheduledMessage.id,
        hotelId: scheduledMessage.hotel_id,
        conversationId: scheduledMessage.conversation_id,
        automationType: scheduledMessage.automation_type
      });

      return updateScheduledMessageStatus(scheduledMessage.id, {
        status: 'failed',
        error_message: 'Human takeover active for conversation'
      });
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
    });

    await createAiLog({
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
    });
  }
};

export const processDueScheduledMessages = async ({
  now = new Date(),
  limit = 50
} = {}) => {
  const dueMessages = await getDueScheduledMessages({ now, limit });
  const results = [];

  for (const message of dueMessages) {
    results.push(await processScheduledMessage(message));
  }

  return results;
};
