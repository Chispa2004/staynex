import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getSupabase } from '../src/services/supabase.service.js';
import {
  createKnowledgeEntry,
  findKnowledgeAnswer,
  getKnowledgeForHotel,
  searchKnowledge,
  seedDemoKnowledge
} from '../src/services/knowledge.service.js';
import { getDefaultHotel } from '../src/services/hotel.service.js';

validateEnvironment({ exitOnError: true });

const isMissingMigration = (error) => (
  error?.message?.includes('slug')
  || error?.message?.includes('title')
  || error?.message?.includes('category')
  || error?.message?.includes('is_active')
  || error?.message?.includes('updated_at')
  || error?.details?.includes('slug')
  || error?.details?.includes('title')
  || error?.details?.includes('category')
  || error?.details?.includes('is_active')
  || error?.details?.includes('updated_at')
);

const supabase = getSupabase();
const suffix = Date.now();
const createdHotelIds = [];
let exitCode = 0;

const createHotel = async (label) => {
  const { data, error } = await supabase
    .from('hotels')
    .insert({
      name: `Staynex Test Hotel ${label} ${suffix}`,
      brand_name: `Test ${label}`,
      slug: `staynex-test-${label.toLowerCase()}-${suffix}`,
      whatsapp_number: `local-test-${label.toLowerCase()}-${suffix}`,
      timezone: 'Europe/Madrid',
      default_language: 'es'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  createdHotelIds.push(data.id);
  return data;
};

try {
  const demoHotel = await getDefaultHotel();
  await seedDemoKnowledge(demoHotel);

  const hotelA = await createHotel('A');
  const hotelB = await createHotel('B');
  const hotelC = await createHotel('C');

  await createKnowledgeEntry({
    hotelId: hotelA.id,
    title: 'WiFi Hotel A',
    key: 'wifi',
    category: 'wifi',
    value: 'La red WiFi del Hotel A es HotelA y la contrasena es alpha2026.'
  });

  await createKnowledgeEntry({
    hotelId: hotelB.id,
    title: 'WiFi Hotel B',
    key: 'wifi',
    category: 'wifi',
    value: 'La red WiFi del Hotel B es HotelB y la contrasena es beta2026.'
  });

  const answerA = await findKnowledgeAnswer(hotelA.id, 'Cual es la contrasena del wifi?');
  const answerB = await findKnowledgeAnswer(hotelB.id, 'Cual es la contrasena del wifi?');
  const knowledgeA = await getKnowledgeForHotel(hotelA.id);
  const fallbackResult = await searchKnowledge('Cual es la contrasena del wifi?', hotelC.id);

  if (!answerA?.reply?.includes('HotelA')) {
    throw new Error('Hotel A knowledge was not used for Hotel A');
  }

  if (!answerB?.reply?.includes('HotelB')) {
    throw new Error('Hotel B knowledge was not used for Hotel B');
  }

  if (answerB.reply.includes('HotelA')) {
    throw new Error('Hotel A knowledge leaked into Hotel B');
  }

  if (!knowledgeA.some((entry) => entry.key === 'wifi' && entry.value.includes('HotelA'))) {
    throw new Error('OpenAI context source for Hotel A did not include the correct KB');
  }

  if (!fallbackResult?.fallback) {
    throw new Error('Demo fallback was not used for a hotel without matching KB');
  }

  console.log(JSON.stringify({
    ok: true,
    hotelA: answerA.reply,
    hotelB: answerB.reply,
    fallbackHotelId: fallbackResult.entry.hotel_id
  }, null, 2));
} catch (error) {
  if (isMissingMigration(error)) {
    console.warn('Skipping hotel knowledge test: run supabase/sql/add_hotel_id_to_knowledge.sql first.');
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
