import { getCurrentHotelForRequest } from './current-hotel';
import { writeEnterpriseAuditLog } from './enterprise-audit';
import { canAccess } from './permissions';

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
};

const slugify = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const isMissingExperiencesTable = (error) => (
  error?.message?.includes('hotel_experiences')
  || error?.details?.includes('hotel_experiences')
  || error?.hint?.includes('hotel_experiences')
);

export const EXPERIENCE_CATEGORIES = [
  'boat_tour',
  'beach_club',
  'restaurant',
  'nightlife',
  'romantic',
  'family',
  'kids',
  'culture',
  'golf',
  'wellness',
  'spa',
  'transfer',
  'adventure',
  'luxury',
  'indoor',
  'rainy_day'
];

const normalizeExperience = (experience) => ({
  ...experience,
  tags: normalizeArray(experience.tags),
  target_guest_types: normalizeArray(experience.target_guest_types),
  price: experience.price === null || experience.price === undefined ? '' : Number(experience.price),
  commission_percentage: experience.commission_percentage === null || experience.commission_percentage === undefined
    ? ''
    : Number(experience.commission_percentage),
  priority: Number(experience.priority || 0),
  active: experience.active ?? true,
  vip_only: Boolean(experience.vip_only),
  indoor: Boolean(experience.indoor),
  weather_dependent: Boolean(experience.weather_dependent),
  metadata: experience.metadata || {}
});

export const validateExperiencePayload = (payload = {}) => {
  const title = payload.title?.trim();
  const description = payload.description?.trim();
  const category = payload.category?.trim();

  if (!title || !description || !category) {
    throw new Error('title, description and category are required');
  }

  if (!EXPERIENCE_CATEGORIES.includes(category)) {
    throw new Error('Invalid experience category');
  }

  return {
    title,
    slug: slugify(payload.slug || title),
    description,
    category,
    tags: normalizeArray(payload.tags),
    target_guest_types: normalizeArray(payload.target_guest_types),
    price: payload.price === '' || payload.price === null || payload.price === undefined ? null : Number(payload.price),
    commission_percentage: payload.commission_percentage === '' || payload.commission_percentage === null || payload.commission_percentage === undefined
      ? null
      : Number(payload.commission_percentage),
    partner_name: payload.partner_name?.trim() || null,
    partner_contact: payload.partner_contact?.trim() || null,
    booking_url: payload.booking_url?.trim() || null,
    image_url: payload.image_url?.trim() || null,
    priority: Number(payload.priority || 0),
    active: payload.active ?? true,
    vip_only: Boolean(payload.vip_only),
    indoor: Boolean(payload.indoor),
    weather_dependent: Boolean(payload.weather_dependent),
    language: payload.language?.trim() || 'en',
    metadata: {
      ...(payload.metadata || {}),
      managed_from_dashboard: true,
      future_integrations: ['google_places', 'tripadvisor', 'viator', 'weather_api', 'events_api']
    },
    updated_at: new Date().toISOString()
  };
};

const getExperienceContext = async (request, permission = 'experiences') => {
  const { supabase, hotel, role, fallback, user, platformRole } = await getCurrentHotelForRequest(request);

  if (!hotel?.id) {
    throw new Error('No hotel available for experiences');
  }

  if (!canAccess(role, permission)) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }

  if (platformRole === 'support' && permission.endsWith('_manage')) {
    const error = new Error('Support sessions are read-only by default');
    error.status = 403;
    throw error;
  }

  return { supabase, hotel, role, fallback, user, platformRole };
};

export const getExperienceEntries = async (request) => {
  const { supabase, hotel, role, fallback } = await getExperienceContext(request);
  const { data, error } = await supabase
    .from('hotel_experiences')
    .select('*')
    .eq('hotel_id', hotel.id)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(300);

  if (error) {
    if (isMissingExperiencesTable(error)) {
      return {
        hotel,
        hotelId: hotel.id,
        role,
        fallback,
        experiences: [],
        missingTable: true
      };
    }

    throw error;
  }

  return {
    hotel,
    hotelId: hotel.id,
    role,
    fallback,
    experiences: (data || []).map(normalizeExperience)
  };
};

export const createExperienceEntry = async (request, payload) => {
  const { supabase, hotel, role, user, platformRole } = await getExperienceContext(request, 'experiences_manage');
  const record = {
    hotel_id: hotel.id,
    ...validateExperiencePayload(payload)
  };
  const { data, error } = await supabase
    .from('hotel_experiences')
    .insert(record)
    .select('*')
    .single();

  if (error) throw error;

  await writeEnterpriseAuditLog({
    supabase,
    request,
    actor: user,
    actorRole: role,
    actorPlatformRole: platformRole,
    hotelId: hotel.id,
    action: 'experience_created',
    entityType: 'hotel_experience',
    entityId: data.id,
    newValues: data,
    metadata: { source: 'dashboard_experiences' }
  });

  return normalizeExperience(data);
};

export const updateExperienceEntry = async (request, id, payload) => {
  const { supabase, hotel, role, user, platformRole } = await getExperienceContext(request, 'experiences_manage');
  const { data: existing } = await supabase
    .from('hotel_experiences')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('hotel_experiences')
    .update(validateExperiencePayload(payload))
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;

  await writeEnterpriseAuditLog({
    supabase,
    request,
    actor: user,
    actorRole: role,
    actorPlatformRole: platformRole,
    hotelId: hotel.id,
    action: 'experience_updated',
    entityType: 'hotel_experience',
    entityId: data.id,
    oldValues: existing || {},
    newValues: data,
    metadata: { source: 'dashboard_experiences' }
  });

  return normalizeExperience(data);
};

export const deleteExperienceEntry = async (request, id) => {
  const { supabase, hotel, role, user, platformRole } = await getExperienceContext(request, 'experiences_manage');
  const { data: existing } = await supabase
    .from('hotel_experiences')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('hotel_experiences')
    .delete()
    .eq('hotel_id', hotel.id)
    .eq('id', id);

  if (error) throw error;

  await writeEnterpriseAuditLog({
    supabase,
    request,
    actor: user,
    actorRole: role,
    actorPlatformRole: platformRole,
    hotelId: hotel.id,
    action: 'experience_deleted',
    entityType: 'hotel_experience',
    entityId: id,
    oldValues: existing || {},
    metadata: { source: 'dashboard_experiences' }
  });

  return { id };
};
