import { getSupabase, createTicketRecord } from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { upsertGuestMemory } from './guest-memory.service.js';
import { createConversion, getDefaultUpsellAmount } from './revenue.service.js';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const isMissingOffersTable = (error) => (
  error?.message?.includes('ai_offers')
  || error?.details?.includes('ai_offers')
  || error?.hint?.includes('ai_offers')
);

const offerDefaults = {
  room_upgrade_interest: { offerType: 'room_upgrade', price: 120 },
  late_checkout_interest: { offerType: 'late_checkout', price: 40 },
  airport_transfer_interest: { offerType: 'airport_transfer', price: 60 },
  romantic_package_interest: { offerType: 'romantic_package', price: 150 },
  spa_interest: { offerType: 'spa', price: 80 },
  restaurant_interest: { offerType: 'dinner', price: 90 }
};

const intentRules = [
  { intent: 'room_upgrade_interest', confidence: 0.86, words: ['upgrade', 'suite', 'better room', 'habitacion mejor', 'mejor habitacion', 'premium room'] },
  { intent: 'late_checkout_interest', confidence: 0.9, words: ['late checkout', 'leave later', 'salir mas tarde', 'salida tarde', 'checkout tarde', 'plus tard demain'] },
  { intent: 'airport_transfer_interest', confidence: 0.88, words: ['airport transfer', 'transfer', 'taxi aeropuerto', 'traslado', 'aeropuerto', 'flight', 'vuelo'] },
  { intent: 'romantic_package_interest', confidence: 0.9, words: ['anniversary', 'aniversario', 'romantic', 'romantico', 'romantica', 'honeymoon', 'luna de miel'] },
  { intent: 'spa_interest', confidence: 0.84, words: ['spa', 'massage', 'masaje', 'wellness', 'relax'] },
  { intent: 'restaurant_interest', confidence: 0.84, words: ['restaurant', 'restaurante', 'dinner', 'cena', 'table', 'mesa'] },
  { intent: 'complaint_noise', confidence: 0.88, words: ['noisy', 'noise', 'ruido', 'loud', 'molesto', 'no puedo dormir'] },
  { intent: 'complaint_cleaning', confidence: 0.86, words: ['dirty', 'sucio', 'limpieza mal', 'not clean', 'unclean', 'toallas sucias'] },
  { intent: 'vip_behavior', confidence: 0.72, words: ['vip', 'premium', 'suite', 'private', 'exclusivo'] },
  { intent: 'celebration_signal', confidence: 0.82, words: ['birthday', 'cumpleanos', 'anniversary', 'aniversario', 'celebrating', 'celebramos'] },
  { intent: 'family_trip', confidence: 0.82, words: ['family', 'familia', 'kids', 'children', 'ninos', 'bebé', 'bebe'] },
  { intent: 'business_trip', confidence: 0.8, words: ['business', 'trabajo', 'meeting', 'reunion', 'conference', 'conferencia'] }
];

export const detectGuestIntent = ({ message = '', context = {} } = {}) => {
  const text = normalize([
    message,
    ...(context.recentMessages || []).map((item) => item.content || '')
  ].join(' '));
  const detected = intentRules
    .filter((rule) => includesAny(text, rule.words))
    .map((rule) => ({
      intent: rule.intent,
      confidence: rule.confidence,
      source: 'keyword_context'
    }));

  return detected[0] || {
    intent: null,
    confidence: 0,
    source: 'none'
  };
};

export const detectRevenueOpportunity = ({ intentResult, context = {} } = {}) => {
  const defaults = offerDefaults[intentResult?.intent];

  if (!defaults) {
    return null;
  }

  const memoryKeys = new Set((context.guestMemory || []).map((item) => item.memory_key));
  const boostedConfidence = memoryKeys.has(`interested_${defaults.offerType}`)
    ? Math.min(0.96, Number(intentResult.confidence || 0.75) + 0.08)
    : Number(intentResult.confidence || 0.75);

  return {
    offerType: defaults.offerType,
    suggestedPrice: defaults.price || getDefaultUpsellAmount(defaults.offerType),
    currency: 'EUR',
    confidence: boostedConfidence,
    aiReason: `Detected ${intentResult.intent} from guest message and context.`,
    triggerIntent: intentResult.intent
  };
};

export const detectOperationalRisk = ({ intentResult, message = '' } = {}) => {
  const text = normalize(message);

  if (['complaint_noise', 'complaint_cleaning'].includes(intentResult?.intent)) {
    return {
      hasRisk: true,
      category: intentResult.intent === 'complaint_noise' ? 'complaint' : 'housekeeping',
      priority: 'high',
      reason: intentResult.intent
    };
  }

  if (includesAny(text, ['angry', 'terrible', 'unacceptable', 'refund', 'enfadado', 'muy mal', 'nadie me ayuda'])) {
    return {
      hasRisk: true,
      category: 'complaint',
      priority: 'high',
      reason: 'negative_sentiment'
    };
  }

  return {
    hasRisk: false,
    category: null,
    priority: 'normal',
    reason: null
  };
};

export const generateSuggestedOffer = ({ opportunity, language = 'en' } = {}) => {
  if (!opportunity) {
    return null;
  }

  const price = new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-US', {
    style: 'currency',
    currency: opportunity.currency || 'EUR',
    maximumFractionDigits: 0
  }).format(Number(opportunity.suggestedPrice || 0));

  const messages = {
    late_checkout: {
      es: `Late checkout puede estar disponible segun ocupacion. Puedo ofrecer salida a las 14:00 por ${price}. Quieres que lo reserve para ti?`,
      en: `Late checkout may be available depending on occupancy. I can offer a 2pm checkout for ${price}. Would you like me to reserve it for you?`
    },
    room_upgrade: {
      es: `Podemos consultar una mejora de habitacion premium desde ${price}. Quieres que recepcion revise disponibilidad?`,
      en: `We can check a premium room upgrade from ${price}. Would you like reception to review availability?`
    },
    airport_transfer: {
      es: `Podemos ayudarte con transfer al aeropuerto desde ${price}. Quieres que recepcion lo prepare?`,
      en: `We can help arrange an airport transfer from ${price}. Would you like reception to prepare it?`
    },
    romantic_package: {
      es: `Felicidades. Tambien ofrecemos un paquete romantico desde ${price} con detalles especiales. Quieres mas informacion?`,
      en: `Congratulations. We also offer a romantic package from ${price} with special touches. Would you like more information?`
    },
    spa: {
      es: `Podemos ayudarte con una experiencia de spa desde ${price}. Quieres que consulte disponibilidad?`,
      en: `We can help with a spa experience from ${price}. Would you like me to check availability?`
    },
    dinner: {
      es: `Puedo avisar al restaurante para ayudarte con la reserva. Tenemos opciones desde ${price}. Quieres que lo prepare?`,
      en: `I can notify the restaurant team to help with a booking. Options start from ${price}. Would you like me to prepare it?`
    }
  };

  return messages[opportunity.offerType]?.[language] || messages[opportunity.offerType]?.en || null;
};

export const generateDepartmentAction = ({ intentResult, opportunity, risk } = {}) => {
  if (risk?.hasRisk) {
    return {
      department: risk.category === 'housekeeping' ? 'housekeeping' : 'reception',
      actionType: risk.reason,
      title: risk.reason === 'complaint_noise' ? 'Noise complaint follow-up' : 'Guest complaint follow-up',
      priority: risk.priority
    };
  }

  if (opportunity) {
    return {
      department: 'revenue',
      actionType: opportunity.offerType,
      title: `Follow up ${opportunity.offerType} offer`,
      priority: opportunity.confidence >= 0.85 ? 'high' : 'normal'
    };
  }

  if (['vip_behavior', 'celebration_signal', 'family_trip', 'business_trip'].includes(intentResult?.intent)) {
    return {
      department: 'reception',
      actionType: intentResult.intent,
      title: `Concierge context: ${intentResult.intent}`,
      priority: 'normal'
    };
  }

  return null;
};

export const generateConciergeResponse = ({ intentResult, opportunity, risk, language = 'en' } = {}) => {
  if (risk?.hasRisk) {
    return language === 'es'
      ? 'Lo siento mucho. He informado a recepcion para que podamos ayudarte lo antes posible.'
      : "I'm sorry about that. I've informed reception so we can assist you as quickly as possible.";
  }

  const offerMessage = generateSuggestedOffer({ opportunity, language });

  if (offerMessage) {
    return offerMessage;
  }

  if (intentResult?.intent === 'celebration_signal') {
    return language === 'es'
      ? 'Felicidades. Si quieres, puedo avisar a recepcion para preparar algun detalle especial durante tu estancia.'
      : 'Congratulations. If you like, I can notify reception to prepare a special touch during your stay.';
  }

  return null;
};

export const createAiOffer = async ({
  hotel,
  guest,
  conversation,
  reservation,
  opportunity,
  status = 'suggested'
}) => {
  if (!opportunity) {
    return null;
  }

  try {
    const supabase = getSupabase();

    const record = {
      hotel_id: hotel.id,
      guest_id: guest?.id || null,
      reservation_id: reservation?.id || null,
      conversation_id: conversation?.id || null,
      offer_type: opportunity.offerType,
      suggested_price: opportunity.suggestedPrice,
      currency: opportunity.currency || 'EUR',
      status,
      confidence: opportunity.confidence,
      ai_reason: opportunity.aiReason,
      metadata: {
        trigger_intent: opportunity.triggerIntent,
        future_pms_sync: true
      },
      updated_at: new Date().toISOString()
    };

    const { data: existing, error: existingError } = await supabase
      .from('ai_offers')
      .select('*')
      .eq('conversation_id', conversation.id)
      .eq('offer_type', opportunity.offerType)
      .in('status', ['suggested', 'sent'])
      .limit(1)
      .maybeSingle();

    if (existingError && !isMissingOffersTable(existingError)) {
      throw existingError;
    }

    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from('ai_offers')
      .insert(record)
      .select('*')
      .single();

    if (error) {
      if (isMissingOffersTable(error)) {
        logger.warn('ai_offers table missing; skipping AI offer storage');
        return null;
      }

      throw error;
    }

    await createConversion({
      hotelId: hotel.id,
      guestId: guest?.id || null,
      reservationId: reservation?.id || null,
      conversationId: conversation?.id || null,
      upsellType: opportunity.offerType,
      source: 'ai_offer',
      status: status === 'sent' ? 'sent' : 'pending',
      estimatedAmount: opportunity.suggestedPrice,
      currency: opportunity.currency || 'EUR',
      notes: `Created from concierge AI offer ${data.id}`
    });

    return data;
  } catch (error) {
    logger.warn('AI offer write failed', {
      message: error.message
    });

    return null;
  }
};

export const persistConciergeMemory = async ({
  hotel,
  guest,
  reservation,
  intentResult,
  opportunity,
  risk
}) => {
  const memories = [];

  if (intentResult?.intent) {
    memories.push({
      memoryType: 'concierge_interest',
      memoryKey: intentResult.intent,
      memoryValue: 'true',
      confidence: intentResult.confidence || 0.75
    });
  }

  if (opportunity?.offerType) {
    memories.push({
      memoryType: 'upsell_interest',
      memoryKey: `interested_${opportunity.offerType}`,
      memoryValue: 'true',
      confidence: opportunity.confidence || 0.75
    });
  }

  if (risk?.hasRisk) {
    memories.push({
      memoryType: 'operational_risk',
      memoryKey: risk.reason,
      memoryValue: risk.priority,
      confidence: 0.82
    });
  }

  const saved = [];

  for (const item of memories) {
    const record = await upsertGuestMemory({
      hotelId: hotel.id,
      guestId: guest.id,
      reservationId: reservation?.id || null,
      memoryType: item.memoryType,
      memoryKey: item.memoryKey,
      memoryValue: item.memoryValue,
      confidence: item.confidence,
      source: 'concierge_ai',
      metadata: { concierge_ai: true }
    });

    if (record) saved.push(record);
  }

  return saved;
};

export const createOperationalTicketForConciergeRisk = async ({
  hotel,
  guest,
  conversation,
  risk,
  message
}) => {
  if (!risk?.hasRisk) {
    return null;
  }

  try {
    return await createTicketRecord({
      hotelId: hotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      roomNumber: guest.current_room,
      category: risk.category || 'reception',
      title: risk.reason === 'complaint_noise' ? 'Noise complaint' : 'Concierge risk follow-up',
      description: `AI concierge detected ${risk.reason}: ${message}`,
      priority: risk.priority || 'high'
    });
  } catch (error) {
    logger.warn('Concierge operational ticket failed', {
      message: error.message
    });
    return null;
  }
};
