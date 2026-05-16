import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const isMissingLocalKnowledgeTable = (error) => (
  error?.message?.includes('local_knowledge_items')
  || error?.details?.includes('local_knowledge_items')
  || error?.hint?.includes('local_knowledge_items')
);

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
};

export const normalizeLocalKnowledgeItem = (item) => ({
  ...item,
  tags: normalizeArray(item.tags),
  audience_tags: normalizeArray(item.audience_tags),
  recommendation_contexts: normalizeArray(item.recommendation_contexts),
  weather_tags: normalizeArray(item.weather_tags),
  active: item.active ?? true,
  featured: Boolean(item.featured),
  indoor: Boolean(item.indoor),
  priority: Number(item.priority || 0),
  metadata: item.metadata || {}
});

export const getLocalKnowledgeForHotel = async ({
  hotelId,
  activeOnly = true,
  limit = 100
} = {}) => {
  if (!hotelId) {
    return [];
  }

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('local_knowledge_items')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('featured', { ascending: false })
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingLocalKnowledgeTable(error)) {
        logger.warn('local_knowledge_items table missing; local intelligence disabled');
        return [];
      }

      throw error;
    }

    return (data || []).map(normalizeLocalKnowledgeItem);
  } catch (error) {
    logger.warn('Local knowledge lookup failed', {
      hotelId,
      message: error.message
    });
    return [];
  }
};

export const getLocalKnowledgeForPrompt = (items = []) => items
  .filter((item) => item.active !== false)
  .slice(0, 18)
  .map((item) => ({
    key: `local:${item.slug || item.id}`,
    value: [
      item.title,
      item.category ? `Category: ${item.category}` : null,
      item.short_description || item.description,
      item.opening_hours ? `Hours: ${item.opening_hours}` : null,
      item.price_range ? `Price: ${item.price_range}` : null,
      item.address ? `Address: ${item.address}` : null,
      item.tags?.length ? `Tags: ${item.tags.join(', ')}` : null,
      item.audience_tags?.length ? `Audience: ${item.audience_tags.join(', ')}` : null,
      item.recommendation_contexts?.length ? `Best for: ${item.recommendation_contexts.join(', ')}` : null,
      item.weather_tags?.length ? `Weather: ${item.weather_tags.join(', ')}` : null,
      item.featured ? 'Featured by hotel staff' : null
    ].filter(Boolean).join(' - '),
    category: item.category,
    title: item.title
  }));
