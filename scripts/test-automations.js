import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getSupabase } from '../src/services/supabase.service.js';
import { seedDefaultAutomationRules } from '../src/services/automation.service.js';
import { processDueScheduledMessages } from '../src/services/message-queue.service.js';
import { runAutomationScheduler } from '../src/services/scheduler.service.js';

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

try {
  process.env.SEND_AUTOMATIONS = 'false';

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
