import { getCurrentHotelForRequest } from './current-hotel';
import { writeEnterpriseAuditLog } from './enterprise-audit';
import { canAccess } from './permissions';
import { LOCAL_KNOWLEDGE_CATEGORIES } from './local-knowledge-constants';

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

const slugify = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const normalizeItem = (item) => ({
  ...item,
  tags: normalizeArray(item.tags),
  audience_tags: normalizeArray(item.audience_tags),
  recommendation_contexts: normalizeArray(item.recommendation_contexts),
  weather_tags: normalizeArray(item.weather_tags),
  priority: Number(item.priority || 0),
  active: item.active ?? true,
  featured: Boolean(item.featured),
  indoor: Boolean(item.indoor),
  metadata: item.metadata || {}
});

const getLocalKnowledgeContext = async (request, permission = 'local_knowledge') => {
  const { supabase, hotel, role, fallback, user, platformRole } = await getCurrentHotelForRequest(request);

  if (!hotel?.id) {
    const error = new Error('No hotel available for local knowledge');
    error.status = 400;
    throw error;
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

export const validateLocalKnowledgePayload = (payload = {}) => {
  const title = String(payload.title || '').trim();
  const category = String(payload.category || '').trim();
  const description = String(payload.description || payload.short_description || '').trim();

  if (!title || !category || !description) {
    throw new Error('title, category and description are required');
  }

  if (!LOCAL_KNOWLEDGE_CATEGORIES.includes(category)) {
    throw new Error('Invalid local knowledge category');
  }

  return {
    title,
    slug: slugify(payload.slug || title),
    category,
    description,
    short_description: String(payload.short_description || '').trim() || description.slice(0, 160),
    tags: normalizeArray(payload.tags),
    audience_tags: normalizeArray(payload.audience_tags),
    recommendation_contexts: normalizeArray(payload.recommendation_contexts),
    address: String(payload.address || '').trim() || null,
    website_url: String(payload.website_url || '').trim() || null,
    phone: String(payload.phone || '').trim() || null,
    image_url: String(payload.image_url || '').trim() || null,
    opening_hours: String(payload.opening_hours || '').trim() || null,
    price_range: String(payload.price_range || '').trim() || null,
    priority: Number(payload.priority || 0),
    active: payload.active ?? true,
    featured: Boolean(payload.featured),
    indoor: Boolean(payload.indoor),
    weather_tags: normalizeArray(payload.weather_tags),
    metadata: {
      ...(payload.metadata || {}),
      managed_from_local_knowledge_studio: true,
      future_enrichment: ['google_places', 'tripadvisor', 'maps', 'ai_auto_tagging']
    },
    updated_at: new Date().toISOString()
  };
};

export const getLocalKnowledgeItems = async (request) => {
  const { supabase, hotel, role, fallback } = await getLocalKnowledgeContext(request);
  const { data, error } = await supabase
    .from('local_knowledge_items')
    .select('*')
    .eq('hotel_id', hotel.id)
    .order('featured', { ascending: false })
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(300);

  if (error) {
    if (isMissingLocalKnowledgeTable(error)) {
      return {
        hotel,
        role,
        fallback,
        items: [],
        missingTable: true
      };
    }

    throw error;
  }

  return {
    hotel,
    role,
    fallback,
    items: (data || []).map(normalizeItem)
  };
};

export const createLocalKnowledgeItem = async (request, payload) => {
  const { supabase, hotel, role, user, platformRole } = await getLocalKnowledgeContext(request, 'local_knowledge_manage');
  const record = {
    hotel_id: hotel.id,
    ...validateLocalKnowledgePayload(payload)
  };
  const { data, error } = await supabase
    .from('local_knowledge_items')
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
    action: 'local_knowledge_created',
    entityType: 'local_knowledge_item',
    entityId: data.id,
    newValues: data,
    metadata: { source: 'local_knowledge_studio' }
  });

  return normalizeItem(data);
};

export const updateLocalKnowledgeItem = async (request, id, payload) => {
  const { supabase, hotel, role, user, platformRole } = await getLocalKnowledgeContext(request, 'local_knowledge_manage');
  const { data: existing } = await supabase
    .from('local_knowledge_items')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('local_knowledge_items')
    .update(validateLocalKnowledgePayload(payload))
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
    action: 'local_knowledge_updated',
    entityType: 'local_knowledge_item',
    entityId: data.id,
    oldValues: existing || {},
    newValues: data,
    metadata: { source: 'local_knowledge_studio' }
  });

  return normalizeItem(data);
};

export const deleteLocalKnowledgeItem = async (request, id) => {
  const { supabase, hotel, role, user, platformRole } = await getLocalKnowledgeContext(request, 'local_knowledge_manage');
  const { data: existing } = await supabase
    .from('local_knowledge_items')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('local_knowledge_items')
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
    action: 'local_knowledge_deleted',
    entityType: 'local_knowledge_item',
    entityId: id,
    oldValues: existing || {},
    metadata: { source: 'local_knowledge_studio' }
  });

  return { id };
};
