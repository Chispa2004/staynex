import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getSupabase } from '../src/services/supabase.service.js';
import { buildConversationContext } from '../src/services/conversation-context.service.js';
import {
  detectGuestMemoryFromMessage,
  getGuestMemory,
  upsertDetectedGuestMemories,
  upsertGuestMemory
} from '../src/services/guest-memory.service.js';
import { detectUpsellOpportunities, UPSELL_TYPES } from '../src/services/upsell.service.js';

validateEnvironment({ exitOnError: true });

const isMissingMigration = (error) => (
  error?.message?.includes('guest_memory')
  || error?.message?.includes('slug')
  || error?.details?.includes('guest_memory')
  || error?.details?.includes('slug')
);

const supabase = getSupabase();
const suffix = Date.now();
const createdHotelIds = [];
let exitCode = 0;

try {
  const { data: hotel, error: hotelError } = await supabase
    .from('hotels')
    .insert({
      name: `Staynex Memory Test ${suffix}`,
      brand_name: 'Staynex',
      slug: `staynex-memory-test-${suffix}`,
      whatsapp_number: `local-memory-${suffix}`,
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
      phone_number: `+34888${String(suffix).slice(-6)}`,
      current_room: '208',
      preferred_language: 'es'
    })
    .select('*')
    .single();

  if (guestError) throw guestError;

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

  const message = 'Viajo con mi pareja, es nuestro aniversario y soy alergico al gluten. Me interesa late checkout.';
  const detected = detectGuestMemoryFromMessage({
    message,
    context: { language: 'es' },
    aiResult: { upsell_opportunity: true, intent: 'hotel_info' }
  });

  const requiredKeys = ['traveling_with_partner', 'anniversary_trip', 'dietary_gluten_allergy', 'interested_late_checkout'];
  const detectedKeys = detected.map((item) => item.memoryKey);

  for (const key of requiredKeys) {
    if (!detectedKeys.includes(key)) {
      throw new Error(`Missing detected memory key: ${key}`);
    }
  }

  await upsertDetectedGuestMemories({
    hotelId: hotel.id,
    guestId: guest.id,
    sourceMessageId: null,
    memories: detected
  });
  await upsertGuestMemory({
    hotelId: hotel.id,
    guestId: guest.id,
    memoryType: 'personal_context',
    memoryKey: 'traveling_with_partner',
    memoryValue: 'true',
    confidence: 0.9
  });

  const memories = await getGuestMemory(hotel.id, guest.id);

  if (memories.length === 0) {
    throw new Error('guest_memory table missing');
  }

  const duplicateCount = memories.filter((item) => item.memory_key === 'traveling_with_partner').length;

  if (duplicateCount !== 1) {
    throw new Error('Guest memory upsert duplicated traveling_with_partner');
  }

  const context = await buildConversationContext({
    hotel,
    guest,
    conversation,
    message: 'Quiero cenar algo especial'
  });

  if (!context.guestMemory.some((item) => item.memory_key === 'anniversary_trip')) {
    throw new Error('Guest memory was not loaded into conversation context');
  }

  const upsells = detectUpsellOpportunities({
    reservation: {
      arrival_date: '2026-07-15',
      departure_date: '2026-07-18',
      room_type: 'Standard',
      board_basis: 'breakfast'
    },
    language: 'es',
    message: 'Hola',
    recentMessages: [],
    hotelKnowledge: [],
    guestMemory: context.guestMemory
  });

  if (!upsells.some((item) => item.upsell_type === UPSELL_TYPES.ROMANTIC_PACKAGE)) {
    throw new Error('Upsell engine did not use guest memory for romantic_package');
  }

  console.log(JSON.stringify({
    ok: true,
    detectedKeys,
    memoryCount: memories.length,
    upsells: upsells.map((item) => item.upsell_type)
  }, null, 2));
} catch (error) {
  if (isMissingMigration(error)) {
    console.warn('Skipping guest memory test: run supabase/sql/create_guest_memory.sql first.');
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
