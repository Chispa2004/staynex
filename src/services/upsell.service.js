import { getSupabase, createTicketRecord } from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { createConversion } from './revenue.service.js';

export const UPSELL_TYPES = {
  ROOM_UPGRADE: 'room_upgrade',
  LATE_CHECKOUT: 'late_checkout',
  AIRPORT_TRANSFER: 'airport_transfer',
  ROMANTIC_PACKAGE: 'romantic_package',
  SPA: 'spa',
  DINNER: 'dinner',
  BREAKFAST_UPGRADE: 'breakfast_upgrade'
};

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const isMissingUpsellsTable = (error) => (
  error?.message?.includes('ai_upsells')
  || error?.details?.includes('ai_upsells')
  || error?.hint?.includes('ai_upsells')
);

const dayDiff = (from, to) => {
  if (!from || !to) {
    return null;
  }

  const fromDate = new Date(`${from}T12:00:00.000Z`);
  const toDate = new Date(`${to}T12:00:00.000Z`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
};

const daysUntil = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  return dayDiff(todayKey, dateValue);
};

const languageText = (type, language = 'es') => {
  const messages = {
    romantic_package: {
      es: 'Si os apetece, recepcion puede ayudaros con una experiencia romantica o una reserva especial.',
      en: 'If you like, reception can help with a romantic experience or a special booking.',
      fr: 'Si vous le souhaitez, la reception peut vous aider avec une experience romantique ou une reservation speciale.',
      de: 'Wenn Sie mochten, kann die Rezeption bei einem romantischen Erlebnis oder einer besonderen Reservierung helfen.'
    },
    airport_transfer: {
      es: 'Tambien podemos ayudarte con transfer desde el aeropuerto si lo necesitas.',
      en: 'We can also help with an airport transfer if you need it.',
      fr: 'Nous pouvons aussi vous aider avec un transfert depuis l aeroport si besoin.',
      de: 'Wir konnen Ihnen bei Bedarf auch mit einem Flughafentransfer helfen.'
    },
    late_checkout: {
      es: 'Si necesitas salir mas tarde, puedo avisar a recepcion para consultar late checkout.',
      en: 'If you need to leave later, I can ask reception to check late checkout options.',
      fr: 'Si vous souhaitez partir plus tard, je peux demander a la reception de verifier le late checkout.',
      de: 'Wenn Sie spater abreisen mochten, kann ich die Rezeption bitten, Late Check-out zu prufen.'
    },
    dinner: {
      es: 'Si os apetece cenar en el hotel, puedo avisar al equipo para ayudaros con la reserva.',
      en: 'If you would like dinner at the hotel, I can notify the team to help with a booking.',
      fr: 'Si vous souhaitez diner a l hotel, je peux prevenir l equipe pour vous aider a reserver.',
      de: 'Wenn Sie im Hotel zu Abend essen mochten, kann ich das Team fur eine Reservierung informieren.'
    },
    spa: {
      es: 'Si quieres relajarte, tambien puedo avisar al equipo del spa para ayudarte con una reserva.',
      en: 'If you want to relax, I can also notify the spa team to help with a booking.',
      fr: 'Si vous souhaitez vous detendre, je peux aussi prevenir le spa pour vous aider a reserver.',
      de: 'Wenn Sie entspannen mochten, kann ich auch das Spa-Team fur eine Buchung informieren.'
    },
    room_upgrade: {
      es: 'Si quieres mejorar la habitacion, puedo avisar a recepcion para consultar opciones disponibles.',
      en: 'If you would like to upgrade your room, I can ask reception to check available options.',
      fr: 'Si vous souhaitez ameliorer votre chambre, je peux demander a la reception les options disponibles.',
      de: 'Wenn Sie ein Zimmer-Upgrade mochten, kann ich die Rezeption nach verfugbaren Optionen fragen.'
    },
    breakfast_upgrade: {
      es: 'Si quieres anadir desayuno a tu estancia, puedo avisar a recepcion para ayudarte.',
      en: 'If you would like to add breakfast to your stay, I can notify reception to help.',
      fr: 'Si vous souhaitez ajouter le petit-dejeuner a votre sejour, je peux prevenir la reception.',
      de: 'Wenn Sie Fruhstuck hinzufugen mochten, kann ich die Rezeption informieren.'
    }
  };

  return messages[type]?.[language] || messages[type]?.es || '';
};

const titleForType = (type) => ({
  room_upgrade: 'Room upgrade opportunity',
  late_checkout: 'Late checkout opportunity',
  airport_transfer: 'Airport transfer opportunity',
  romantic_package: 'Romantic package opportunity',
  spa: 'Spa opportunity',
  dinner: 'Dinner opportunity',
  breakfast_upgrade: 'Breakfast upgrade opportunity'
})[type] || 'Upsell opportunity';

const buildOpportunity = ({ type, description, triggerSource, confidence, language, metadata = {} }) => ({
  upsell_type: type,
  title: titleForType(type),
  description,
  suggested_message: languageText(type, language),
  trigger_source: triggerSource,
  confidence,
  metadata
});

export const detectUpsellOpportunities = ({
  reservation = null,
  language = 'es',
  message = '',
  recentMessages = [],
  hotelKnowledge = [],
  guestMemory = []
} = {}) => {
  const currentText = normalize(message);
  const recentText = normalize(recentMessages.map((item) => item.content || '').join(' '));
  const text = [currentText, recentText].join(' ');
  const boardBasis = normalize(reservation?.board_basis || '');
  const roomType = normalize(reservation?.room_type || '');
  const memoryKeys = new Set((guestMemory || []).map((item) => item.memory_key));
  const stayLength = dayDiff(reservation?.arrival_date, reservation?.departure_date);
  const arrivalInDays = daysUntil(reservation?.arrival_date);
  const departureInDays = daysUntil(reservation?.departure_date);
  const currentMentionsRomantic = includesAny(currentText, ['pareja', 'romantic', 'romantico', 'romantica', 'anniversary', 'aniversario', 'honeymoon', 'luna de miel']);
  const currentMentionsTransfer = includesAny(currentText, ['aeropuerto', 'airport', 'transfer', 'traslado', 'flight', 'vuelo']);
  const currentMentionsLateCheckout = includesAny(currentText, ['late checkout', 'leave later', 'salir mas tarde', 'salida tarde', 'check out tarde', 'checkout tarde']);
  const currentMentionsDinner = includesAny(currentText, ['cena', 'cenar', 'dinner', 'restaurant', 'restaurante']);
  const currentMentionsSpa = includesAny(currentText, ['spa', 'masaje', 'massage', 'relax', 'relaj', 'wellness']);
  const currentMentionsUpgrade = includesAny(currentText, ['upgrade', 'mejor habitacion', 'habitacion mejor', 'suite']);
  const opportunities = [];

  if (currentMentionsRomantic) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.ROMANTIC_PACKAGE,
      description: 'Guest context suggests a couple or romantic stay.',
      triggerSource: 'current_message',
      confidence: memoryKeys.has('anniversary_trip') ? 0.9 : 0.86,
      language,
      metadata: { stayLength, boardBasis: reservation?.board_basis || null, memoryKeys: Array.from(memoryKeys) }
    }));
  }

  if (
    currentMentionsTransfer
    || (arrivalInDays !== null && arrivalInDays >= 0 && arrivalInDays <= 7)
  ) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.AIRPORT_TRANSFER,
      description: 'Guest may need arrival transport support.',
      triggerSource: currentMentionsTransfer ? 'current_message' : 'pre_arrival',
      confidence: currentMentionsTransfer ? 0.9 : 0.68,
      language,
      metadata: { arrivalInDays, arrivalDate: reservation?.arrival_date || null }
    }));
  }

  if (
    currentMentionsLateCheckout
    || departureInDays === 1
  ) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.LATE_CHECKOUT,
      description: 'Departure timing may make late checkout useful.',
      triggerSource: currentMentionsLateCheckout ? 'current_message' : 'departure_timing',
      confidence: currentMentionsLateCheckout ? 0.88 : 0.7,
      language,
      metadata: { departureInDays, departureDate: reservation?.departure_date || null }
    }));
  }

  if (
    currentMentionsDinner
    || (boardBasis.includes('breakfast') && Number(stayLength) >= 3)
  ) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.DINNER,
      description: 'Reservation or conversation suggests dinner may be useful.',
      triggerSource: currentMentionsDinner ? 'current_message' : 'reservation_board_basis',
      confidence: currentMentionsDinner ? 0.88 : 0.72,
      language,
      metadata: { stayLength, boardBasis: reservation?.board_basis || null }
    }));
  }

  if (currentMentionsSpa) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.SPA,
      description: 'Guest mentioned relaxation, spa or massage.',
      triggerSource: 'current_message',
      confidence: memoryKeys.has('interested_spa') ? 0.9 : 0.86,
      language,
      metadata: { knowledgeKeys: hotelKnowledge.map((item) => item.key).filter(Boolean).slice(0, 5) }
    }));
  }

  if (currentMentionsUpgrade || roomType.includes('standard')) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.ROOM_UPGRADE,
      description: 'Room type or message suggests a room upgrade could be relevant.',
      triggerSource: currentMentionsUpgrade ? 'current_message' : 'reservation_room_type',
      confidence: currentMentionsUpgrade ? 0.84 : 0.62,
      language,
      metadata: { roomType: reservation?.room_type || null }
    }));
  }

  if (
    includesAny(text, ['desayuno', 'breakfast', 'petit dejeuner', 'fruhstuck'])
    && includesAny(boardBasis, ['room only', 'solo alojamiento', 'no breakfast'])
  ) {
    opportunities.push(buildOpportunity({
      type: UPSELL_TYPES.BREAKFAST_UPGRADE,
      description: 'Guest asked about breakfast and reservation may not include it.',
      triggerSource: 'reservation_board_basis',
      confidence: 0.82,
      language,
      metadata: { boardBasis: reservation?.board_basis || null }
    }));
  }

  return opportunities
    .filter((opportunity, index, items) => (
      items.findIndex((item) => item.upsell_type === opportunity.upsell_type) === index
    ))
    .slice(0, 3);
};

export const createAiUpsell = async ({
  hotel,
  guest,
  conversation,
  reservation,
  opportunity
}) => {
  try {
    const supabase = getSupabase();

    if (conversation?.id) {
      const { data: existing, error: existingError } = await supabase
        .from('ai_upsells')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('upsell_type', opportunity.upsell_type)
        .in('status', ['suggested', 'shown'])
        .limit(1)
        .maybeSingle();

      if (existingError && !isMissingUpsellsTable(existingError)) {
        throw existingError;
      }

      if (existing?.id) {
        return null;
      }
    }

    const { data, error } = await supabase
      .from('ai_upsells')
      .insert({
        hotel_id: hotel.id,
        reservation_id: reservation?.id || null,
        guest_id: guest?.id || null,
        conversation_id: conversation?.id || null,
        ...opportunity
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingUpsellsTable(error)) {
        logger.warn('ai_upsells table missing; skipping upsell storage');
        return null;
      }

      throw error;
    }

    logger.info('AI upsell stored', {
      upsellId: data.id,
      hotelId: hotel.id,
      conversationId: conversation?.id || null,
      upsellType: data.upsell_type,
      confidence: data.confidence
    });

    try {
      await createConversion({
        hotelId: hotel.id,
        guestId: guest?.id || null,
        reservationId: reservation?.id || null,
        conversationId: conversation?.id || null,
        upsellId: data.id,
        upsellType: data.upsell_type,
        status: 'pending',
        source: 'ai_upsell',
        notes: 'Created automatically from AI upsell detection'
      });
    } catch (conversionError) {
      logger.warn('Revenue conversion write failed after upsell detection', {
        message: conversionError.message
      });
    }


    return data;
  } catch (error) {
    logger.warn('AI upsell write failed', {
      message: error.message
    });

    return null;
  }
};

export const storeUpsellOpportunities = async ({
  hotel,
  guest,
  conversation,
  reservation,
  opportunities
}) => {
  const stored = [];

  for (const opportunity of opportunities || []) {
    const record = await createAiUpsell({
      hotel,
      guest,
      conversation,
      reservation,
      opportunity
    });

    if (record) {
      stored.push(record);
    }
  }

  return stored;
};

export const getRecentUpsellsForConversation = async (conversationId, { limit = 5 } = {}) => {
  if (!conversationId) {
    return [];
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_upsells')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingUpsellsTable(error)) {
        return [];
      }

      throw error;
    }

    return data || [];
  } catch (error) {
    logger.warn('Recent upsells lookup failed', { message: error.message });
    return [];
  }
};

export const detectUpsellInterest = ({ message, recentUpsells = [] }) => {
  const text = normalize(message);
  const positive = includesAny(text, [
    'si me interesa',
    'me interesa',
    'quiero',
    'reservalo',
    'reserva',
    'yes',
    'interested',
    'book it',
    'sounds good',
    'oui',
    'interesse',
    'ja',
    'gerne'
  ]);

  if (!positive) {
    return null;
  }

  const explicitType = [
    [UPSELL_TYPES.LATE_CHECKOUT, ['late checkout', 'salir mas tarde', 'checkout tarde']],
    [UPSELL_TYPES.AIRPORT_TRANSFER, ['transfer', 'aeropuerto', 'airport', 'traslado']],
    [UPSELL_TYPES.ROMANTIC_PACKAGE, ['romantic', 'romantico', 'romantica', 'aniversario']],
    [UPSELL_TYPES.SPA, ['spa', 'masaje', 'massage']],
    [UPSELL_TYPES.DINNER, ['cena', 'dinner', 'restaurante', 'restaurant']],
    [UPSELL_TYPES.ROOM_UPGRADE, ['upgrade', 'suite', 'mejor habitacion']],
    [UPSELL_TYPES.BREAKFAST_UPGRADE, ['desayuno', 'breakfast']]
  ].find(([, words]) => includesAny(text, words))?.[0];

  const matchedUpsell = explicitType
    ? recentUpsells.find((upsell) => upsell.upsell_type === explicitType)
    : recentUpsells[0];

  return {
    type: explicitType || matchedUpsell?.upsell_type || UPSELL_TYPES.LATE_CHECKOUT,
    upsell: matchedUpsell || null
  };
};

export const createUpsellInterestTicket = async ({
  hotel,
  guest,
  conversation,
  interest,
  message
}) => {
  const title = `${interest.type}_interest`;

  const ticket = await createTicketRecord({
    hotelId: hotel.id,
    guestId: guest.id,
    conversationId: conversation.id,
    roomNumber: guest.current_room,
    category: 'reception',
    title,
    description: `Guest showed interest in ${interest.type}: ${message}`,
    priority: 'normal'
  });

  if (interest.upsell?.id) {
    try {
      const supabase = getSupabase();
      await supabase
        .from('ai_upsells')
        .update({
          accepted: true,
          rejected: false,
          status: 'accepted'
        })
        .eq('id', interest.upsell.id);

      await createConversion({
        hotelId: hotel.id,
        guestId: guest?.id || null,
        conversationId: conversation?.id || null,
        upsellId: interest.upsell.id,
        upsellType: interest.type,
        status: 'accepted',
        source: 'guest_interest',
        notes: `Guest showed interest in ${interest.type}`
      });
    } catch (error) {
      logger.warn('Could not mark upsell as accepted', { message: error.message });
    }
  }

  return ticket;
};
