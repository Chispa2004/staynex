import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const isMissingExperiencesTable = (error) => (
  error?.message?.includes('hotel_experiences')
  || error?.details?.includes('hotel_experiences')
  || error?.hint?.includes('hotel_experiences')
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

export const normalizeHotelExperience = (experience) => ({
  ...experience,
  tags: normalizeArray(experience.tags),
  target_guest_types: normalizeArray(experience.target_guest_types),
  active: experience.active ?? true,
  vip_only: Boolean(experience.vip_only),
  indoor: Boolean(experience.indoor),
  weather_dependent: Boolean(experience.weather_dependent),
  priority: Number(experience.priority || 0),
  price: experience.price === null || experience.price === undefined ? null : Number(experience.price),
  commission_percentage: experience.commission_percentage === null || experience.commission_percentage === undefined
    ? null
    : Number(experience.commission_percentage)
});

export const getHotelExperiences = async ({
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
      .from('hotel_experiences')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingExperiencesTable(error)) {
        logger.warn('hotel_experiences table missing; experience catalog disabled');
        return [];
      }

      throw error;
    }

    return (data || [])
      .filter((experience) => experience.hotel_id === hotelId)
      .filter((experience) => {
        const scopeId = experience.metadata?.hotel_scope_id
          || experience.metadata?.created_for_hotel_id
          || experience.metadata?.hotel_id
          || experience.metadata?.hotelId
          || null;

        return !scopeId || scopeId === hotelId;
      })
      .map(normalizeHotelExperience);
  } catch (error) {
    logger.warn('Hotel experiences lookup failed', {
      hotelId,
      message: error.message
    });
    return [];
  }
};

export const getExperienceKnowledgeForPrompt = (experiences = []) => experiences
  .filter((experience) => experience.active !== false)
  .slice(0, 12)
  .map((experience) => ({
    key: `experience:${experience.slug || experience.id}`,
    value: [
      experience.title,
      experience.category ? `Category: ${experience.category}` : null,
      experience.description,
      experience.price ? `From ${experience.price} EUR` : null,
      experience.partner_name ? `Partner: ${experience.partner_name}` : null,
      experience.tags?.length ? `Tags: ${experience.tags.join(', ')}` : null
    ].filter(Boolean).join(' - '),
    category: experience.category,
    title: experience.title
  }));
