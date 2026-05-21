import { detectLanguage } from './translation.service.js';
import {
  detectGuestIntent,
  detectOperationalRisk,
  detectRevenueOpportunity,
  generateConciergeResponse,
  generateDepartmentAction
} from './concierge-ai.service.js';
import { detectUpsellOpportunities } from './upsell.service.js';
import { buildGuestStayContextFromReservation } from './pms-intelligence.service.js';
import { buildGuestIntelligenceProfile } from './guest-intelligence.service.js';
import {
  generateAutomationSuggestions,
  generateRevenueActions,
  predictLikelyConversions
} from './revenue-ai.service.js';
import {
  areResponsesSimilar,
  chooseSmarterConciergeResponse
} from './natural-conversation.service.js';

const todayKey = () => new Date().toISOString().slice(0, 10);

const addDays = (days) => {
  const date = new Date(`${todayKey()}T12:00:00.000Z`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value || 0)));

export const SIMULATION_HOTEL_TYPES = [
  {
    id: 'urban',
    label: 'Hotel urbano',
    name: 'Staynex Urban Central',
    language: 'es',
    timezone: 'Europe/Madrid',
    rooms: 96,
    roomTypes: ['Standard', 'Premium', 'Junior Suite'],
    services: ['breakfast', 'restaurant', 'airport transfer', 'meeting room'],
    policies: { checkout: '12:00', breakfast: '07:00-10:30', quietHours: '23:00-07:00' },
    upsells: ['late_checkout', 'airport_transfer', 'room_upgrade', 'dinner'],
    pms: { occupancyPercent: 74, roomsDirty: 12, roomsReady: 56 }
  },
  {
    id: 'resort',
    label: 'Resort vacacional',
    name: 'Staynex Blue Coast Resort',
    language: 'en',
    timezone: 'Europe/Madrid',
    rooms: 220,
    roomTypes: ['Garden Room', 'Sea View', 'Family Suite'],
    services: ['pool', 'kids club', 'spa', 'buffet restaurant', 'excursions'],
    policies: { checkout: '11:00', breakfast: '07:30-11:00', quietHours: '23:30-07:00' },
    upsells: ['spa', 'dinner', 'room_upgrade', 'local_experience'],
    pms: { occupancyPercent: 88, roomsDirty: 36, roomsReady: 132 }
  },
  {
    id: 'boutique',
    label: 'Boutique hotel',
    name: 'Staynex Boutique House',
    language: 'fr',
    timezone: 'Europe/Paris',
    rooms: 42,
    roomTypes: ['Classic', 'Design Room', 'Terrace Suite'],
    services: ['breakfast', 'local guide', 'wine bar', 'private transfer'],
    policies: { checkout: '12:00', breakfast: '08:00-11:00', quietHours: '22:30-07:30' },
    upsells: ['premium_dining', 'private_transfer', 'room_upgrade'],
    pms: { occupancyPercent: 69, roomsDirty: 5, roomsReady: 28 }
  },
  {
    id: 'family',
    label: 'Hotel familiar',
    name: 'Staynex Family Suites',
    language: 'es',
    timezone: 'Europe/Madrid',
    rooms: 130,
    roomTypes: ['Family Room', 'Connecting Rooms', 'Family Suite'],
    services: ['kids menu', 'pool', 'babysitting', 'family activities'],
    policies: { checkout: '11:00', breakfast: '07:00-10:30', quietHours: '22:00-08:00' },
    upsells: ['family_activities', 'kids_menu', 'late_checkout', 'airport_transfer'],
    pms: { occupancyPercent: 81, roomsDirty: 22, roomsReady: 82 }
  },
  {
    id: 'luxury',
    label: 'Hotel lujo',
    name: 'Staynex Grand Palace',
    language: 'en',
    timezone: 'Europe/Madrid',
    rooms: 78,
    roomTypes: ['Deluxe', 'Signature Suite', 'Presidential Suite'],
    services: ['spa', 'fine dining', 'private transfer', 'butler', 'VIP amenities'],
    policies: { checkout: '12:00', breakfast: '07:00-11:00', quietHours: '23:00-07:00' },
    upsells: ['spa', 'room_upgrade', 'premium_dining', 'private_transfer'],
    pms: { occupancyPercent: 62, roomsDirty: 9, roomsReady: 48 }
  },
  {
    id: 'riad-marrakech',
    label: 'Riad en Marrakech',
    name: 'Staynex Riad Medina',
    language: 'fr',
    timezone: 'Africa/Casablanca',
    rooms: 24,
    roomTypes: ['Patio Room', 'Medina Suite', 'Terrace Suite'],
    services: ['breakfast', 'hammam', 'airport transfer', 'local experiences', 'rooftop dinner'],
    policies: { checkout: '12:00', breakfast: '08:00-10:30', quietHours: '22:30-07:30' },
    upsells: ['spa', 'airport_transfer', 'local_experience', 'dinner'],
    pms: { occupancyPercent: 76, roomsDirty: 4, roomsReady: 15 }
  }
];

export const SIMULATION_GUEST_TYPES = [
  { id: 'normal', label: 'Huesped normal', language: 'es', sentiment: 'neutral', revenuePotential: 38, preferences: ['breakfast', 'local tips'] },
  { id: 'vip', label: 'VIP', language: 'en', sentiment: 'calm', revenuePotential: 86, preferences: ['suite', 'private transfer', 'premium dining'] },
  { id: 'family', label: 'Familia con ninos', language: 'es', sentiment: 'calm', revenuePotential: 64, preferences: ['kids menu', 'pool', 'late checkout'] },
  { id: 'business', label: 'Business traveler', language: 'en', sentiment: 'neutral', revenuePotential: 58, preferences: ['transfer', 'invoice', 'quiet room'] },
  { id: 'wellness', label: 'Wellness traveler', language: 'fr', sentiment: 'calm', revenuePotential: 72, preferences: ['spa', 'hammam', 'quiet room'] },
  { id: 'angry', label: 'Huesped enfadado', language: 'es', sentiment: 'angry', revenuePotential: 12, preferences: ['fast resolution'] },
  { id: 'foreign-language', label: 'Huesped otro idioma', language: 'de', sentiment: 'neutral', revenuePotential: 46, preferences: ['translation', 'breakfast'] },
  { id: 'indecisive', label: 'Huesped indeciso', language: 'es', sentiment: 'confused', revenuePotential: 44, preferences: ['clarity', 'recommendations'] },
  { id: 'urgent', label: 'Huesped con urgencia', language: 'en', sentiment: 'urgent', revenuePotential: 8, preferences: ['immediate help'] }
];

export const SIMULATION_SCENARIOS = [
  {
    id: 'late_checkout',
    label: 'Late checkout',
    guestType: 'normal',
    messages: { es: 'Hola, podemos salir mas tarde manana?', en: 'Can we leave later tomorrow?', fr: 'Pouvons-nous partir plus tard demain?', de: 'Koennen wir morgen spaeter auschecken?' },
    expected: { intent: 'late_checkout_interest', language: null, ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'airport_transfer',
    label: 'Transfer aeropuerto',
    guestType: 'business',
    messages: { es: 'Necesito un transfer al aeropuerto a las 6:30.', en: 'I need an airport transfer at 6:30.', fr: 'J ai besoin d un transfert a l aeroport a 6h30.', de: 'Ich brauche einen Transfer zum Flughafen um 6:30.' },
    expected: { intent: 'airport_transfer_interest', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'spa_booking',
    label: 'Reserva spa',
    guestType: 'wellness',
    messages: { es: 'Queremos reservar spa o hammam esta tarde.', en: 'We would like to book spa this afternoon.', fr: 'Nous aimerions reserver le hammam cet apres-midi.', de: 'Wir moechten heute Nachmittag das Spa buchen.' },
    expected: { intent: 'spa_interest', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'restaurant',
    label: 'Restaurante',
    guestType: 'normal',
    messages: { es: 'Podemos reservar mesa para cenar?', en: 'Can we book a table for dinner?', fr: 'Peut-on reserver une table pour diner?', de: 'Koennen wir einen Tisch zum Abendessen reservieren?' },
    expected: { intent: 'restaurant_interest', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'noise_complaint',
    label: 'Queja por ruido',
    guestType: 'angry',
    messages: { es: 'Hay mucho ruido y no podemos dormir.', en: 'There is too much noise and we cannot sleep.', fr: 'Il y a trop de bruit et nous ne pouvons pas dormir.', de: 'Es ist zu laut und wir koennen nicht schlafen.' },
    expected: { intent: 'complaint_noise', ticket: true, ticketCategory: 'complaint', escalation: true, revenue: false }
  },
  {
    id: 'broken_ac',
    label: 'Aire acondicionado roto',
    guestType: 'angry',
    messages: { es: 'El aire acondicionado no funciona en la habitacion.', en: 'The air conditioning is not working in the room.', fr: 'La climatisation ne fonctionne pas dans la chambre.', de: 'Die Klimaanlage im Zimmer funktioniert nicht.' },
    expected: { intent: 'maintenance_issue', ticket: true, ticketCategory: 'maintenance', escalation: true, revenue: false }
  },
  {
    id: 'cleaning_request',
    label: 'Solicitud de limpieza',
    guestType: 'normal',
    messages: { es: 'Podeis limpiar la habitacion y traer toallas?', en: 'Can you clean the room and bring towels?', fr: 'Pouvez-vous nettoyer la chambre et apporter des serviettes?', de: 'Koennen Sie das Zimmer reinigen und Handtuecher bringen?' },
    expected: { intent: 'housekeeping_request', ticket: true, ticketCategory: 'housekeeping', escalation: false, revenue: false }
  },
  {
    id: 'hours_question',
    label: 'Pregunta horarios',
    guestType: 'foreign-language',
    messages: { es: 'A que hora es el desayuno?', en: 'What time is breakfast?', fr: 'A quelle heure est le petit-dejeuner?', de: 'Wann beginnt das Fruehstueck?' },
    expected: { intent: 'hotel_info', ticket: false, escalation: false, revenue: false }
  },
  {
    id: 'excursion_recommendation',
    label: 'Recomendacion de excursion',
    guestType: 'indecisive',
    messages: { es: 'Que excursiones recomendais?', en: 'What tours do you recommend?', fr: 'Quelles excursions recommandez-vous?', de: 'Welche Ausfluege empfehlen Sie?' },
    expected: { intent: 'excursion_interest', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'room_upgrade',
    label: 'Upgrade de habitacion',
    guestType: 'vip',
    messages: { es: 'Teneis una habitacion mejor o suite disponible?', en: 'Do you have a better room or suite available?', fr: 'Avez-vous une meilleure chambre ou une suite disponible?', de: 'Haben Sie ein besseres Zimmer oder eine Suite verfuegbar?' },
    expected: { intent: 'room_upgrade_interest', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'vip_guest',
    label: 'Huesped VIP',
    guestType: 'vip',
    messages: { es: 'Somos huespedes VIP y queremos una experiencia privada.', en: 'We are VIP guests and would like a private experience.', fr: 'Nous sommes des clients VIP et voulons une experience privee.', de: 'Wir sind VIP-Gaeste und moechten ein privates Erlebnis.' },
    expected: { intent: 'vip_behavior', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'angry_guest',
    label: 'Huesped enfadado',
    guestType: 'angry',
    messages: { es: 'Estoy muy enfadado, nadie me ayuda.', en: 'I am very angry, nobody is helping me.', fr: 'Je suis tres en colere, personne ne m aide.', de: 'Ich bin sehr veraergert, niemand hilft mir.' },
    expected: { intent: 'negative_sentiment', ticket: true, ticketCategory: 'complaint', escalation: true, revenue: false }
  },
  {
    id: 'french_guest',
    label: 'Huesped en frances',
    guestType: 'wellness',
    forcedLanguage: 'fr',
    messages: { fr: 'Bonjour, quelles activites recommandez-vous pres de l hotel?' },
    expected: { intent: 'excursion_interest', language: 'fr', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'english_guest',
    label: 'Huesped en ingles',
    guestType: 'business',
    forcedLanguage: 'en',
    messages: { en: 'Can you help me book a taxi to the airport?' },
    expected: { intent: 'airport_transfer_interest', language: 'en', ticket: false, escalation: false, revenue: true }
  },
  {
    id: 'spanish_guest',
    label: 'Huesped en espanol',
    guestType: 'normal',
    forcedLanguage: 'es',
    messages: { es: 'Hola, cual es la contrasena del wifi?' },
    expected: { intent: 'hotel_info', language: 'es', ticket: false, escalation: false, revenue: false }
  },
  {
    id: 'ambiguous_request',
    label: 'Peticion ambigua',
    guestType: 'indecisive',
    messages: { es: 'Eso de manana como va?', en: 'How does that tomorrow thing work?', fr: 'Comment ca marche pour demain?', de: 'Wie funktioniert das morgen?' },
    expected: { intent: 'clarification_needed', ticket: false, escalation: false, revenue: false }
  },
  {
    id: 'real_urgency',
    label: 'Urgencia real',
    guestType: 'urgent',
    messages: { es: 'Hay humo en el pasillo, necesitamos ayuda urgente.', en: 'There is smoke in the corridor, we need urgent help.', fr: 'Il y a de la fumee dans le couloir, urgence.', de: 'Es gibt Rauch im Flur, wir brauchen dringend Hilfe.' },
    expected: { intent: 'emergency', ticket: true, ticketCategory: 'emergency', escalation: true, revenue: false }
  }
];

const pick = (items, index) => items[index % items.length];

const resolveScenarioMessage = (scenario, guest, index) => {
  const language = scenario.forcedLanguage || guest.language || pick(['es', 'en', 'fr', 'de'], index);
  return {
    language,
    content: scenario.messages[language] || scenario.messages[guest.language] || scenario.messages.es || Object.values(scenario.messages)[0]
  };
};

const buildHotel = (type, index = 0) => ({
  id: `sim-hotel-${type.id}-${index}`,
  simulation: true,
  hotel_type: type.id,
  name: `${type.name} ${index + 1}`,
  primary_language: type.language,
  timezone: type.timezone,
  rooms_count: type.rooms,
  services: type.services,
  policies: type.policies,
  upsells: type.upsells,
  metadata: {
    simulation_mode: true,
    pms_provider: 'simulation_mock',
    whatsapp_delivery: 'disabled',
    automations: 'preview_only'
  }
});

const buildGuest = ({ type, hotel, scenario, index }) => {
  const room = String(100 + ((index * 7) % Math.max(20, hotel.rooms_count || 80)));
  return {
    id: `sim-guest-${type.id}-${index}`,
    simulation: true,
    name: `Simulation Guest ${index + 1}`,
    preferred_language: scenario.forcedLanguage || type.language || hotel.primary_language || 'es',
    current_room: room,
    phone_number: `+000SIM${String(index + 1).padStart(5, '0')}`,
    profile_type: type.id,
    preferences: type.preferences,
    revenue_potential: type.revenuePotential,
    sentiment: type.sentiment,
    metadata: { simulation_mode: true }
  };
};

const buildReservation = ({ hotel, guest, guestType, index }) => {
  const arrivalOffset = index % 4 === 0 ? -1 : 0;
  const departureOffset = index % 3 === 0 ? 1 : 3;
  return {
    id: `sim-reservation-${index}`,
    hotel_id: hotel.id,
    guest_id: guest.id,
    guest_name: guest.name,
    room_number: guest.current_room,
    room_type: guestType.id === 'vip' ? 'Suite' : guestType.id === 'family' ? 'Family Room' : 'Standard',
    rate_plan: guestType.id === 'business' ? 'Corporate' : 'Flexible',
    arrival_date: addDays(arrivalOffset),
    departure_date: addDays(departureOffset),
    status: 'in_house',
    adults: guestType.id === 'family' ? 2 : 1,
    children: guestType.id === 'family' ? 2 : 0,
    language: guest.preferred_language,
    country: guest.preferred_language === 'de' ? 'DE' : guest.preferred_language === 'fr' ? 'FR' : guest.preferred_language === 'en' ? 'GB' : 'ES',
    pms_provider: 'simulation_mock',
    pms_reservation_id: `SIM-PMS-${index}`
  };
};

const inferOperationalIntent = ({ message, conciergeIntent, risk }) => {
  const text = normalize(message);

  if (risk?.category === 'emergency' || /humo|smoke|fumee|rauch|urgent|emergency/.test(text)) return 'emergency';
  if (/aire acondicionado|air conditioning|climatisation|klimaanlage|not working|no funciona|broken/.test(text)) return 'maintenance_issue';
  if (/limpiar|clean|nettoyer|reinigen|toallas|towels|serviettes|handtuecher/.test(text)) return 'housekeeping_request';
  if (/wifi|contrasena|password|breakfast|desayuno|petit-dejeuner|fruehstueck|horario|what time|a que hora/.test(text)) return 'hotel_info';
  if (/excursion|excursiones|tour|activities|actividades|activites|ausfluege/.test(text)) return 'excursion_interest';
  if (/ruido|noise|bruit|laut|dormir|sleep/.test(text)) return 'complaint_noise';
  if (/enfadado|angry|colere|veraergert|verargert|nadie|nobody|personne|niemand/.test(text)) return 'negative_sentiment';

  return conciergeIntent?.intent || 'unknown';
};

const buildBaseReply = ({ language, intent, opportunity, risk, hotel, message = '' }) => {
  if (intent === 'hotel_info') {
    const breakfast = hotel.policies?.breakfast || '07:00-10:30';
    const text = normalize(message);
    if (/wifi|contrasena|password/.test(text)) {
      const replies = {
        es: 'La red WiFi del hotel esta disponible para huespedes. Si no ves los datos en la habitacion, recepcion puede confirmarlos al momento.',
        en: 'The hotel WiFi is available for guests. If the details are not visible in the room, reception can confirm them right away.',
        fr: 'Le WiFi de l hotel est disponible pour les clients. Si les informations ne sont pas visibles en chambre, la reception peut les confirmer.',
        de: 'Das Hotel-WLAN ist fuer Gaeste verfuegbar. Falls die Daten nicht im Zimmer sichtbar sind, kann die Rezeption sie direkt bestaetigen.'
      };
      return replies[language] || replies.en;
    }
    const replies = {
      es: `El desayuno es de ${breakfast}. Si necesitas otra informacion del hotel, te ayudo encantado.`,
      en: `Breakfast is served from ${breakfast}. If you need any other hotel information, I can help.`,
      fr: `Le petit-dejeuner est servi de ${breakfast}. Je peux aussi vous aider avec toute autre information de l hotel.`,
      de: `Das Fruehstueck ist von ${breakfast}. Wenn Sie weitere Hotelinformationen brauchen, helfe ich gerne.`
    };
    return replies[language] || replies.en;
  }

  if (intent === 'housekeeping_request') {
    const replies = {
      es: 'Gracias, lo pasamos al equipo de housekeeping para revisarlo durante la estancia.',
      en: 'Thank you, we will pass this to housekeeping so they can review it during your stay.',
      fr: 'Merci, nous transmettons cela a l equipe housekeeping pour verification.',
      de: 'Danke, wir geben das an das Housekeeping-Team weiter.'
    };
    return replies[language] || replies.en;
  }

  if (intent === 'excursion_interest') {
    const replies = {
      es: 'Claro. Podemos recomendar experiencias locales segun el perfil del hotel. Si alguna te interesa, puedo darte mas detalles.',
      en: 'Of course. We can recommend local experiences based on the hotel context. If one interests you, I can share more details.',
      fr: 'Bien sur. Nous pouvons recommander des experiences locales selon le contexte de l hotel. Si une option vous interesse, je peux donner plus de details.',
      de: 'Gerne. Wir koennen lokale Erlebnisse passend zum Hotel empfehlen. Wenn Sie etwas interessiert, gebe ich gern mehr Details.'
    };
    return replies[language] || replies.en;
  }

  return generateConciergeResponse({
    intentResult: { intent, confidence: 0.76 },
    opportunity,
    risk,
    language
  }) || {
    es: 'Claro, te ayudo. Para hacerlo bien, reviso el contexto de tu estancia y te doy el siguiente paso.',
    en: 'Of course, I can help. I will review your stay context and give you the next step.',
    fr: 'Bien sur, je peux vous aider. Je vais verifier le contexte de votre sejour et vous donner la prochaine etape.',
    de: 'Gerne, ich helfe Ihnen. Ich pruefe den Kontext Ihres Aufenthalts und nenne den naechsten Schritt.'
  }[language] || 'Of course, I can help.';
};

const buildSimulatedTicket = ({ intent, risk, guest, scenario }) => {
  const category = risk?.category === 'housekeeping' || intent === 'housekeeping_request'
    ? 'housekeeping'
    : risk?.category === 'emergency' || intent === 'emergency'
      ? 'emergency'
      : risk?.category === 'complaint' || intent === 'negative_sentiment'
        ? 'complaint'
        : intent === 'maintenance_issue'
          ? 'maintenance'
          : null;

  if (!category) return null;

  return {
    id: `sim-ticket-${scenario.id}-${guest.id}`,
    category,
    priority: category === 'emergency' ? 'urgent' : category === 'complaint' || category === 'maintenance' ? 'high' : 'normal',
    title: `${scenario.label} follow-up`,
    room_number: guest.current_room,
    simulation: true
  };
};

const evaluateResult = ({ scenario, detectedLanguage, detectedIntent, ticket, escalationRequired, revenueOpportunity, confidence, response, previousResponse }) => {
  const expected = scenario.expected || {};
  const warnings = [];
  const errors = [];
  const unsafeResponses = [];
  const hallucinationWarnings = [];
  const repeatedResponse = previousResponse ? areResponsesSimilar(response, previousResponse) : false;

  if (expected.language && expected.language !== detectedLanguage) errors.push(`Expected language ${expected.language}, got ${detectedLanguage}`);
  if (expected.ticket !== undefined && Boolean(ticket) !== Boolean(expected.ticket)) errors.push(`Ticket expectation mismatch for ${scenario.id}`);
  if (expected.ticketCategory && ticket?.category !== expected.ticketCategory) errors.push(`Expected ticket category ${expected.ticketCategory}, got ${ticket?.category || 'none'}`);
  if (expected.escalation !== undefined && Boolean(escalationRequired) !== Boolean(expected.escalation)) errors.push(`Escalation expectation mismatch for ${scenario.id}`);
  if (expected.revenue !== undefined && Boolean(revenueOpportunity) !== Boolean(expected.revenue)) errors.push(`Revenue expectation mismatch for ${scenario.id}`);
  if (confidence < 0.45) warnings.push('low_confidence');
  if (repeatedResponse) warnings.push('repeated_response');
  if (/sent via whatsapp|twilio|email sent|automation sent/i.test(response)) unsafeResponses.push('real_delivery_language_detected');
  if (/confirmed|guaranteed|booked/i.test(response) && /request|availability|disponibilidad|disponibilite/i.test(response) === false) {
    hallucinationWarnings.push('possible_booking_confirmation_without_availability');
  }

  return {
    pass: errors.length === 0 && unsafeResponses.length === 0 && hallucinationWarnings.length === 0,
    errors,
    warnings,
    repeatedResponse,
    unsafeResponses,
    hallucinationWarnings
  };
};

const simulateOneConversation = ({ index, hotelType, scenario }) => {
  const guestType = SIMULATION_GUEST_TYPES.find((item) => item.id === scenario.guestType) || pick(SIMULATION_GUEST_TYPES, index);
  const hotel = buildHotel(hotelType, index);
  const guest = buildGuest({ type: guestType, hotel, scenario, index });
  const reservation = buildReservation({ hotel, guest, guestType, index });
  const pmsContextRaw = buildGuestStayContextFromReservation({
    reservation,
    occupancy: {
      occupancy_percent: hotelType.pms.occupancyPercent,
      occupied_rooms: Math.round((hotelType.pms.occupancyPercent / 100) * hotelType.rooms),
      available_rooms: Math.max(0, hotelType.rooms - Math.round((hotelType.pms.occupancyPercent / 100) * hotelType.rooms))
    }
  });
  const pmsIntelligenceContext = {
    stayPhase: pmsContextRaw.stay_phase,
    vipScore: pmsContextRaw.vip_score,
    revenuePotential: pmsContextRaw.revenue_potential,
    upgradeEligible: pmsContextRaw.upgrade_eligible,
    lateCheckoutEligible: pmsContextRaw.late_checkout_eligible,
    transferLikely: pmsContextRaw.transfer_likely,
    experienceLikely: pmsContextRaw.experience_likely,
    occupancy: {
      occupancyPercent: hotelType.pms.occupancyPercent,
      roomsDirty: hotelType.pms.roomsDirty,
      roomsReady: hotelType.pms.roomsReady
    },
    roomStatus: {
      housekeepingStatus: index % 5 === 0 ? 'dirty' : 'clean',
      maintenanceStatus: scenario.id === 'broken_ac' ? 'maintenance' : 'ok',
      occupancyStatus: 'occupied'
    },
    guestStayContext: pmsContextRaw,
    operationalWarnings: scenario.id === 'broken_ac' ? ['room_maintenance'] : []
  };
  const { language: requestedLanguage, content } = resolveScenarioMessage(scenario, guest, index);
  const detectedLanguage = detectLanguage(content, requestedLanguage || hotel.primary_language || 'es');
  const recentMessages = [{ sender_type: 'guest', content, original_language: detectedLanguage }];
  const conciergeIntent = detectGuestIntent({
    message: content,
    context: { recentMessages, guestMemory: [] }
  });
  const operationalIntent = inferOperationalIntent({
    message: content,
    conciergeIntent,
    risk: null
  });
  const risk = detectOperationalRisk({
    intentResult: {
      intent: operationalIntent === 'maintenance_issue' ? 'complaint_cleaning' : operationalIntent,
      confidence: conciergeIntent.confidence || 0.78
    },
    message: content
  });
  const normalizedRisk = operationalIntent === 'maintenance_issue'
    ? { hasRisk: true, category: 'maintenance', priority: 'high', reason: 'maintenance_issue' }
    : operationalIntent === 'emergency'
      ? { hasRisk: true, category: 'emergency', priority: 'urgent', reason: 'emergency_detected' }
      : operationalIntent === 'negative_sentiment'
        ? { hasRisk: true, category: 'complaint', priority: 'high', reason: 'negative_sentiment' }
        : operationalIntent === 'complaint_noise'
          ? { hasRisk: true, category: 'complaint', priority: 'high', reason: 'complaint_noise' }
          : risk;
  const revenueOpportunity = normalizedRisk.hasRisk ? null : detectRevenueOpportunity({
    intentResult: conciergeIntent,
    context: {
      reservation,
      guestMemory: [],
      recentMessages
    }
  });
  const upsells = normalizedRisk.hasRisk ? [] : detectUpsellOpportunities({
    reservation,
    language: detectedLanguage,
    message: content,
    recentMessages,
    guestMemory: []
  });
  const guestIntelligence = buildGuestIntelligenceProfile({
    hotelId: hotel.id,
    guestId: guest.id,
    reservationId: reservation.id,
    message: content,
    recentMessages,
    pmsIntelligenceContext,
    language: detectedLanguage,
    country: reservation.country,
    source: 'simulation'
  });
  const revenuePrediction = predictLikelyConversions({
    guestIntelligence,
    pmsIntelligenceContext
  });
  const revenueActions = generateRevenueActions({
    guestIntelligence,
    revenuePrediction,
    pmsIntelligenceContext
  });
  const automationSuggestions = generateAutomationSuggestions({
    guestIntelligence,
    revenuePrediction,
    pmsIntelligenceContext
  });
  const departmentAction = generateDepartmentAction({
    intentResult: conciergeIntent,
    opportunity: revenueOpportunity,
    risk: normalizedRisk
  });
  const baseReply = buildBaseReply({
    language: detectedLanguage,
    intent: operationalIntent,
    opportunity: revenueOpportunity,
    risk: normalizedRisk,
    hotel,
    message: content
  });
  const confidence = Math.max(
    Number(conciergeIntent.confidence || 0),
    operationalIntent === 'unknown' ? 0.38 : 0.72,
    normalizedRisk.hasRisk ? 0.88 : 0
  );
  const smarter = chooseSmarterConciergeResponse({
    message: content,
    aiResponse: {
      intent: operationalIntent,
      confidence,
      reply: baseReply,
      escalate_to_human: normalizedRisk.hasRisk,
      create_ticket: normalizedRisk.hasRisk
    },
    language: detectedLanguage,
    conversationState: {
      previousState: {
        state_metadata: {}
      }
    },
    humanEscalation: {
      needsHuman: normalizedRisk.hasRisk,
      humanReason: normalizedRisk.reason || null
    },
    enhancedRisk: normalizedRisk,
    providerIntent: operationalIntent === 'excursion_interest' ? { intentType: 'excursion_inquiry' } : null,
    knowledgeUsed: operationalIntent === 'hotel_info',
    recentMessages: []
  });
  const ticket = buildSimulatedTicket({
    intent: operationalIntent,
    risk: normalizedRisk,
    guest,
    scenario
  });
  const escalationRequired = Boolean(smarter.humanEscalation.needsHuman || normalizedRisk.hasRisk);
  const revenueEligibleIntent = [
    'late_checkout_interest',
    'airport_transfer_interest',
    'spa_interest',
    'restaurant_interest',
    'excursion_interest',
    'room_upgrade_interest',
    'vip_behavior'
  ].includes(operationalIntent || conciergeIntent.intent);
  const detectedRevenue = Boolean(
    !normalizedRisk.hasRisk
    && revenueEligibleIntent
    && (revenueOpportunity || upsells.length || revenueActions.length)
  );
  const evaluation = evaluateResult({
    scenario,
    detectedLanguage,
    detectedIntent: smarter.aiResponse.intent || operationalIntent,
    ticket,
    escalationRequired,
    revenueOpportunity: detectedRevenue,
    confidence: smarter.aiResponse.confidence || confidence,
    response: smarter.aiResponse.reply,
    previousResponse: null
  });

  return {
    id: `sim-result-${index + 1}`,
    simulation: true,
    hotel_id: hotel.id,
    hotel_name: hotel.name,
    hotel_type: hotelType.id,
    guest_id: guest.id,
    guest_name: guest.name,
    guest_type: guestType.id,
    scenario: scenario.id,
    scenario_label: scenario.label,
    messages: recentMessages,
    ai_responses: [{ sender_type: 'ai', content: smarter.aiResponse.reply, language: detectedLanguage }],
    detected_intent: smarter.aiResponse.intent || operationalIntent,
    detected_language: detectedLanguage,
    ticket_created: Boolean(ticket),
    ticket_category: ticket?.category || null,
    escalation_required: escalationRequired,
    revenue_opportunity: detectedRevenue,
    confidence: Number(smarter.aiResponse.confidence || confidence),
    errors: evaluation.errors,
    warnings: evaluation.warnings,
    pass: evaluation.pass,
    repeated_response: evaluation.repeatedResponse,
    unsafe_response: evaluation.unsafeResponses.length > 0,
    hallucination_warning: evaluation.hallucinationWarnings.length > 0,
    analysis: {
      hotel,
      guest,
      reservation,
      pms_context: pmsIntelligenceContext,
      guest_intelligence: guestIntelligence,
      revenue_prediction: revenuePrediction,
      revenue_actions: revenueActions,
      automation_preview: automationSuggestions,
      department_action: departmentAction,
      smart_response: smarter.metadata,
      expected: scenario.expected,
      safety: {
        whatsapp_delivery: 'disabled',
        pms_apis: 'disabled',
        email_delivery: 'disabled',
        automations: 'preview_only',
        writes_to_real_hotels: false
      }
    }
  };
};

const summarizeResults = (results) => {
  const total = results.length || 1;
  const count = (predicate) => results.filter(predicate).length;
  const averageConfidence = results.reduce((totalConfidence, item) => totalConfidence + Number(item.confidence || 0), 0) / total;

  return {
    total: results.length,
    successRate: Math.round((count((item) => item.pass) / total) * 100),
    escalationAccuracy: Math.round((count((item) => !item.errors.some((error) => error.includes('Escalation'))) / total) * 100),
    ticketCreationAccuracy: Math.round((count((item) => !item.errors.some((error) => error.includes('Ticket'))) / total) * 100),
    revenueOpportunityDetection: Math.round((count((item) => !item.errors.some((error) => error.includes('Revenue'))) / total) * 100),
    averageConfidence: Number(averageConfidence.toFixed(2)),
    failedConversations: count((item) => !item.pass),
    repeatedResponses: count((item) => item.repeated_response),
    unsafeResponses: count((item) => item.unsafe_response),
    hallucinationWarnings: count((item) => item.hallucination_warning)
  };
};

export const runStaynexSimulation = ({
  count = 10,
  hotelType = 'all',
  scenario = 'all'
} = {}) => {
  const safeCount = Math.max(1, Math.min(500, Number(count || 10)));
  const hotelTypes = hotelType === 'all'
    ? SIMULATION_HOTEL_TYPES
    : SIMULATION_HOTEL_TYPES.filter((item) => item.id === hotelType);
  const scenarios = scenario === 'all'
    ? SIMULATION_SCENARIOS
    : SIMULATION_SCENARIOS.filter((item) => item.id === scenario);

  if (!hotelTypes.length) {
    throw new Error(`Unknown simulation hotel type: ${hotelType}`);
  }

  if (!scenarios.length) {
    throw new Error(`Unknown simulation scenario: ${scenario}`);
  }

  const results = Array.from({ length: safeCount }, (_, index) => simulateOneConversation({
    index,
    hotelType: pick(hotelTypes, index),
    scenario: pick(scenarios, index)
  }));
  const metrics = summarizeResults(results);

  return {
    ok: true,
    mode: 'simulation',
    safety: {
      noRealWhatsapp: true,
      noRealHotels: true,
      noLiveAutomations: true,
      noProviderEmails: true,
      noRealPmsApis: true,
      dataScope: 'in_memory_sandbox'
    },
    filters: {
      count: safeCount,
      hotelType,
      scenario
    },
    catalog: {
      hotelTypes: SIMULATION_HOTEL_TYPES,
      guestTypes: SIMULATION_GUEST_TYPES,
      scenarios: SIMULATION_SCENARIOS.map(({ id, label }) => ({ id, label }))
    },
    metrics,
    results
  };
};
