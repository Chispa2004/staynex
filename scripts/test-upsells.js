import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getSupabase } from '../src/services/supabase.service.js';
import {
  detectUpsellOpportunities,
  storeUpsellOpportunities,
  UPSELL_TYPES
} from '../src/services/upsell.service.js';

validateEnvironment({ exitOnError: true });

const isMissingMigration = (error) => (
  error?.message?.includes('ai_upsells')
  || error?.message?.includes('slug')
  || error?.message?.includes('reservations')
  || error?.details?.includes('ai_upsells')
  || error?.details?.includes('slug')
  || error?.details?.includes('reservations')
);

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const supabase = getSupabase();
const suffix = Date.now();
const created = {
  hotelIds: [],
  guestIds: [],
  conversationIds: [],
  reservationIds: []
};
let exitCode = 0;

try {
  const { data: hotel, error: hotelError } = await supabase
    .from('hotels')
    .insert({
      name: `Staynex Upsell Test ${suffix}`,
      brand_name: 'Staynex',
      slug: `staynex-upsell-test-${suffix}`,
      whatsapp_number: `local-upsell-${suffix}`,
      timezone: 'Europe/Madrid',
      default_language: 'es'
    })
    .select('*')
    .single();

  if (hotelError) throw hotelError;
  created.hotelIds.push(hotel.id);

  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .insert({
      hotel_id: hotel.id,
      phone_number: `+34999${String(suffix).slice(-6)}`,
      current_room: '305',
      preferred_language: 'es'
    })
    .select('*')
    .single();

  if (guestError) throw guestError;
  created.guestIds.push(guest.id);

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .insert({
      hotel_id: hotel.id,
      guest_id: guest.id,
      status: 'active',
      last_message_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (conversationError) throw conversationError;
  created.conversationIds.push(conversation.id);

  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .insert({
      hotel_id: hotel.id,
      guest_id: guest.id,
      pms_provider: 'mock',
      pms_reservation_id: `UPSELL-${suffix}`,
      guest_name: 'Laura Garcia',
      guest_phone: guest.phone_number,
      arrival_date: addDays(3),
      departure_date: addDays(7),
      room_type: 'Standard',
      rate_plan: 'Breakfast included',
      board_basis: 'breakfast',
      status: 'confirmed'
    })
    .select('*')
    .single();

  if (reservationError) throw reservationError;
  created.reservationIds.push(reservation.id);

  const romantic = detectUpsellOpportunities({
    reservation,
    language: 'es',
    message: 'Viajo con mi pareja para nuestro aniversario',
    recentMessages: [],
    hotelKnowledge: []
  });
  const lateCheckout = detectUpsellOpportunities({
    reservation: {
      ...reservation,
      departure_date: addDays(1)
    },
    language: 'es',
    message: 'Gracias por la informacion',
    recentMessages: [],
    hotelKnowledge: []
  });
  const transfer = detectUpsellOpportunities({
    reservation,
    language: 'es',
    message: 'Llegamos al aeropuerto por la tarde',
    recentMessages: [],
    hotelKnowledge: []
  });

  if (!romantic.some((item) => item.upsell_type === UPSELL_TYPES.ROMANTIC_PACKAGE)) {
    throw new Error('Romantic upsell was not detected');
  }

  if (!lateCheckout.some((item) => item.upsell_type === UPSELL_TYPES.LATE_CHECKOUT)) {
    throw new Error('Late checkout upsell was not detected');
  }

  if (!transfer.some((item) => item.upsell_type === UPSELL_TYPES.AIRPORT_TRANSFER)) {
    throw new Error('Airport transfer upsell was not detected');
  }

  const storedUpsells = await storeUpsellOpportunities({
    hotel,
    guest,
    conversation,
    reservation,
    opportunities: romantic
  });

  if (!storedUpsells.length) {
    throw new Error('No ai_upsells record was created');
  }

  console.log(JSON.stringify({
    ok: true,
    detected: {
      romantic: romantic.map((item) => item.upsell_type),
      lateCheckout: lateCheckout.map((item) => item.upsell_type),
      transfer: transfer.map((item) => item.upsell_type)
    },
    storedUpsellId: storedUpsells[0].id
  }, null, 2));
} catch (error) {
  if (isMissingMigration(error)) {
    console.warn('Skipping upsell test: run supabase/sql/create_ai_upsells.sql and reservation migrations first.');
    exitCode = 0;
  } else {
    console.error(error);
    exitCode = 1;
  }
} finally {
  if (created.hotelIds.length > 0) {
    await supabase.from('hotels').delete().in('id', created.hotelIds);
  }
  process.exit(exitCode);
}
