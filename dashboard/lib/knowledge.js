import { getCurrentHotelForRequest } from './current-hotel';

const isMissingKnowledgeMetadataColumns = (error) => (
  error?.message?.includes('title')
  || error?.message?.includes('category')
  || error?.message?.includes('is_active')
  || error?.message?.includes('updated_at')
  || error?.details?.includes('title')
  || error?.details?.includes('category')
  || error?.details?.includes('is_active')
  || error?.details?.includes('updated_at')
);

const normalizeEntry = (entry) => ({
  ...entry,
  title: entry.title || entry.key,
  category: entry.category || entry.key,
  is_active: entry.is_active ?? true
});

export const getKnowledgeContext = async (request) => {
  const { supabase, hotel, role, fallback } = await getCurrentHotelForRequest(request);

  if (!hotel?.id) {
    throw new Error('No hotel available for knowledge base');
  }

  return {
    supabase,
    hotel,
    role,
    fallback
  };
};

export const getKnowledgeEntries = async (request) => {
  const { supabase, hotel, role, fallback } = await getKnowledgeContext(request);
  let { data, error } = await supabase
    .from('hotel_knowledge')
    .select('id, hotel_id, title, key, category, value, is_active, updated_at')
    .eq('hotel_id', hotel.id)
    .order('key', { ascending: true });

  if (error && isMissingKnowledgeMetadataColumns(error)) {
    const fallbackResult = await supabase
      .from('hotel_knowledge')
      .select('id, hotel_id, key, value')
      .eq('hotel_id', hotel.id)
      .order('key', { ascending: true });

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  return {
    hotel,
    role,
    fallback,
    entries: (data || []).map(normalizeEntry)
  };
};

export const createKnowledgeEntry = async (request, {
  title,
  key,
  category,
  value,
  is_active = true
}) => {
  const { supabase, hotel } = await getKnowledgeContext(request);
  const { data, error } = await supabase
    .from('hotel_knowledge')
    .insert({
      hotel_id: hotel.id,
      title: title || key,
      key,
      category: category || key,
      value,
      is_active,
      updated_at: new Date().toISOString()
    })
    .select('id, hotel_id, title, key, category, value, is_active, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return normalizeEntry(data);
};

export const updateKnowledgeEntry = async (request, {
  id,
  title,
  key,
  category,
  value,
  is_active
}) => {
  const { supabase, hotel } = await getKnowledgeContext(request);
  const updates = {
    updated_at: new Date().toISOString()
  };

  if (title !== undefined) updates.title = title || key || null;
  if (key !== undefined) updates.key = key;
  if (category !== undefined) updates.category = category || key || null;
  if (value !== undefined) updates.value = value;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  const { data, error } = await supabase
    .from('hotel_knowledge')
    .update(updates)
    .eq('id', id)
    .eq('hotel_id', hotel.id)
    .select('id, hotel_id, title, key, category, value, is_active, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return normalizeEntry(data);
};

export const deleteKnowledgeEntry = async (request, id) => {
  const { supabase, hotel } = await getKnowledgeContext(request);
  const { error } = await supabase
    .from('hotel_knowledge')
    .delete()
    .eq('id', id)
    .eq('hotel_id', hotel.id);

  if (error) {
    throw error;
  }

  return { id };
};
