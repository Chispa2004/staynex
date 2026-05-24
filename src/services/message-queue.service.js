import { createAiLog } from './ai-log.service.js';
import { getConversationContext, isHumanControlledConversation } from './conversation-context.service.js';
import { getSupabase } from './supabase.service.js';
import { sendWhatsAppMessage } from './twilio.service.js';
import { logger } from '../utils/logger.js';

const isSendAutomationsEnabled = () => process.env.SEND_AUTOMATIONS === 'true';
const PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE = 'pre_checkout_folio_reminder';
const POST_STAY_REVIEW_INTELLIGENCE_TYPE = 'post_stay_review_intelligence';

const isMissingScheduledMessagesTable = (error) => (
  error?.message?.includes('scheduled_messages')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('scheduled_messages')
);

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
  if ([PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE, POST_STAY_REVIEW_INTELLIGENCE_TYPE].includes(scheduledMessage.automation_type)) {
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
