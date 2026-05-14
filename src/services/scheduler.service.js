import {
  AUTOMATION_TYPES,
  createScheduledMessage,
  generateAutomationMessage,
  getAutomationContextForReservation,
  getAutomationRulesForHotel,
  shouldScheduleAutomationForReservation
} from './automation.service.js';
import { createAiLog } from './ai-log.service.js';
import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const ACTIVE_RESERVATION_STATUSES = ['confirmed', 'checked_in', 'in_house'];

const isMissingAutomationTables = (error) => (
  error?.message?.includes('automation_rules')
  || error?.message?.includes('scheduled_messages')
  || error?.details?.includes('automation_rules')
  || error?.details?.includes('scheduled_messages')
);

const getCandidateReservations = async ({ hotelId = null, limit = 250 } = {}) => {
  const client = getSupabase();
  let query = client
    .from('reservations')
    .select('*')
    .in('status', ACTIVE_RESERVATION_STATUSES)
    .order('arrival_date', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
};

const getRulesByHotelId = async (hotelIds) => {
  const entries = await Promise.all(hotelIds.map(async (hotelId) => [
    hotelId,
    await getAutomationRulesForHotel(hotelId)
  ]));

  return new Map(entries);
};

const shouldConsiderRule = ({ reservation, automationType, now }) => {
  const scheduledFor = shouldScheduleAutomationForReservation({
    reservation,
    automationType,
    now
  });

  if (!scheduledFor) {
    return null;
  }

  if (!Object.values(AUTOMATION_TYPES).includes(automationType)) {
    return null;
  }

  return scheduledFor;
};

export const runAutomationScheduler = async ({
  hotelId = null,
  now = new Date(),
  limit = 250
} = {}) => {
  try {
    const reservations = await getCandidateReservations({ hotelId, limit });
    const hotelIds = [...new Set(reservations.map((reservation) => reservation.hotel_id).filter(Boolean))];
    const rulesByHotelId = await getRulesByHotelId(hotelIds);
    const scheduled = [];

    for (const reservation of reservations) {
      const rules = rulesByHotelId.get(reservation.hotel_id) || [];

      for (const rule of rules) {
        const scheduledFor = shouldConsiderRule({
          reservation,
          automationType: rule.automation_type,
          now
        });

        if (!scheduledFor) {
          continue;
        }

        const context = await getAutomationContextForReservation({
          hotel: { id: reservation.hotel_id },
          reservation
        });
        const language = context.guest?.preferred_language || reservation.language || context.hotelProfile?.default_language || 'es';
        const messageResult = await generateAutomationMessage({
          automationType: rule.automation_type,
          hotel: context.hotelProfile,
          reservation,
          guest: context.guest,
          guestMemory: context.guestMemory,
          hotelKnowledge: context.hotelKnowledge,
          upsells: context.upsells,
          language
        });
        const scheduledMessage = await createScheduledMessage({
          rule,
          hotel: context.hotelProfile || { id: reservation.hotel_id },
          reservation,
          guest: context.guest,
          conversation: context.conversation,
          scheduledFor,
          messageResult,
          language,
          metadata: {
            source: 'scheduler',
            guest_memory_keys: context.guestMemory.map((item) => item.memory_key),
            upsell_ids: context.upsells.map((item) => item.id)
          }
        });

        if (scheduledMessage) {
          scheduled.push(scheduledMessage);

          await createAiLog({
            guestId: reservation.guest_id || null,
            conversationId: context.conversation?.id || null,
            detectedLanguage: language,
            detectedIntent: 'automation',
            confidenceScore: 0.9,
            generatedResponse: messageResult.message,
            automationTriggered: true,
            automationType: rule.automation_type,
            automationSent: false,
            automationFallback: messageResult.fallbackUsed,
            aiProvider: messageResult.aiProvider,
            aiModel: messageResult.aiModel,
            fallbackUsed: messageResult.fallbackUsed,
            memoryUsed: context.guestMemory.length > 0,
            memoryKeysUsed: context.guestMemory.map((item) => item.memory_key)
          });
        }
      }
    }

    logger.info('Automation scheduler completed', {
      reservations: reservations.length,
      scheduled: scheduled.length
    });

    return scheduled;
  } catch (error) {
    if (isMissingAutomationTables(error)) {
      logger.warn('Automation tables missing; scheduler skipped');
      return [];
    }

    throw error;
  }
};
