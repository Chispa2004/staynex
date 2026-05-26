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

export const getOfferTypeForIntent = (intent) => offerDefaults[intent]?.offerType || null;

const intentRules = [
  { intent: 'room_upgrade_interest', confidence: 0.86, words: ['upgrade', 'suite', 'better room', 'habitacion mejor', 'mejor habitacion', 'premium room'] },
  { intent: 'late_checkout_interest', confidence: 0.9, words: ['late checkout', 'leave later', 'salir mas tarde', 'salida tarde', 'checkout tarde', 'plus tard demain', 'partir plus tard', 'spaeter auschecken', 'spater auschecken'] },
  { intent: 'airport_transfer_interest', confidence: 0.9, words: ['airport transfer', 'airport', 'transfer', 'taxi', 'taxi aeropuerto', 'traslado', 'aeropuerto', 'flight', 'vuelo', 'pickup', 'arrival', 'departure', 'aeroport', 'transfert', 'vol', 'flughafen', 'flug'] },
  { intent: 'romantic_package_interest', confidence: 0.9, words: ['anniversary', 'aniversario', 'romantic', 'romantico', 'romantica', 'honeymoon', 'luna de miel'] },
  { intent: 'spa_interest', confidence: 0.86, words: ['spa', 'hammam', 'massage', 'masaje', 'wellness', 'relax', 'bienestar', 'bien-etre', 'traitement', 'behandlung'] },
  { intent: 'restaurant_interest', confidence: 0.86, words: ['restaurant', 'restaurante', 'dinner', 'cena', 'table', 'mesa', 'diner', 'dejeuner', 'essen', 'abendessen', 'tisch'] },
  { intent: 'complaint_noise', confidence: 0.88, words: ['noisy', 'noise', 'ruido', 'loud', 'molesto', 'no puedo dormir'] },
  { intent: 'complaint_cleaning', confidence: 0.86, words: ['dirty', 'sucio', 'limpieza mal', 'not clean', 'unclean', 'toallas sucias'] },
  { intent: 'vip_behavior', confidence: 0.72, words: ['vip', 'premium', 'suite', 'private', 'exclusivo'] },
  { intent: 'celebration_signal', confidence: 0.82, words: ['birthday', 'cumpleanos', 'anniversary', 'aniversario', 'celebrating', 'celebramos'] },
  { intent: 'family_trip', confidence: 0.82, words: ['family', 'familia', 'kids', 'children', 'ninos', 'bebé', 'bebe'] },
  { intent: 'business_trip', confidence: 0.8, words: ['business', 'trabajo', 'meeting', 'reunion', 'conference', 'conferencia'] },
  { intent: 'reservation_change', confidence: 0.88, words: ['change my reservation', 'modify my reservation', 'cambiar mi reserva', 'modificar mi reserva', 'change dates', 'cambiar fechas'] },
  { intent: 'cancellation_request', confidence: 0.9, words: ['cancel my reservation', 'cancel booking', 'cancelar reserva', 'cancelar mi reserva', 'refund reservation'] }
];

export const detectGuestIntent = ({ message = '', context = {} } = {}) => {
  const currentText = normalize(message);
  const recentText = normalize((context.recentMessages || []).slice(-3).map((item) => item.content || '').join(' '));
  const detected = intentRules
    .filter((rule) => includesAny(currentText, rule.words))
    .map((rule) => ({
      intent: rule.intent,
      confidence: rule.confidence,
      source: 'current_message'
    }));

  if (!detected.length && recentText) {
    intentRules
      .filter((rule) => includesAny(recentText, rule.words))
      .slice(0, 1)
      .forEach((rule) => detected.push({
        intent: rule.intent,
        confidence: Math.max(0.45, rule.confidence - 0.22),
        source: 'recent_context'
      }));
  }

  return detected[0] ? {
    ...detected[0],
    allIntents: detected
  } : {
    intent: null,
    confidence: 0,
    source: 'none',
    allIntents: []
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

  if (/\b(smoke|fire|emergency|urgent|humo|fuego|urgente|incendio|fumee|urgence|feu|rauch|brand|notfall|fuga|leak|flood|inundacion|bloqueada|locked)\b/.test(text)) {
    return {
      hasRisk: true,
      category: 'emergency',
      priority: 'urgent',
      reason: 'emergency_detected'
    };
  }

  if (['complaint_noise', 'complaint_cleaning'].includes(intentResult?.intent)) {
    return {
      hasRisk: true,
      category: intentResult.intent === 'complaint_noise' ? 'complaint' : 'housekeeping',
      priority: 'high',
      reason: intentResult.intent
    };
  }

  if (intentResult?.intent === 'cancellation_request') {
    return {
      hasRisk: true,
      category: 'reception',
      priority: 'high',
      reason: 'cancellation_request'
    };
  }

  if (includesAny(text, ['angry', 'terrible', 'unacceptable', 'refund', 'enfadado', 'enfadada', 'muy mal', 'nadie me ayuda', 'nobody is helping', 'personne ne m aide', 'niemand hilft'])) {
    return {
      hasRisk: true,
      category: 'complaint',
      priority: 'high',
      reason: 'negative_sentiment'
    };
  }

  if (includesAny(text, [
    'ducha',
    'agua',
    'grifo',
    'bano',
    'baño',
    'aire acondicionado',
    'climatizacion',
    'television',
    'tv',
    'electricidad',
    'luz',
    'luces',
    'cerradura',
    'wifi no funciona',
    'no funciona',
    'roto',
    'rota',
    'averia',
    'mantenimiento',
    'shower',
    'water',
    'tap',
    'bathroom',
    'air conditioning',
    'broken',
    'not working',
    'electricity',
    'lock',
    'douche',
    'eau',
    'climatisation',
    'ne fonctionne pas',
    'kaputt',
    'funktioniert nicht'
  ])) {
    return {
      hasRisk: true,
      category: 'maintenance',
      priority: 'high',
      reason: 'maintenance_issue'
    };
  }

  if (includesAny(text, [
    'toalla',
    'toallas',
    'limpieza',
    'limpiar',
    'limpien',
    'sabanas',
    'sabana',
    'almohada',
    'amenities',
    'amenity',
    'towel',
    'towels',
    'cleaning',
    'clean my room',
    'housekeeping',
    'sheet',
    'sheets',
    'pillow',
    'serviette',
    'serviettes',
    'menage',
    'nettoyer',
    'handtuch',
    'reinigung'
  ])) {
    return {
      hasRisk: true,
      category: 'housekeeping',
      priority: 'normal',
      reason: 'housekeeping_request'
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
      es: `Podemos consultar late checkout hasta las 14:00 por ${price}, sujeto a disponibilidad. Si te va bien, puedo enviar la solicitud.`,
      en: `We can check late checkout until 2pm for ${price}, subject to availability. If that works for you, I can send the request.`,
      fr: `Nous pouvons verifier un late checkout jusqu a 14h pour ${price}, sous reserve de disponibilite. Si cela vous convient, je peux envoyer la demande.`,
      de: `Wir koennen Late Check-out bis 14 Uhr fuer ${price} pruefen, je nach Verfuegbarkeit. Wenn das passt, kann ich die Anfrage senden.`
    },
    room_upgrade: {
      es: `Puedo pedir a recepcion que revise una mejora de habitacion desde ${price}, siempre sujeta a disponibilidad.`,
      en: `I can ask reception to check a room upgrade from ${price}, always subject to availability.`,
      fr: `Je peux demander a la reception de verifier une categorie superieure a partir de ${price}, selon disponibilite.`,
      de: `Ich kann die Rezeption bitten, ein Zimmer-Upgrade ab ${price} zu pruefen, je nach Verfuegbarkeit.`
    },
    airport_transfer: {
      es: `Podemos ayudarte con un transfer desde ${price}. Para prepararlo bien, dime hora, numero de vuelo y numero de pasajeros.`,
      en: `We can help arrange an airport transfer from ${price}. Could you share the flight number, time and number of passengers? Once I have that, I can send the request.`,
      fr: `Nous pouvons vous aider avec un transfert aeroport a partir de ${price}. Pouvez-vous partager le numero de vol, l heure et le nombre de passagers?`,
      de: `Wir koennen einen Flughafentransfer ab ${price} organisieren. Koennen Sie Flugnummer, Uhrzeit und Anzahl der Gaeste senden?`
    },
    romantic_package: {
      es: `Felicidades. Si os apetece, puedo pedir a recepcion detalles de un paquete romantico desde ${price}.`,
      en: `Congratulations. If you like, I can ask reception for details about a romantic package from ${price}.`
    },
    spa: {
      es: `Puedo consultar disponibilidad de spa desde ${price}. Si quieres, dime la hora aproximada y el numero de personas.`,
      en: `I can check spa availability from ${price}. If you like, send me the preferred time and number of guests.`,
      fr: `Je peux verifier la disponibilite du spa a partir de ${price}. Si vous voulez, indiquez-moi l heure souhaitee et le nombre de personnes.`,
      de: `Ich kann Spa-Verfuegbarkeit ab ${price} pruefen. Senden Sie mir gern die gewuenschte Uhrzeit und die Anzahl der Gaeste.`
    },
    dinner: {
      es: `Puedo ayudar a preparar una solicitud de mesa; hay opciones desde ${price}. Dime hora y numero de personas.`,
      en: `I can help prepare a table request; options start from ${price}. Please share the preferred time and number of guests.`,
      fr: `Je peux aider a preparer une demande de table; options a partir de ${price}. Indiquez l heure et le nombre de personnes.`,
      de: `Ich kann eine Tischanfrage vorbereiten; Optionen beginnen ab ${price}. Bitte senden Sie Uhrzeit und Anzahl der Gaeste.`
    }
  };

  return messages[opportunity.offerType]?.[language] || messages[opportunity.offerType]?.en || null;
};

export const generateDepartmentAction = ({ intentResult, opportunity, risk } = {}) => {
  if (risk?.hasRisk) {
    return {
      department: risk.category === 'housekeeping'
        ? 'housekeeping'
        : risk.category === 'maintenance'
          ? 'maintenance'
          : 'reception',
      actionType: risk.reason,
      title: risk.reason === 'complaint_noise'
        ? 'Noise complaint follow-up'
        : risk.category === 'maintenance'
          ? 'Maintenance follow-up'
          : risk.category === 'housekeeping'
            ? 'Housekeeping follow-up'
            : 'Guest complaint follow-up',
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
    const emergency = risk.reason === 'emergency_detected' || risk.category === 'emergency';
    if (emergency) {
      return {
        es: 'Lo tratamos como urgente. Por favor contacta ahora con recepcion o emergencias si hay riesgo inmediato; lo escalo al equipo del hotel.',
        en: 'We are treating this as urgent. Please contact reception or emergency services now if there is immediate danger; I am escalating it to the hotel team.',
        fr: 'Nous traitons cela comme urgent. Contactez aussi la reception ou les urgences s il y a un danger immediat; je le transmets a l equipe.',
        de: 'Wir behandeln dies als dringend. Bitte kontaktieren Sie sofort die Rezeption oder den Notdienst, wenn Gefahr besteht; ich leite es an das Hotelteam weiter.'
      }[language] || 'We are treating this as urgent and escalating it to the hotel team.';
    }

    if (risk.category === 'maintenance') {
      return {
        es: 'Gracias por avisar. He enviado la incidencia al equipo de mantenimiento para que puedan revisarla cuanto antes.',
        en: "Thank you for letting us know. I have sent this to maintenance so they can check it as soon as possible.",
        fr: 'Merci de nous avoir prevenus. Je transmets l incident a la maintenance afin qu elle le verifie au plus vite.',
        de: 'Danke fuer die Information. Ich habe dies an die Wartung weitergeleitet, damit es schnell geprueft wird.'
      }[language] || "Thank you for letting us know. I have sent this to maintenance.";
    }

    if (risk.category === 'housekeeping') {
      return {
        es: 'Gracias por avisar. Lo comunico al equipo de limpieza para que puedan ayudarte.',
        en: "Thank you for letting us know. I have sent this to housekeeping so they can help.",
        fr: 'Merci de nous avoir prevenus. Je transmets cela a l equipe housekeeping pour vous aider.',
        de: 'Danke fuer die Information. Ich gebe das an das Housekeeping weiter, damit Ihnen geholfen wird.'
      }[language] || "Thank you for letting us know. I have sent this to housekeeping.";
    }

    return {
      es: 'Siento mucho la molestia. Lo escalo al equipo del hotel para que puedan ayudarte con prioridad.',
      en: "I'm sorry about the inconvenience. I am escalating this to the hotel team so they can help with priority.",
      fr: 'Je suis desole pour ce desagrement. Je transmets cela a l equipe de l hotel pour une aide prioritaire.',
      de: 'Es tut mir leid fuer die Unannehmlichkeit. Ich leite dies an das Hotelteam weiter, damit es prioritaer behandelt wird.'
    }[language] || "I'm sorry about the inconvenience. I am escalating this to the hotel team.";
  }

  if (intentResult?.intent === 'reservation_change') {
    return language === 'es'
      ? 'Claro. Que te gustaria modificar de tu reserva?'
      : 'Of course. What would you like to modify in your reservation?';
  }

  if (intentResult?.intent === 'cancellation_request') {
    return language === 'es'
      ? 'Puedo derivarlo a recepcion para revisar las condiciones de cancelacion de tu reserva.'
      : 'I can forward this to reception so they can review the cancellation conditions for your reservation.';
  }

  const offerMessage = generateSuggestedOffer({ opportunity, language });

  if (offerMessage) {
    return offerMessage;
  }

  if (opportunity?.suggestedMessage) {
    return opportunity.suggestedMessage;
  }

  if (intentResult?.intent === 'celebration_signal') {
    return language === 'es'
      ? 'Felicidades. Si quieres, puedo avisar a recepcion para preparar algun detalle especial durante tu estancia.'
      : 'Congratulations. If you like, I can notify reception to prepare a special touch during your stay.';
  }

  if (intentResult?.intent === 'vip_behavior') {
    return {
      es: 'Claro. Para una experiencia privada, puedo ayudarte a preparar una solicitud discreta con preferencias, horario y numero de personas.',
      en: 'Of course. For a private experience, I can help prepare a discreet request with your preferences, preferred time and number of guests.',
      fr: 'Bien sur. Pour une experience privee, je peux preparer une demande discrete avec vos preferences, l horaire souhaite et le nombre de personnes.',
      de: 'Gerne. Fuer ein privates Erlebnis kann ich eine diskrete Anfrage mit Ihren Wuenschen, der bevorzugten Uhrzeit und der Anzahl der Gaeste vorbereiten.'
    }[language] || 'Of course. I can help prepare a discreet private experience request with the key details.';
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
        trigger_source: opportunity.triggerSource || null,
        detected_context: opportunity.detectedContext || null,
        suggested_message: opportunity.suggestedMessage || null,
        contextual_revenue: Boolean(opportunity.metadata?.contextual_revenue),
        experience_intelligence: Boolean(opportunity.metadata?.experience_intelligence),
        experience_category: opportunity.metadata?.experience_category || null,
        hotel_experience_id: opportunity.metadata?.hotel_experience_id || null,
        hotel_experience_title: opportunity.metadata?.hotel_experience_title || null,
        hotel_experience_category: opportunity.metadata?.hotel_experience_category || null,
        partner_name: opportunity.metadata?.partner_name || opportunity.hotelExperience?.partner_name || null,
        destination_personality: opportunity.metadata?.destination_personality || null,
        experience_memory_key: opportunity.metadata?.experience_memory_key || null,
        revenue_timing_reason: opportunity.metadata?.revenue_timing_reason || opportunity.timing?.reason || null,
        fatigue_score: opportunity.metadata?.fatigue_score ?? opportunity.fatigueScore ?? null,
        memory_keys: opportunity.metadata?.memory_keys || [],
        future_partner_marketplace: Boolean(opportunity.metadata?.future_partner_marketplace),
        future_pms_sync: true
      },
      updated_at: new Date().toISOString()
    };

      const { data: existing, error: existingError } = await supabase
        .from('ai_offers')
        .select('*')
        .eq('conversation_id', conversation.id)
        .eq('offer_type', opportunity.offerType)
        .in('status', ['suggested', 'sent', 'accepted', 'rejected'])
        .limit(1)
        .maybeSingle();

    if (existingError && !isMissingOffersTable(existingError)) {
      throw existingError;
    }

    if (existing) {
      return ['accepted', 'rejected'].includes(existing.status) ? null : existing;
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
      memoryType: opportunity.metadata?.experience_intelligence ? 'experience_interest' : 'upsell_interest',
      memoryKey: opportunity.metadata?.experience_memory_key || `interested_${opportunity.offerType}`,
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
      title: risk.reason === 'complaint_noise'
        ? 'Noise complaint'
        : risk.category === 'maintenance'
          ? 'Maintenance issue'
          : risk.category === 'housekeeping'
            ? 'Housekeeping request'
            : 'Concierge risk follow-up',
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
