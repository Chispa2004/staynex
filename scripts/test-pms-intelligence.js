import {
  detectCheckoutTomorrow,
  determineStayPhase
} from '../src/services/pms-checkin.service.js';
import {
  inferRoomStatusFromReservation,
  normalizeRoomStatus
} from '../src/services/pms-room-status.service.js';
import {
  detectLowOccupancy,
  syncOccupancySnapshot
} from '../src/services/pms-occupancy.service.js';
import {
  detectRevenueSignals,
  detectUpgradeOpportunity,
  detectVipGuest
} from '../src/services/pms-revenue-context.service.js';
import {
  buildGuestStayContextFromReservation,
  buildPmsIntelligenceContext
} from '../src/services/pms-intelligence.service.js';
import { evaluateAutomationOpportunity, INTELLIGENT_AUTOMATION_TYPES } from '../src/services/automation-intelligence.service.js';
import { enhanceConciergeIntelligence } from '../src/services/openai-concierge.service.js';
import {
  getGuestFolioSummary,
  normalizeFolioSummary
} from '../src/services/pms-folio.service.js';
import {
  buildReceptionReservation,
  calculateCheckinReadiness,
  filterReceptionReservations,
  maskDocumentNumber
} from '../dashboard/lib/reception.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const now = new Date('2026-05-19T10:00:00.000Z');
const baseReservation = {
  id: 'reservation-1',
  hotel_id: 'hotel-1',
  guest_id: 'guest-1',
  guest_name: 'Maria VIP',
  arrival_date: '2026-05-18',
  departure_date: '2026-05-20',
  room_number: '208',
  room_type: 'Standard',
  rate_plan: 'Flexible',
  status: 'in_house',
  adults: 2,
  children: 0,
  pms_provider: 'apaleo',
  pms_reservation_id: 'APA-1'
};

assert(
  determineStayPhase({ ...baseReservation, departure_date: '2026-05-22' }, now) === 'in_house',
  'Checked-in guest should be in_house when departure is not tomorrow'
);

assert(
  determineStayPhase(baseReservation, now) === 'pre_checkout',
  'Guest departing tomorrow should be pre_checkout'
);

const checkoutTomorrow = detectCheckoutTomorrow(baseReservation, now);
assert(checkoutTomorrow.matches, 'Checkout tomorrow should be detected');

const roomStatus = normalizeRoomStatus({
  room_number: '208',
  housekeeping_status: 'dirty',
  maintenance_status: 'ok',
  occupancy_status: 'occupied'
});

assert(
  roomStatus.housekeeping_status === 'dirty'
  && roomStatus.occupancy_status === 'occupied',
  'Room dirty/occupied status should normalize'
);

const inferredRoom = inferRoomStatusFromReservation(baseReservation, now);
assert(
  inferredRoom.room_number === '208'
  && inferredRoom.occupancy_status === 'occupied',
  'Reservation fallback should infer occupied room context before departure day'
);

const occupancy = syncOccupancySnapshot({
  hotelId: 'hotel-1',
  reservations: [baseReservation],
  rooms: [{ room_number: '101' }, { room_number: '208' }, { room_number: '309' }, { room_number: '410' }],
  date: now
});

assert(
  detectLowOccupancy(occupancy, 50)
  && occupancy.occupied_rooms === 1,
  'Low occupancy should be detected from reservation fallback'
);

assert(
  detectVipGuest({
    reservation: { ...baseReservation, room_type: 'Suite Premium' },
    guestMemory: [{ memory_key: 'high_spender', memory_value: 'true' }]
  }) >= 70,
  'VIP guest should cross threshold'
);

assert(
  detectUpgradeOpportunity({ reservation: baseReservation, occupancy }),
  'Standard room should be upgrade eligible when occupancy is low'
);

const revenueSignals = detectRevenueSignals({
  reservation: baseReservation,
  occupancy,
  guestMemory: [{ memory_key: 'airport_transfer_interest', memory_value: 'true' }],
  now
});

assert(
  revenueSignals.lateCheckoutEligible
  && revenueSignals.upgradeEligible
  && revenueSignals.revenuePotential > 0,
  'Revenue signals should include late checkout, upgrade and revenue potential'
);

const stayContext = buildGuestStayContextFromReservation({
  reservation: baseReservation,
  occupancy,
  now
});

assert(
  stayContext.stay_phase === 'pre_checkout'
  && stayContext.late_checkout_eligible,
  'Guest stay context should preserve PMS-derived stay phase and eligibility'
);

const missingSchemaQuery = () => {
  const chain = {};
  const terminal = async () => ({ data: null, error: { message: 'guest_stay_context missing' } });
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = terminal;
  chain.then = (resolve, reject) => terminal().then(resolve, reject);
  return chain;
};

const fallbackPmsContext = await buildPmsIntelligenceContext({
  hotelId: 'hotel-1',
  guestId: 'guest-1',
  reservationId: 'reservation-1',
  roomNumber: '208',
  reservation: baseReservation,
  supabase: {
    from: missingSchemaQuery
  }
});

assert(
  fallbackPmsContext.stayPhase === 'pre_checkout'
  && fallbackPmsContext.operationalWarnings.includes('guest_stay_context_fallback_from_reservation'),
  'Missing PMS Intelligence tables should fall back to reservation context without breaking'
);

const automationDecision = evaluateAutomationOpportunity({
  automation: {
    type: INTELLIGENT_AUTOMATION_TYPES.LATE_CHECKOUT_OFFER,
    cooldownMinutes: 0,
    maxPerGuest: 2
  },
  reservation: baseReservation,
  now,
  pmsIntelligenceContext: {
    stayPhase: 'pre_checkout',
    lateCheckoutEligible: true
  }
});

assert(
  automationDecision.shouldRun,
  'Automation engine should accept PMS-powered checkout tomorrow trigger in preview mode'
);

const normalizedFolio = normalizeFolioSummary({
  currency: 'EUR',
  lineItems: [
    { description: 'Minibar', amount: 18 },
    { description: 'Hamacas', amount: 24 }
  ],
  totalCharges: 42,
  totalPaid: 0
});

assert(
  normalizedFolio.available
  && normalizedFolio.outstandingBalance === 42
  && normalizedFolio.dataQuality === 'high',
  'PMS folio summary should normalize only real PMS line items'
);

const metadataFolio = await getGuestFolioSummary({
  hotelId: 'hotel-1',
  reservationId: 'reservation-1',
  roomNumber: '208',
  connection: {
    provider: 'apaleo',
    enabled: true,
    metadata: {
      reservation_folios: {
        'reservation-1': {
          currency: 'EUR',
          charges: [{ description: 'Spa', category: 'spa', amount: 60 }],
          totalCharges: 60,
          outstandingBalance: 60
        }
      }
    }
  }
});

assert(
  metadataFolio.provider === 'apaleo'
  && metadataFolio.lineItems[0].description === 'Spa'
  && metadataFolio.outstandingBalance === 60,
  'PMS folio abstraction should read sandbox folios from PMS connection metadata'
);

const receptionReservation = buildReceptionReservation({
  reservation: {
    ...baseReservation,
    guest_email: 'maria@example.com',
    guest_phone: '+34600111222',
    metadata: { document_number: 'AA1234567' }
  },
  guest: { id: 'guest-1', preferred_language: 'es', country: 'ES' },
  stayContext,
  roomStatus: {
    room_number: '208',
    housekeeping_status: 'clean',
    maintenance_status: 'ok',
    occupancy_status: 'occupied'
  },
  tickets: [],
  folioMessage: null,
  nowKey: '2026-05-19'
});

assert(
  receptionReservation.readiness.score >= 80
  && receptionReservation.document.masked === maskDocumentNumber('AA1234567'),
  'Reception Pre Check-in should calculate readiness and mask sensitive documents'
);

assert(
  receptionReservation.checkout.folioAvailable === false
  && receptionReservation.checkout.folioWarnings.includes('folio_not_available_from_pms'),
  'Reception Pre Check-in should fail closed when folio is unavailable'
);

const missingDataReadiness = calculateCheckinReadiness({
  reservation: { status: 'confirmed' },
  guest: {},
  stayContext: {},
  roomStatus: null,
  openTickets: [],
  folio: null
});

assert(
  missingDataReadiness.status === 'missing_data',
  'Reception readiness should mark incomplete PMS data as missing data'
);

assert(
  filterReceptionReservations([receptionReservation], { query: 'AA1234567', filter: 'all' }).length === 1,
  'Reception search should include document/passport values without exposing them unmasked'
);

const missingFolio = await getGuestFolioSummary({
  hotelId: 'hotel-1',
  reservationId: 'missing-reservation',
  roomNumber: '999',
  connection: {
    provider: 'apaleo',
    enabled: true,
    metadata: {}
  }
});

assert(
  !missingFolio.available
  && missingFolio.warnings.includes('folio_not_supported'),
  'PMS folio abstraction should fail closed when the connector has no folio support'
);

const openAiFallback = await enhanceConciergeIntelligence({
  hotel: { id: 'hotel-1', name: 'Staynex Hotel' },
  guest: { id: 'guest-1' },
  message: 'Can we leave late tomorrow?',
  hotelKnowledge: [],
  conversationContext: {
    language: 'en',
    pmsIntelligenceContext: {
      stayPhase: 'pre_checkout',
      lateCheckoutEligible: true,
      roomStatus: null
    }
  },
  conversationState: {},
  heuristic: {}
});

assert(
  openAiFallback.fallback
  && openAiFallback.reason,
  'AI context path should accept pmsIntelligenceContext without requiring OpenAI'
);

console.log(JSON.stringify({
  ok: true,
  cases: [
    'guest checked in -> in_house',
    'checkout tomorrow -> pre_checkout',
    'room dirty context normalizes',
    'low occupancy creates revenue recommendation context',
    'VIP guest crosses threshold',
    'upgrade eligible when occupancy allows',
    'fallback PMS missing data does not break',
    'PMS folio summary normalizes real line items',
    'PMS folio missing data fails closed',
    'Reception Pre Check-in readiness calculates safely',
    'Reception Pre Check-in masks DNI/passport values',
    'Reception Pre Check-in folio unavailable fallback does not break',
    'AI context accepts pmsIntelligenceContext',
    'automation trigger checkout_tomorrow works in preview mode'
  ]
}, null, 2));
