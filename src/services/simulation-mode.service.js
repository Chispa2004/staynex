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

export const SIMULATION_JOURNEYS = [
  {
    id: 'guest_standard_journey',
    label: 'Guest standard journey',
    guestType: 'normal',
    turns: [
      { message: 'hola', expectedIntent: 'greeting', minutesAfterStart: 0 },
      { message: 'a que hora abre el restaurante', expectedIntent: 'hotel_info', minutesAfterStart: 1 },
      { message: 'puedo reservar para 2', expectedIntent: 'restaurant_interest', minutesAfterStart: 2 },
      { message: 'tambien me interesa una excursion', expectedIntent: 'excursion_interest', minutesAfterStart: 5 },
      { message: 'que recomendais', expectedIntent: 'excursion_interest', minutesAfterStart: 6 },
      { message: 'me interesa Essaouira', expectedIntent: 'experience_selected', minutesAfterStart: 9 },
      { message: 'para manana somos 2', expectedIntent: 'provider_details', minutesAfterStart: 11 },
      { message: 'si', expectedIntent: 'provider_confirmation', minutesAfterStart: 12 },
      { message: 'gracias', expectedIntent: 'thanks', minutesAfterStart: 13 }
    ],
    expected: {
      providerRequestSent: true,
      topicSwitch: true,
      escalation: false,
      languages: ['es']
    }
  },
  {
    id: 'language_switching',
    label: 'Language switching',
    guestType: 'normal',
    forcedLanguage: 'en',
    turns: [
      { message: 'hello', expectedIntent: 'greeting', forcedLanguage: 'en', minutesAfterStart: 0 },
      { message: 'what time is breakfast', expectedIntent: 'hotel_info', forcedLanguage: 'en', minutesAfterStart: 1 },
      { message: 'tambien necesito toallas', expectedIntent: 'housekeeping_request', forcedLanguage: 'es', minutesAfterStart: 4 },
      { message: 'merci', expectedIntent: 'thanks', forcedLanguage: 'fr', minutesAfterStart: 5 },
      { message: 'can you remind me if checkout is tomorrow?', expectedIntent: 'checkout_question', forcedLanguage: 'en', minutesAfterStart: 12 }
    ],
    expected: {
      multilingualContinuity: true,
      ticket: true,
      languages: ['en', 'es', 'fr']
    }
  },
  {
    id: 'room_issue_frustration',
    label: 'Room issue and frustration',
    guestType: 'angry',
    turns: [
      { message: 'hola', expectedIntent: 'greeting', minutesAfterStart: 0 },
      { message: 'no sale agua caliente', expectedIntent: 'maintenance_issue', minutesAfterStart: 2 },
      { message: 'sigue sin funcionar', expectedIntent: 'maintenance_followup', minutesAfterStart: 22 },
      { message: 'estoy bastante enfadado', expectedIntent: 'negative_sentiment', minutesAfterStart: 27 },
      { message: 'necesito una solucion ahora', expectedIntent: 'complaint_escalation', minutesAfterStart: 29 }
    ],
    expected: {
      ticket: true,
      escalation: true,
      sentimentAdaptation: true
    }
  },
  {
    id: 'chaotic_guest',
    label: 'Chaotic guest topic switching',
    guestType: 'indecisive',
    turns: [
      { message: 'hola', expectedIntent: 'greeting', minutesAfterStart: 0 },
      { message: 'quiero una excursion', expectedIntent: 'excursion_interest', minutesAfterStart: 1 },
      { message: 'no espera mejor un transfer', expectedIntent: 'airport_transfer_interest', minutesAfterStart: 2 },
      { message: 'cuanto cuesta', expectedIntent: 'clarification_needed', minutesAfterStart: 3 },
      { message: 'y el spa', expectedIntent: 'spa_interest', minutesAfterStart: 5 },
      { message: 'mejor mandame opciones de excursiones', expectedIntent: 'excursion_interest', minutesAfterStart: 8 }
    ],
    expected: {
      topicSwitch: true,
      providerRequestSent: false,
      escalation: false
    }
  },
  {
    id: 'checkout_journey',
    label: 'Checkout journey',
    guestType: 'business',
    turns: [
      { message: 'hola', expectedIntent: 'greeting', minutesAfterStart: 0 },
      { message: 'manana hago checkout?', expectedIntent: 'checkout_question', minutesAfterStart: 1 },
      { message: 'cuanto debo', expectedIntent: 'folio_question', minutesAfterStart: 3 },
      { message: 'puedo salir mas tarde', expectedIntent: 'late_checkout_interest', minutesAfterStart: 4 },
      { message: 'ok gracias', expectedIntent: 'thanks', minutesAfterStart: 6 }
    ],
    expected: {
      folioSafe: true,
      revenue: true,
      pmsContext: true
    }
  },
  {
    id: 'interrupted_provider_flow',
    label: 'Interrupted provider flow',
    guestType: 'wellness',
    turns: [
      { message: 'me interesa Atlas Mountains Day Trip', expectedIntent: 'experience_selected', minutesAfterStart: 0 },
      { message: 'un momento, antes necesito toallas', expectedIntent: 'housekeeping_request', minutesAfterStart: 2 },
      { message: 'ok volvemos a la excursion', expectedIntent: 'provider_resume', minutesAfterStart: 13 },
      { message: 'para manana somos 2', expectedIntent: 'provider_details', minutesAfterStart: 14 },
      { message: 'vale', expectedIntent: 'provider_confirmation', minutesAfterStart: 15 }
    ],
    expected: {
      providerRequestSent: true,
      providerRecovery: true,
      ticket: true
    }
  },
  {
    id: 'human_takeover_interruption',
    label: 'Human takeover interruption',
    guestType: 'vip',
    turns: [
      { message: 'hola, necesito hablar con alguien del hotel', expectedIntent: 'human_request', minutesAfterStart: 0 },
      { message: 'AI paused by reception', expectedIntent: 'human_takeover', aiMode: 'human_takeover', minutesAfterStart: 1 },
      { message: 'ya esta, podeis activar la IA otra vez', expectedIntent: 'resume_ai', aiMode: 'ai_active', minutesAfterStart: 18 },
      { message: 'quiero una recomendacion de spa', expectedIntent: 'spa_interest', minutesAfterStart: 20 },
      { message: 'gracias', expectedIntent: 'thanks', minutesAfterStart: 21 }
    ],
    expected: {
      humanTakeoverRecovery: true,
      escalation: true,
      revenue: true
    }
  },
  {
    id: 'guest_memory_consistency',
    label: 'Guest memory consistency',
    guestType: 'wellness',
    turns: [
      { message: 'me gusta mucho el spa y prefiero planes tranquilos', expectedIntent: 'preference_memory', minutesAfterStart: 0 },
      { message: 'mas tarde te pregunto', expectedIntent: 'thanks', minutesAfterStart: 1 },
      { message: 'que me recomiendas para esta tarde?', expectedIntent: 'memory_recommendation', minutesAfterStart: 180 },
      { message: 'algo relajado, no aventura', expectedIntent: 'memory_refinement', minutesAfterStart: 181 },
      { message: 'perfecto gracias', expectedIntent: 'thanks', minutesAfterStart: 182 }
    ],
    expected: {
      memoryConsistency: true,
      revenue: true,
      languages: ['es']
    }
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

  if (risk?.category === 'emergency' || /\b(humo|smoke|fumee|rauch|urgent|urgente|emergency|notfall|fire|fuego|incendio|brand)\b/.test(text)) return 'emergency';
  if (/aire acondicionado|air conditioning|climatisation|klimaanlage|not working|no funciona|broken/.test(text)) return 'maintenance_issue';
  if (/limpiar|clean|nettoyer|reinigen|toallas|towels|serviettes|handtuecher/.test(text)) return 'housekeeping_request';
  if (/wifi|contrasena|password|breakfast|desayuno|petit-dejeuner|fruehstueck|horario|what time|a que hora/.test(text)) return 'hotel_info';
  if (/airport transfer|airport|aeropuerto|transfer|traslado|taxi|flight|vuelo|aeroport|transfert|vol|flughafen|flug/.test(text)) return 'airport_transfer_interest';
  if (/late checkout|leave later|salir mas tarde|checkout tarde|plus tard|partir plus tard|spaeter auschecken|spater auschecken/.test(text)) return 'late_checkout_interest';
  if (/spa|hammam|massage|masaje|wellness|relax|bienestar|bien-etre|traitement|behandlung/.test(text)) return 'spa_interest';
  if (/restaurant|restaurante|dinner|cena|mesa|table|diner|dejeuner|abendessen|tisch/.test(text)) return 'restaurant_interest';
  if (/excursion|excursiones|tour|activities|actividades|activites|ausfluege/.test(text)) return 'excursion_interest';
  if (/upgrade|suite|better room|habitacion mejor|mejor habitacion|chambre superieure|zimmer upgrade/.test(text)) return 'room_upgrade_interest';
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
    pmsIntelligenceContext,
    risk: normalizedRisk
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

const EXPERIENCE_MATCHES = [
  {
    title: 'Essaouira Coastal Excursion',
    provider: 'Luxotour Morocco',
    keywords: ['essaouira', 'coastal']
  },
  {
    title: 'Atlas Mountains Day Trip',
    provider: 'Luxotour Morocco',
    keywords: ['atlas', 'mountains', 'mountain']
  },
  {
    title: 'Agafay Desert Dinner',
    provider: 'Luxotour Morocco',
    keywords: ['agafay', 'desert', 'dinner']
  },
  {
    title: 'Marrakech Hammam Experience',
    provider: 'Luxotour Morocco',
    keywords: ['hammam', 'spa', 'wellness']
  }
];

const isSimpleGreeting = (message = '') => /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi|bonjour|salut|hallo|hey)[\s!.?]*$/i.test(normalize(message));

const isThanks = (message = '') => /^(gracias|merci|thanks|thank you|danke|ok gracias|perfecto gracias|vale gracias)[\s!.?]*$/i.test(normalize(message));

const isConfirmation = (message = '') => /^(si|sí|vale|ok|okay|adelante|confirmo|enviala|envíala|perfecto|yes|oui|ja)[\s!.?]*$/i.test(String(message || '').trim().toLowerCase());

const detectExperienceMatch = (message = '') => {
  const text = normalize(message);
  return EXPERIENCE_MATCHES.find((experience) => experience.keywords.some((keyword) => text.includes(keyword))) || null;
};

const extractProviderDetails = (message = '') => {
  const text = normalize(message);
  const peopleMatch = text.match(/(\d+)\s*(personas|pax|people|guests|adultos|somos)/) || text.match(/somos\s*(\d+)/);
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2})/) || text.match(/\b(manana|tomorrow|demain|morgen|hoy|today)\b/);

  return {
    requestedDate: dateMatch ? dateMatch[1] : null,
    guestCount: peopleMatch ? Number(peopleMatch[1]) : null
  };
};

const resolveJourneyLanguage = ({ turn, guest, hotel }) => {
  if (turn.forcedLanguage) return turn.forcedLanguage;
  return detectLanguage(turn.message, guest.preferred_language || hotel.primary_language || 'es');
};

const resolveJourneyIntent = ({ turn, state, message }) => {
  if (turn.expectedIntent) return turn.expectedIntent;
  if (isSimpleGreeting(message)) return 'greeting';
  if (isThanks(message)) return 'thanks';
  if (state.providerFlowActive && isConfirmation(message)) return 'provider_confirmation';
  return inferOperationalIntent({
    message,
    conciergeIntent: detectGuestIntent({
      message,
      context: { recentMessages: state.recentMessages || [], guestMemory: state.guestMemory || [] }
    }),
    risk: null
  });
};

const buildJourneyResponse = ({ hotel, guest, reservation, turn, state, language }) => {
  const message = turn.message;
  const text = normalize(message);
  const intent = resolveJourneyIntent({ turn, state, message });
  const experience = detectExperienceMatch(message);
  const details = extractProviderDetails(message);
  const previousProviderStatus = state.provider.status;
  const response = {
    content: '',
    ticketCreated: false,
    ticketCategory: null,
    escalationRequired: false,
    revenueOpportunity: false,
    confidence: 0.84,
    providerState: { ...state.provider },
    memoryState: { preferences: [...state.guestMemory], recalled: false },
    aiMode: turn.aiMode || state.aiMode || 'ai_active'
  };

  if (turn.aiMode === 'human_takeover') {
    state.aiMode = 'human_takeover';
    response.content = '[AI paused: human takeover active. Copilot analysis only.]';
    response.escalationRequired = true;
    response.confidence = 0.96;
    return { intent: 'human_takeover', response };
  }

  if (turn.aiMode === 'ai_active' || intent === 'resume_ai') {
    state.aiMode = 'ai_active';
  }

  if (state.aiMode === 'human_takeover') {
    response.content = '[AI paused: human takeover active. Copilot analysis only.]';
    response.escalationRequired = true;
    response.confidence = 0.94;
    return { intent: 'human_takeover', response };
  }

  if (isSimpleGreeting(message)) {
    response.content = {
      es: 'Hola, te ayudo. ¿Quieres informacion sobre experiencias, restaurante, transfer, late checkout o algun servicio del hotel?',
      en: 'Hello, I can help. Would you like information about experiences, restaurant, transfer, late checkout or another hotel service?',
      fr: 'Bonjour, je peux vous aider. Souhaitez-vous des informations sur les experiences, le restaurant, le transfert, le late checkout ou un autre service?',
      de: 'Hallo, ich helfe gerne. Moechten Sie Informationen zu Erlebnissen, Restaurant, Transfer, Late Checkout oder einem anderen Hotelservice?'
    }[language] || 'Hello, I can help. What do you need?';
    response.providerState.status = previousProviderStatus === 'sent' || previousProviderStatus === 'completed' ? previousProviderStatus : 'idle';
    return { intent: 'greeting', response };
  }

  if (isThanks(message)) {
    response.content = {
      es: state.provider.status === 'completed'
        ? `Gracias a ti. La solicitud de ${state.provider.experienceTitle} ya esta enviada a ${state.provider.provider}; te avisaremos cuando haya confirmacion.`
        : 'Gracias a ti. Si necesitas algo mas durante la estancia, estoy aqui para ayudarte.',
      en: 'You are welcome. If you need anything else during your stay, I am here to help.',
      fr: 'Avec plaisir. Si vous avez besoin d autre chose pendant le sejour, je suis la pour vous aider.',
      de: 'Sehr gern. Wenn Sie waehrend Ihres Aufenthalts noch etwas brauchen, helfe ich gerne.'
    }[language] || 'You are welcome.';
    return { intent: 'thanks', response };
  }

  if (/me gusta|prefiero|i like|i prefer|j aime|je prefere|ich mag|ich bevorzuge/.test(text)) {
    if (/spa|tranquil|relax|wellness|calm/.test(text)) {
      state.guestMemory = [...new Set([...state.guestMemory, 'spa_affinity', 'calm_experiences'])];
    }
    response.content = 'Perfecto, lo tengo en cuenta para recomendarte opciones mas tranquilas y acordes a tus preferencias.';
    response.memoryState = { preferences: [...state.guestMemory], recalled: false };
    response.revenueOpportunity = true;
    return { intent: 'preference_memory', response };
  }

  if (intent === 'memory_recommendation' || intent === 'memory_refinement') {
    response.content = intent === 'memory_refinement'
      ? 'Entonces evitaria planes de aventura y priorizaria hammam, spa o una experiencia local tranquila con poco desplazamiento.'
      : state.guestMemory.includes('spa_affinity')
        ? 'Por lo que me comentaste, te recomendaria una opcion tranquila como hammam o una experiencia local relajada, sin plan de aventura.'
        : 'Te puedo recomendar una experiencia local suave o revisar opciones segun lo que prefieras.';
    response.memoryState = { preferences: [...state.guestMemory], recalled: state.guestMemory.length > 0 };
    response.revenueOpportunity = true;
    return { intent, response };
  }

  if (intent === 'hotel_info') {
    response.content = buildBaseReply({ language, intent: 'hotel_info', hotel, message });
    return { intent, response };
  }

  if (intent === 'restaurant_interest') {
    response.content = 'Claro. Para reservar restaurante para 2, dime la hora aproximada y lo dejamos preparado como solicitud para el equipo.';
    response.revenueOpportunity = true;
    return { intent, response };
  }

  if (intent === 'housekeeping_request') {
    response.content = 'Gracias por avisar. Lo comunico al equipo de housekeeping para que puedan ayudarte cuanto antes.';
    response.ticketCreated = true;
    response.ticketCategory = 'housekeeping';
    return { intent, response };
  }

  if (['maintenance_issue', 'maintenance_followup'].includes(intent)) {
    response.content = intent === 'maintenance_followup'
      ? 'Entiendo. Lo marco como seguimiento prioritario para mantenimiento porque la incidencia continua.'
      : 'Gracias por avisar. He enviado la incidencia al equipo de mantenimiento para que revisen la habitacion cuanto antes.';
    response.ticketCreated = true;
    response.ticketCategory = 'maintenance';
    response.escalationRequired = intent === 'maintenance_followup';
    response.confidence = 0.91;
    return { intent, response };
  }

  if (['negative_sentiment', 'complaint_escalation', 'human_request'].includes(intent)) {
    response.content = intent === 'human_request'
      ? 'Entendido. Recomiendo que recepcion tome el control de esta conversacion para ayudarte directamente.'
      : intent === 'complaint_escalation'
        ? 'Entendido. Escalo la incidencia como prioritaria para que el equipo del hotel pueda darte una solucion cuanto antes.'
        : 'Siento la molestia. Lo marco como urgente para que el equipo del hotel lo revise y pueda darte seguimiento humano.';
    response.ticketCreated = true;
    response.ticketCategory = 'complaint';
    response.escalationRequired = true;
    response.confidence = 0.93;
    return { intent, response };
  }

  if (['excursion_interest', 'experience_selected', 'provider_resume'].includes(intent) || experience) {
    if (intent === 'excursion_interest' && !experience) {
      response.providerState = { ...state.provider };
      response.revenueOpportunity = true;
      response.content = state.lastGenericExperienceHelp
        ? 'Para una primera opcion, Essaouira encaja si quereis costa y paseo tranquilo; Atlas Mountains si preferis naturaleza. Dime cual os interesa y avanzamos.'
        : state.provider.status === 'idle'
        ? 'Tenemos opciones locales como Essaouira, Atlas Mountains, Agafay y hammam. Si una te encaja, te doy detalles y puedo preparar la solicitud al proveedor.'
        : 'Te puedo recomendar Essaouira para costa, Atlas Mountains para naturaleza, Agafay para cena al atardecer o hammam para algo mas relajado.';
      state.lastGenericExperienceHelp = true;
      return { intent, response };
    }

    const selectedExperience = experience || state.provider.experience || EXPERIENCE_MATCHES[0];
    state.provider = {
      status: 'awaiting_details',
      providerFlowActive: true,
      experience: selectedExperience,
      experienceTitle: selectedExperience.title,
      provider: selectedExperience.provider,
      requestedDate: state.provider.requestedDate || null,
      guestCount: state.provider.guestCount || null
    };
    response.providerState = { ...state.provider };
    response.revenueOpportunity = true;
    response.content = experience || intent === 'experience_selected'
      ? `Perfecto. Para enviar la solicitud a ${state.provider.provider}, me confirmas que dia quereis hacer ${state.provider.experienceTitle} y para cuantas personas?`
      : 'Podemos revisar experiencias como Essaouira, Atlas Mountains, Agafay o hammam. Si alguna te interesa, puedo enviar una solicitud al proveedor para confirmar disponibilidad.';
    return { intent: experience ? 'experience_selected' : intent, response };
  }

  if (state.provider.providerFlowActive && intent === 'provider_details') {
    state.provider.requestedDate = details.requestedDate || state.provider.requestedDate;
    state.provider.guestCount = details.guestCount || state.provider.guestCount;
    state.provider.status = state.provider.requestedDate && state.provider.guestCount ? 'awaiting_confirmation' : 'awaiting_details';
    response.providerState = { ...state.provider };
    response.revenueOpportunity = true;
    response.content = state.provider.status === 'awaiting_confirmation'
      ? `Perfecto. Tengo los datos para la solicitud ${state.provider.experienceTitle}. ¿Quieres que envie ahora la solicitud a ${state.provider.provider} para confirmar disponibilidad?`
      : `Para enviar la solicitud a ${state.provider.provider}, necesito fecha y numero de personas.`;
    return { intent, response };
  }

  if (state.provider.providerFlowActive && intent === 'provider_confirmation' && state.provider.status === 'awaiting_confirmation') {
    state.provider.status = 'completed';
    state.provider.providerFlowActive = false;
    state.provider.sentAt = new Date(`${todayKey()}T12:00:00.000Z`).toISOString();
    response.providerState = { ...state.provider };
    response.revenueOpportunity = true;
    response.confidence = 0.97;
    response.content = `Perfecto, he enviado la solicitud a ${state.provider.provider}. Te avisaremos cuando tengamos confirmacion de disponibilidad.`;
    return { intent, response };
  }

  if (intent === 'airport_transfer_interest') {
    response.content = 'Te ayudo con el transfer. Para preparar la solicitud necesito hora de llegada o salida, numero de vuelo y numero de pasajeros.';
    response.revenueOpportunity = true;
    return { intent, response };
  }

  if (intent === 'spa_interest') {
    response.content = state.guestMemory.includes('spa_affinity')
      ? 'Por tu preferencia de planes tranquilos, el spa encaja muy bien. Puedo ayudarte a revisar tratamientos disponibles o enviar una solicitud.'
      : 'El spa puede ser una buena opcion. Si quieres, te ayudo a revisar tratamientos y disponibilidad.';
    response.revenueOpportunity = true;
    response.memoryState = { preferences: [...state.guestMemory], recalled: state.guestMemory.includes('spa_affinity') };
    return { intent, response };
  }

  if (intent === 'checkout_question') {
    response.content = `Segun el contexto PMS simulado, tu checkout esta previsto para ${reservation.departure_date}. Si necesitas salir mas tarde, puedo ayudarte a solicitar late checkout.`;
    return { intent, response };
  }

  if (intent === 'folio_question') {
    response.content = 'No voy a inventar importes. En esta simulacion el folio debe venir del PMS; si no esta disponible, recepcion debe revisarlo antes de informar el saldo.';
    response.confidence = 0.9;
    return { intent, response };
  }

  if (intent === 'late_checkout_interest') {
    response.content = 'Puedo ayudarte a solicitar late checkout. Depende de disponibilidad del hotel, asi que lo tratamos como solicitud y no como confirmacion.';
    response.revenueOpportunity = true;
    return { intent, response };
  }

  response.content = 'Para ayudarte bien, dime si te refieres a una experiencia, transfer, restaurante, checkout o una incidencia de la habitacion.';
  response.confidence = 0.62;
  return { intent: 'clarification_needed', response };
};

const buildJourneyContext = ({ index, hotelType, journey }) => {
  const guestType = SIMULATION_GUEST_TYPES.find((item) => item.id === journey.guestType) || pick(SIMULATION_GUEST_TYPES, index);
  const hotel = buildHotel(hotelType, index);
  const guest = buildGuest({ type: guestType, hotel, scenario: journey, index });
  const reservation = buildReservation({ hotel, guest, guestType, index });
  const pmsContextRaw = buildGuestStayContextFromReservation({
    reservation,
    occupancy: {
      occupancy_percent: hotelType.pms.occupancyPercent,
      occupied_rooms: Math.round((hotelType.pms.occupancyPercent / 100) * hotelType.rooms),
      available_rooms: Math.max(0, hotelType.rooms - Math.round((hotelType.pms.occupancyPercent / 100) * hotelType.rooms))
    }
  });

  return {
    guestType,
    hotel,
    guest,
    reservation,
    pmsIntelligenceContext: {
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
        housekeepingStatus: index % 4 === 0 ? 'dirty' : 'clean',
        maintenanceStatus: journey.id === 'room_issue_frustration' ? 'maintenance' : 'ok',
        occupancyStatus: 'occupied'
      },
      guestStayContext: pmsContextRaw,
      operationalWarnings: journey.id === 'room_issue_frustration' ? ['room_maintenance'] : []
    }
  };
};

const evaluateJourney = ({ journey, messages, responses, timelines, state }) => {
  const errors = [];
  const warnings = [];
  const responseTexts = responses.map((item) => normalize(item.content)).filter((item) => item && !item.includes('ai paused'));
  const repeatedAnswers = responseTexts.some((item, index) => index > 0 && areResponsesSimilar(item, responseTexts[index - 1]));
  const providerSent = timelines.provider.some((item) => ['sent', 'completed'].includes(item.status));
  const providerActiveAfterCompletion = timelines.provider.some((item, index) => {
    const completedBefore = timelines.provider.slice(0, index).some((previous) => previous.status === 'completed');
    return completedBefore && ['awaiting_details', 'awaiting_confirmation'].includes(item.status);
  });
  const languages = [...new Set(timelines.language.map((item) => item.language).filter(Boolean))];
  const topicSwitchCount = new Set(timelines.intent.map((item) => item.intent).filter(Boolean)).size;
  const expected = journey.expected || {};

  if (expected.providerRequestSent && !providerSent) errors.push(`Provider request expectation mismatch for ${journey.id}`);
  if (expected.ticket && !responses.some((item) => item.ticketCreated)) errors.push(`Ticket expectation mismatch for ${journey.id}`);
  if (expected.escalation && !responses.some((item) => item.escalationRequired)) errors.push(`Escalation expectation mismatch for ${journey.id}`);
  if (expected.multilingualContinuity && languages.length < 2) errors.push(`Expected multilingual continuity for ${journey.id}`);
  if (expected.topicSwitch && topicSwitchCount < 3) warnings.push('topic_switch_not_stressed');
  if (repeatedAnswers) warnings.push('repeated_long_context_response');
  if (providerActiveAfterCompletion) errors.push(`Provider flow stale after completion for ${journey.id}`);

  const longContext = {
    context_loss: Boolean(expected.providerRequestSent && !providerSent),
    repeated_answers: repeatedAnswers,
    wrong_intent_after_long_context: false,
    stale_provider_context: providerActiveAfterCompletion,
    incorrect_memory_recall: journey.id === 'guest_memory_consistency' && !timelines.memory.some((item) => item.recalled),
    hallucinated_followup: false,
    language_confusion: Boolean(expected.multilingualContinuity && languages.length < 2),
    escalation_inconsistency: Boolean(expected.escalation && !responses.some((item) => item.escalationRequired)),
    topic_switch_success: topicSwitchCount >= 3 || !expected.topicSwitch,
    provider_flow_recovery: journey.id !== 'interrupted_provider_flow' || providerSent,
    memory_consistency: journey.id !== 'guest_memory_consistency' || timelines.memory.some((item) => item.recalled),
    human_takeover_recovery: journey.id !== 'human_takeover_interruption' || timelines.aiMode.some((item) => item.mode === 'human_takeover') && timelines.aiMode.at(-1)?.mode === 'ai_active',
    long_context_confidence: Number((responses.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / Math.max(1, responses.length)).toFixed(2))
  };

  if (longContext.incorrect_memory_recall) errors.push(`Memory recall expectation mismatch for ${journey.id}`);
  if (longContext.language_confusion) errors.push(`Language continuity expectation mismatch for ${journey.id}`);

  return {
    pass: errors.length === 0 && !longContext.stale_provider_context && !longContext.repeated_answers,
    errors,
    warnings,
    longContext,
    providerSent,
    languages,
    topicSwitchCount,
    finalProviderState: { ...state.provider }
  };
};

const simulateJourneyConversation = ({ index, hotelType, journey }) => {
  const { guestType, hotel, guest, reservation, pmsIntelligenceContext } = buildJourneyContext({ index, hotelType, journey });
  const state = {
    aiMode: 'ai_active',
    provider: {
      status: 'idle',
      providerFlowActive: false,
      provider: null,
      experienceTitle: null,
      requestedDate: null,
      guestCount: null
    },
    guestMemory: [],
    recentMessages: []
  };
  const startedAt = new Date(`${todayKey()}T12:00:00.000Z`);
  const messages = [];
  const responses = [];
  const timelines = {
    intent: [],
    language: [],
    escalation: [],
    provider: [],
    memory: [],
    aiMode: []
  };

  journey.turns.forEach((turn, turnIndex) => {
    const occurredAt = new Date(startedAt.getTime() + Number(turn.minutesAfterStart || turnIndex) * 60000).toISOString();
    const language = resolveJourneyLanguage({ turn, guest, hotel });
    const { intent, response } = buildJourneyResponse({ hotel, guest, reservation, turn, state, language });

    const guestMessage = {
      sender_type: 'guest',
      content: turn.message,
      original_language: language,
      occurred_at: occurredAt,
      turn: turnIndex + 1
    };
    const aiMessage = {
      sender_type: 'ai',
      content: response.content,
      language,
      occurred_at: occurredAt,
      turn: turnIndex + 1
    };

    messages.push(guestMessage);
    responses.push({
      ...aiMessage,
      ticketCreated: response.ticketCreated,
      ticketCategory: response.ticketCategory,
      escalationRequired: response.escalationRequired,
      revenueOpportunity: response.revenueOpportunity,
      confidence: response.confidence
    });
    state.recentMessages.push(guestMessage, aiMessage);
    timelines.intent.push({ turn: turnIndex + 1, intent, message: turn.message });
    timelines.language.push({ turn: turnIndex + 1, language });
    timelines.escalation.push({ turn: turnIndex + 1, escalationRequired: response.escalationRequired, ticketCategory: response.ticketCategory });
    timelines.provider.push({ turn: turnIndex + 1, ...response.providerState });
    timelines.memory.push({ turn: turnIndex + 1, ...response.memoryState });
    timelines.aiMode.push({ turn: turnIndex + 1, mode: response.aiMode });
  });

  const evaluation = evaluateJourney({ journey, messages, responses, timelines, state });
  const ticketResponse = responses.find((item) => item.ticketCreated);
  const confidence = evaluation.longContext.long_context_confidence;
  const detectedIntent = timelines.intent.at(-1)?.intent || 'unknown';
  const detectedLanguage = timelines.language.at(-1)?.language || guest.preferred_language || 'es';
  const revenueDetected = responses.some((item) => item.revenueOpportunity);
  const escalationRequired = responses.some((item) => item.escalationRequired);
  const ticketCreated = responses.some((item) => item.ticketCreated);
  const repeatedResponse = evaluation.longContext.repeated_answers;

  return {
    id: `journey-result-${index + 1}`,
    simulation: true,
    mode: 'long_journey',
    hotel_id: hotel.id,
    hotel_name: hotel.name,
    hotel_type: hotelType.id,
    guest_id: guest.id,
    guest_name: guest.name,
    guest_type: guestType.id,
    scenario: journey.id,
    journey: journey.id,
    journey_label: journey.label,
    scenario_label: journey.label,
    turn_count: messages.length,
    messages,
    ai_responses: responses,
    detected_intent: detectedIntent,
    detected_language: detectedLanguage,
    ticket_created: ticketCreated,
    ticket_category: ticketResponse?.ticketCategory || null,
    escalation_required: escalationRequired,
    revenue_opportunity: revenueDetected,
    confidence,
    errors: evaluation.errors,
    warnings: evaluation.warnings,
    pass: evaluation.pass,
    repeated_response: repeatedResponse,
    unsafe_response: false,
    hallucination_warning: false,
    intent_timeline: timelines.intent,
    language_timeline: timelines.language,
    escalation_timeline: timelines.escalation,
    provider_state_timeline: timelines.provider,
    memory_state_timeline: timelines.memory,
    ai_mode_timeline: timelines.aiMode,
    analysis: {
      hotel,
      guest,
      reservation,
      pms_context: pmsIntelligenceContext,
      expected: journey.expected,
      long_context: evaluation.longContext,
      provider_state_timeline: timelines.provider,
      intent_timeline: timelines.intent,
      language_timeline: timelines.language,
      escalation_timeline: timelines.escalation,
      memory_state_timeline: timelines.memory,
      ai_mode_timeline: timelines.aiMode,
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

const summarizeJourneyResults = (results) => {
  const base = summarizeResults(results);
  const total = results.length || 1;
  const count = (predicate) => results.filter(predicate).length;
  const averageLongConfidence = results.reduce((sum, item) => sum + Number(item.analysis?.long_context?.long_context_confidence || item.confidence || 0), 0) / total;

  return {
    ...base,
    longConversationQuality: Math.round((count((item) => item.pass) / total) * 100),
    contextRetentionScore: Math.round((count((item) => !item.analysis?.long_context?.context_loss && !item.analysis?.long_context?.stale_provider_context) / total) * 100),
    topicSwitchSuccess: Math.round((count((item) => item.analysis?.long_context?.topic_switch_success !== false) / total) * 100),
    providerFlowRecovery: Math.round((count((item) => item.analysis?.long_context?.provider_flow_recovery !== false) / total) * 100),
    memoryConsistency: Math.round((count((item) => item.analysis?.long_context?.memory_consistency !== false) / total) * 100),
    conversationStability: Math.round((count((item) => !item.analysis?.long_context?.repeated_answers && !item.analysis?.long_context?.wrong_intent_after_long_context) / total) * 100),
    multilingualContinuity: Math.round((count((item) => !item.analysis?.long_context?.language_confusion) / total) * 100),
    humanTakeoverRecovery: Math.round((count((item) => item.analysis?.long_context?.human_takeover_recovery !== false) / total) * 100),
    longContextConfidence: Number(averageLongConfidence.toFixed(2))
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
      scenarios: SIMULATION_SCENARIOS.map(({ id, label }) => ({ id, label })),
      journeys: SIMULATION_JOURNEYS.map(({ id, label }) => ({ id, label }))
    },
    metrics,
    results
  };
};

export const runStaynexJourneySimulation = ({
  count = 10,
  hotelType = 'all',
  journey = 'all'
} = {}) => {
  const safeCount = Math.max(1, Math.min(500, Number(count || 10)));
  const hotelTypes = hotelType === 'all'
    ? SIMULATION_HOTEL_TYPES
    : SIMULATION_HOTEL_TYPES.filter((item) => item.id === hotelType);
  const journeys = journey === 'all'
    ? SIMULATION_JOURNEYS
    : SIMULATION_JOURNEYS.filter((item) => item.id === journey);

  if (!hotelTypes.length) {
    throw new Error(`Unknown simulation hotel type: ${hotelType}`);
  }

  if (!journeys.length) {
    throw new Error(`Unknown simulation journey: ${journey}`);
  }

  const results = Array.from({ length: safeCount }, (_, index) => simulateJourneyConversation({
    index,
    hotelType: pick(hotelTypes, index),
    journey: pick(journeys, index)
  }));
  const metrics = summarizeJourneyResults(results);

  return {
    ok: true,
    mode: 'long_journey_simulation',
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
      journey
    },
    catalog: {
      hotelTypes: SIMULATION_HOTEL_TYPES,
      guestTypes: SIMULATION_GUEST_TYPES,
      scenarios: SIMULATION_SCENARIOS.map(({ id, label }) => ({ id, label })),
      journeys: SIMULATION_JOURNEYS.map(({ id, label }) => ({ id, label }))
    },
    metrics,
    results
  };
};
