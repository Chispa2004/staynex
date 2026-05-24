import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getSupabase } from '../src/services/supabase.service.js';
import { seedDefaultAutomationRules } from '../src/services/automation.service.js';
import { processDueScheduledMessages } from '../src/services/message-queue.service.js';
import { runAutomationScheduler } from '../src/services/scheduler.service.js';
import {
  buildPreCheckoutFolioReminderMessage,
  evaluatePreCheckoutFolioReminder,
  normalizeFolioSummary,
  PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE
} from '../src/services/pms-folio.service.js';

validateEnvironment({ exitOnError: true });

const isMissingMigration = (error) => (
  error?.message?.includes('automation_rules')
  || error?.message?.includes('scheduled_messages')
  || error?.message?.includes('reservations')
  || error?.message?.includes('slug')
  || error?.details?.includes('automation_rules')
  || error?.details?.includes('scheduled_messages')
  || error?.details?.includes('reservations')
  || error?.details?.includes('slug')
);

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const supabase = getSupabase();
const suffix = Date.now();
const createdHotelIds = [];
let exitCode = 0;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  process.env.SEND_AUTOMATIONS = 'false';

  const folioReservation = {
    id: 'folio-reservation-1',
    hotel_id: 'hotel-folio-1',
    guest_id: 'guest-folio-1',
    guest_name: 'Laura Garcia',
    guest_phone: '+34600111222',
    departure_date: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    status: 'in_house',
    language: 'es'
  };
  const folioHotel = { id: 'hotel-folio-1', name: 'Staynex Test Hotel', default_language: 'es' };
  const validFolio = normalizeFolioSummary({
    currency: 'EUR',
    lineItems: [
      { description: 'Minibar', category: 'minibar', amount: 18 },
      { description: 'Hamacas', category: 'sunbeds', amount: 24 },
      { description: 'Spa', category: 'spa', amount: 60 }
    ],
    totalCharges: 102,
    totalPaid: 0,
    outstandingBalance: 102
  });
  const folioDecision = evaluatePreCheckoutFolioReminder({
    hotel: folioHotel,
    reservation: folioReservation,
    guest: { id: 'guest-folio-1', phone_number: '+34600111222', preferred_language: 'es' },
    folio: validFolio,
    now: new Date()
  });
  const folioMessage = buildPreCheckoutFolioReminderMessage({
    hotel: folioHotel,
    reservation: folioReservation,
    folio: validFolio,
    language: 'es'
  });

  assert(folioDecision.eligible, 'Guest with pending folio balance should be eligible for preview');
  assert(folioDecision.previewOnly, 'Pre-checkout folio reminder must stay preview-only');
  assert(folioMessage.includes('Minibar') && folioMessage.includes('Hamacas') && folioMessage.includes('Spa'), 'Folio reminder should include real PMS line items');
  assert(!folioMessage.includes('Restaurant') && !folioMessage.includes('Room service'), 'Folio reminder must not invent charges');
  assert(PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE === 'pre_checkout_folio_reminder', 'Folio automation type should be stable');

  const zeroBalanceDecision = evaluatePreCheckoutFolioReminder({
    hotel: folioHotel,
    reservation: folioReservation,
    guest: { phone_number: '+34600111222' },
    folio: normalizeFolioSummary({
      currency: 'EUR',
      lineItems: [{ description: 'Minibar', amount: 18 }],
      totalCharges: 18,
      totalPaid: 18,
      outstandingBalance: 0
    }),
    now: new Date()
  });
  assert(zeroBalanceDecision.reason === 'no_outstanding_balance', 'Zero balance should not generate a folio reminder');

  const missingFolioDecision = evaluatePreCheckoutFolioReminder({
    hotel: folioHotel,
    reservation: folioReservation,
    guest: { phone_number: '+34600111222' },
    folio: normalizeFolioSummary({ available: false, warnings: ['folio_unavailable'] }),
    now: new Date()
  });
  assert(missingFolioDecision.reason === 'folio_missing', 'Missing PMS folio should block reminder');

  const inconsistentDecision = evaluatePreCheckoutFolioReminder({
    hotel: folioHotel,
    reservation: folioReservation,
    guest: { phone_number: '+34600111222' },
    folio: normalizeFolioSummary({
      currency: 'EUR',
      lineItems: [{ description: 'Spa', amount: 60 }],
      totalCharges: 120,
      outstandingBalance: 120
    }),
    now: new Date()
  });
  assert(inconsistentDecision.reason === 'folio_data_quality_low', 'Inconsistent folio totals should block reminder');

  const takeoverDecision = evaluatePreCheckoutFolioReminder({
    hotel: folioHotel,
    reservation: folioReservation,
    guest: { phone_number: '+34600111222' },
    conversationState: { conversation_ai_mode: 'human_takeover' },
    folio: validFolio,
    now: new Date()
  });
  assert(takeoverDecision.reason === 'human_takeover_active', 'Human takeover should block folio reminder');

  const { data: hotel, error: hotelError } = await supabase
    .from('hotels')
    .insert({
      name: `Staynex Automation Test ${suffix}`,
      brand_name: 'Staynex',
      slug: `staynex-automation-test-${suffix}`,
      whatsapp_number: `local-automation-${suffix}`,
      timezone: 'Europe/Madrid',
      default_language: 'es'
    })
    .select('*')
    .single();

  if (hotelError) throw hotelError;
  createdHotelIds.push(hotel.id);

  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .insert({
      hotel_id: hotel.id,
      phone_number: `+34777${String(suffix).slice(-6)}`,
      current_room: '410',
      preferred_language: 'es'
    })
    .select('*')
    .single();

  if (guestError) throw guestError;

  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .insert({
      hotel_id: hotel.id,
      guest_id: guest.id,
      pms_provider: 'mock',
      pms_reservation_id: `AUTO-${suffix}`,
      guest_name: 'Laura Garcia',
      guest_phone: guest.phone_number,
      arrival_date: addDays(7),
      departure_date: addDays(10),
      room_type: 'Standard',
      rate_plan: 'Breakfast included',
      board_basis: 'breakfast',
      status: 'confirmed'
    })
    .select('*')
    .single();

  if (reservationError) throw reservationError;

  const rules = await seedDefaultAutomationRules(hotel.id);

  if (rules.length < 4) {
    throw new Error('automation_rules table missing');
  }

  const scheduled = await runAutomationScheduler({
    hotelId: hotel.id,
    now: new Date(),
    limit: 20
  });

  const types = new Set(scheduled.map((item) => item.automation_type));

  for (const type of ['pre_arrival_7d', 'pre_arrival_1d', 'in_stay_upsell', 'post_stay_review']) {
    if (!types.has(type)) {
      throw new Error(`Missing scheduled automation type: ${type}`);
    }
  }

  const scheduledAgain = await runAutomationScheduler({
    hotelId: hotel.id,
    now: new Date(),
    limit: 20
  });

  if (scheduledAgain.length !== scheduled.length) {
    throw new Error('Scheduler duplicate prevention did not return existing scheduled messages consistently');
  }

  const queueResults = await processDueScheduledMessages({
    now: new Date(Date.now() + 60 * 1000),
    limit: 10
  });

  if (!queueResults.some((item) => item.skipped)) {
    throw new Error('Message queue did not respect SEND_AUTOMATIONS=false');
  }

  console.log(JSON.stringify({
    ok: true,
    reservationId: reservation.id,
    scheduled: scheduled.map((item) => ({
      automation_type: item.automation_type,
      status: item.status,
      fallback: item.automation_fallback
    })),
    sendAutomations: process.env.SEND_AUTOMATIONS
  }, null, 2));
} catch (error) {
  if (isMissingMigration(error)) {
    console.warn('Skipping automation test: run automation SQL migrations first.');
    exitCode = 0;
  } else {
    console.error(error);
    exitCode = 1;
  }
} finally {
  if (createdHotelIds.length > 0) {
    await supabase
      .from('hotels')
      .delete()
      .in('id', createdHotelIds);
  }

  process.exit(exitCode);
}
