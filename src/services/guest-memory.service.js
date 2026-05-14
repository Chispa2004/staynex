import { getSupabase } from './supabase.service.js';
import { detectGuestLanguage, normalizeLanguage } from './language.service.js';
import { logger } from '../utils/logger.js';

export const GUEST_MEMORY_TYPES = {
  PREFERENCE: 'preference',
  PERSONAL_CONTEXT: 'personal_context',
  DIETARY: 'dietary',
  STAY_PREFERENCE: 'stay_preference',
  UPSELL_INTEREST: 'upsell_interest',
  LANGUAGE: 'language',
  ROOM_PREFERENCE: 'room_preference'
};

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const isMissingGuestMemoryTable = (error) => (
  error?.message?.includes('guest_memory')
  || error?.details?.includes('guest_memory')
  || error?.hint?.includes('guest_memory')
);

export const getGuestMemory = async (hotelId, guestId, { activeOnly = true } = {}) => {
  if (!hotelId || !guestId) {
    return [];
  }

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('guest_memory')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('guest_id', guestId)
      .order('updated_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingGuestMemoryTable(error)) {
        return [];
      }

      throw error;
    }

    return data || [];
  } catch (error) {
    logger.warn('Guest memory lookup failed', {
      hotelId,
      guestId,
      message: error.message
    });

    return [];
  }
};

export const upsertGuestMemory = async ({
  hotelId,
  guestId,
  memoryType,
  memoryKey,
  memoryValue,
  confidence = 0.8,
  source = 'conversation',
  sourceMessageId = null,
  reservationId = null,
  metadata = {}
}) => {
  if (!hotelId || !guestId || !memoryKey || memoryValue === undefined || memoryValue === null) {
    return null;
  }

  try {
    const supabase = getSupabase();
    const record = {
      hotel_id: hotelId,
      guest_id: guestId,
      memory_type: memoryType,
      memory_key: memoryKey,
      memory_value: String(memoryValue),
      confidence,
      source,
      source_message_id: sourceMessageId,
      reservation_id: reservationId,
      is_active: true,
      metadata,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('guest_memory')
      .upsert(record, {
        onConflict: 'hotel_id,guest_id,memory_key'
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingGuestMemoryTable(error)) {
        logger.warn('guest_memory table missing; skipping memory upsert');
        return null;
      }

      throw error;
    }

    logger.info('Guest memory upserted', {
      hotelId,
      guestId,
      memoryKey,
      memoryType
    });

    return data;
  } catch (error) {
    logger.warn('Guest memory upsert failed', {
      hotelId,
      guestId,
      memoryKey,
      message: error.message
    });

    return null;
  }
};

const memory = ({ memoryType, memoryKey, memoryValue = 'true', confidence = 0.82, metadata = {} }) => ({
  memoryType,
  memoryKey,
  memoryValue,
  confidence,
  metadata
});

export const detectGuestMemoryFromMessage = ({
  message,
  context = {},
  aiResult = null
}) => {
  const text = normalize(message);
  const memories = [];
  const language = normalizeLanguage(context.language || detectGuestLanguage(message));

  if (language) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.LANGUAGE,
      memoryKey: 'preferred_language',
      memoryValue: language,
      confidence: 0.9,
      metadata: { detected_from: 'message' }
    }));
  }

  if (includesAny(text, ['viajo con mi pareja', 'viajamos en pareja', 'con mi pareja', 'my partner', 'with my partner', 'couple', 'en couple', 'mit meinem partner'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.PERSONAL_CONTEXT,
      memoryKey: 'traveling_with_partner',
      confidence: 0.88
    }));
  }

  if (includesAny(text, ['aniversario', 'anniversary', 'anniversaire', 'jahrestag'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.PERSONAL_CONTEXT,
      memoryKey: 'anniversary_trip',
      confidence: 0.9
    }));
  }

  if (
    includesAny(text, ['alergico al gluten', 'alergica al gluten', 'alergia al gluten', 'gluten allergy', 'allergic to gluten', 'allergique au gluten', 'gluten allergie'])
    || (includesAny(text, ['celiaco', 'celiaca', 'coeliac', 'celiac']) && includesAny(text, ['soy', 'i am', 'je suis', 'ich bin']))
  ) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.DIETARY,
      memoryKey: 'dietary_gluten_allergy',
      confidence: 0.94,
      metadata: { explicit_food_allergy: true }
    }));
  }

  if (includesAny(text, ['me interesa late checkout', 'late checkout', 'salir mas tarde', 'salida tarde', 'interested in late checkout'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.UPSELL_INTEREST,
      memoryKey: 'interested_late_checkout',
      confidence: 0.86
    }));
  }

  if (includesAny(text, ['transfer', 'traslado', 'aeropuerto', 'airport transfer', 'interested in transfer'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.UPSELL_INTEREST,
      memoryKey: 'interested_transfer',
      confidence: 0.84
    }));
  }

  if (includesAny(text, ['me interesa el spa', 'interested in spa', 'masaje', 'massage', 'spa'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.UPSELL_INTEREST,
      memoryKey: 'interested_spa',
      confidence: 0.82
    }));
  }

  if (includesAny(text, ['cena romantica', 'romantic dinner', 'diner romantique', 'romantisches abendessen'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.UPSELL_INTEREST,
      memoryKey: 'interested_romantic_dinner',
      confidence: 0.88
    }));
  }

  if (includesAny(text, ['prefiero almohada extra', 'almohada extra', 'extra pillow', 'oreiller supplementaire', 'extra kissen'])) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.ROOM_PREFERENCE,
      memoryKey: 'extra_pillow_preference',
      confidence: 0.86
    }));
  }

  if (aiResult?.upsell_opportunity && aiResult?.intent) {
    memories.push(memory({
      memoryType: GUEST_MEMORY_TYPES.UPSELL_INTEREST,
      memoryKey: `last_upsell_signal_${aiResult.intent}`,
      memoryValue: aiResult.intent,
      confidence: 0.65,
      metadata: { from_ai_intent: true }
    }));
  }

  return memories.filter((item, index, list) => (
    list.findIndex((candidate) => candidate.memoryKey === item.memoryKey) === index
  ));
};

export const formatGuestMemoryForPrompt = (memories = []) => {
  if (!memories.length) {
    return 'No hay memoria previa del huesped.';
  }

  return memories
    .map((item) => `- ${item.memory_type}/${item.memory_key}: ${item.memory_value} (confianza ${item.confidence ?? '-'})`)
    .join('\n');
};

export const upsertDetectedGuestMemories = async ({
  hotelId,
  guestId,
  sourceMessageId = null,
  reservationId = null,
  memories = []
}) => {
  const saved = [];

  for (const item of memories) {
    const record = await upsertGuestMemory({
      hotelId,
      guestId,
      memoryType: item.memoryType,
      memoryKey: item.memoryKey,
      memoryValue: item.memoryValue,
      confidence: item.confidence,
      source: 'conversation',
      sourceMessageId,
      reservationId,
      metadata: item.metadata || {}
    });

    if (record) {
      saved.push(record);
    }
  }

  return saved;
};
