import { getSupabaseAdmin } from './supabase';

export const getDemoHotel = async () => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('hotels')
    .select('id, name')
    .eq('name', 'Staynex Demo Hotel')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Staynex Demo Hotel not found');
  }

  return data;
};

export const getKnowledgeEntries = async () => {
  const supabase = getSupabaseAdmin();
  const hotel = await getDemoHotel();

  const { data, error } = await supabase
    .from('hotel_knowledge')
    .select('id, hotel_id, key, value')
    .eq('hotel_id', hotel.id)
    .order('key', { ascending: true });

  if (error) {
    throw error;
  }

  return {
    hotel,
    entries: data || []
  };
};

export const createKnowledgeEntry = async ({ key, value }) => {
  const supabase = getSupabaseAdmin();
  const hotel = await getDemoHotel();

  const { data, error } = await supabase
    .from('hotel_knowledge')
    .insert({
      hotel_id: hotel.id,
      key,
      value
    })
    .select('id, hotel_id, key, value')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateKnowledgeEntry = async ({ id, key, value }) => {
  const supabase = getSupabaseAdmin();
  const hotel = await getDemoHotel();

  const { data, error } = await supabase
    .from('hotel_knowledge')
    .update({ key, value })
    .eq('id', id)
    .eq('hotel_id', hotel.id)
    .select('id, hotel_id, key, value')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const deleteKnowledgeEntry = async (id) => {
  const supabase = getSupabaseAdmin();
  const hotel = await getDemoHotel();

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
