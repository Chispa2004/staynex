import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const isMissingProviderTable = (error) => (
  error?.message?.includes('experience_providers')
  || error?.message?.includes('hotel_experience_providers')
  || error?.message?.includes('provider_experiences')
  || error?.details?.includes('experience_providers')
  || error?.details?.includes('hotel_experience_providers')
  || error?.details?.includes('provider_experiences')
  || error?.hint?.includes('experience_providers')
  || error?.hint?.includes('hotel_experience_providers')
  || error?.hint?.includes('provider_experiences')
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

export const normalizeProviderExperience = ({ experience, provider, hotelProvider }) => {
  const tags = normalizeArray(experience.tags);
  const audienceTags = normalizeArray(experience.audience_tags);

  return {
    id: experience.id,
    hotel_id: hotelProvider.hotel_id,
    provider_assignment_hotel_id: hotelProvider.hotel_id,
    provider_assignment_id: hotelProvider.id,
    provider_experience_id: experience.id,
    provider_id: provider.id,
    provider_source: provider.name,
    provider_slug: provider.slug,
    provider_type: provider.provider_type,
    provider_lead_email: hotelProvider.lead_email || provider.contact_email || null,
    title: experience.title,
    slug: experience.slug,
    category: experience.category || 'local_experiences',
    description: experience.description || experience.short_description || '',
    short_description: experience.short_description || null,
    price: experience.price === null || experience.price === undefined ? null : Number(experience.price),
    commission_percentage: experience.commission_percent === null || experience.commission_percent === undefined
      ? null
      : Number(experience.commission_percent),
    commission_percent: experience.commission_percent === null || experience.commission_percent === undefined
      ? null
      : Number(experience.commission_percent),
    currency: experience.currency || 'EUR',
    tags,
    target_guest_types: audienceTags,
    audience_tags: audienceTags,
    partner_name: provider.name,
    partner_contact: hotelProvider.lead_email || provider.contact_email || null,
    booking_url: provider.website_url || null,
    image_url: experience.image_url || null,
    destination_city: experience.destination_city || provider.destination_city || null,
    duration: experience.duration || null,
    active: experience.active !== false && hotelProvider.active !== false && provider.active !== false,
    vip_only: audienceTags.includes('vip') || tags.includes('vip') || experience.metadata?.vip_only === true,
    indoor: tags.includes('indoor') || experience.metadata?.indoor === true,
    weather_dependent: Boolean(experience.metadata?.weather_dependent),
    priority: Number(hotelProvider.priority || 0) + Number(experience.metadata?.provider_priority || 0),
    metadata: {
      ...(experience.metadata || {}),
      experience_provider: true,
      provider_id: provider.id,
      provider_assignment_id: hotelProvider.id,
      provider_assignment_hotel_id: hotelProvider.hotel_id,
      provider_slug: provider.slug,
      provider_name: provider.name,
      provider_experience_id: experience.id,
      provider_lead_email: hotelProvider.lead_email || provider.contact_email || null,
      provider_destination_country: provider.destination_country,
      provider_destination_city: experience.destination_city || provider.destination_city || null
    }
  };
};

export const getActiveExperienceProviderCatalogForHotel = async ({
  hotelId,
  activeOnly = true,
  limit = 80
} = {}) => {
  if (!hotelId) {
    return [];
  }

  try {
    const supabase = getSupabase();
    let assignmentsQuery = supabase
      .from('hotel_experience_providers')
      .select('*, provider:experience_providers(*)')
      .eq('hotel_id', hotelId)
      .order('priority', { ascending: false });

    if (activeOnly) {
      assignmentsQuery = assignmentsQuery.eq('active', true);
    }

    const { data: assignments, error: assignmentsError } = await assignmentsQuery;

    if (assignmentsError) {
      throw assignmentsError;
    }

    const activeAssignments = (assignments || [])
      .filter((assignment) => assignment.provider && (!activeOnly || assignment.provider.active !== false));

    if (!activeAssignments.length) {
      return [];
    }

    const providerIds = [...new Set(activeAssignments.map((assignment) => assignment.provider_id).filter(Boolean))];
    let experiencesQuery = supabase
      .from('provider_experiences')
      .select('*')
      .in('provider_id', providerIds)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (activeOnly) {
      experiencesQuery = experiencesQuery.eq('active', true);
    }

    const { data: experiences, error: experiencesError } = await experiencesQuery;

    if (experiencesError) {
      throw experiencesError;
    }

    const assignmentsByProvider = activeAssignments.reduce((acc, assignment) => ({
      ...acc,
      [assignment.provider_id]: assignment
    }), {});

    return (experiences || [])
      .filter((experience) => {
        const scopeId = experience.metadata?.hotel_scope_id
          || experience.metadata?.created_for_hotel_id
          || experience.metadata?.hotel_id
          || experience.metadata?.hotelId
          || null;
        const assigned = assignmentsByProvider[experience.provider_id];

        return Boolean(assigned) && (!scopeId || scopeId === hotelId);
      })
      .map((experience) => {
        const assignment = assignmentsByProvider[experience.provider_id];
        return assignment
          ? normalizeProviderExperience({
            experience,
            provider: assignment.provider,
            hotelProvider: assignment
          })
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  } catch (error) {
    if (isMissingProviderTable(error)) {
      logger.warn('Experience provider tables missing; provider catalog disabled');
      return [];
    }

    logger.warn('Experience provider catalog lookup failed', {
      hotelId,
      message: error.message
    });
    return [];
  }
};

export const getExperienceProviderKnowledgeForPrompt = (providerExperiences = []) => providerExperiences
  .filter((experience) => experience.active !== false)
  .slice(0, 12)
  .map((experience) => ({
    key: `provider_experience:${experience.provider_slug}:${experience.slug || experience.id}`,
    value: [
      experience.title,
      experience.provider_source ? `Provider: ${experience.provider_source}` : null,
      experience.category ? `Category: ${experience.category}` : null,
      experience.destination_city ? `Destination: ${experience.destination_city}` : null,
      experience.short_description || experience.description,
      experience.price ? `From ${experience.price} ${experience.currency || 'EUR'}` : null,
      experience.duration ? `Duration: ${experience.duration}` : null,
      experience.tags?.length ? `Tags: ${experience.tags.join(', ')}` : null
    ].filter(Boolean).join(' - '),
    category: experience.category,
    title: experience.title,
    provider: experience.provider_source
  }));
