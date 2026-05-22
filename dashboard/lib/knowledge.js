import { getCurrentHotelForRequest } from './current-hotel';
import { canAccess } from './permissions';

export const KNOWLEDGE_ADMIN_ROLES = ['owner', 'admin', 'manager'];
export const PROTECTED_KNOWLEDGE_CATEGORIES = [
  'admin_knowledge',
  'system_knowledge',
  'technical',
  'pms',
  'whatsapp',
  'billing',
  'security',
  'compliance',
  'provider_marketplace',
  'platform',
  'ai_quality',
  'failure_intelligence',
  'automation_rules',
  'global_prompts'
];

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

const normalizeScope = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

export const isAdminKnowledgeRole = (role) => KNOWLEDGE_ADMIN_ROLES.includes(role);

export const isProtectedKnowledgeEntry = (entry = {}) => {
  const values = [
    entry.category,
    entry.key,
    entry.scope,
    entry.knowledge_scope,
    entry.metadata?.scope,
    entry.metadata?.knowledge_scope
  ].map(normalizeScope).filter(Boolean);

  return values.some((value) => PROTECTED_KNOWLEDGE_CATEGORIES.includes(value));
};

const assertKnowledgeWriteAllowed = ({ role, entry, existing = null }) => {
  if (isAdminKnowledgeRole(role)) {
    return;
  }

  if (isProtectedKnowledgeEntry(entry) || isProtectedKnowledgeEntry(existing)) {
    const error = new Error('This knowledge entry is admin-only');
    error.status = 403;
    throw error;
  }
};

export const getKnowledgeContext = async (request, permission = 'knowledge_base') => {
  const { supabase, hotel, role, fallback } = await getCurrentHotelForRequest(request);

  if (!hotel?.id) {
    throw new Error('No hotel available for knowledge base');
  }

  if (!canAccess(role, permission)) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
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
    hotelId: hotel.id,
    role,
    fallback,
    entries: (data || [])
      .map(normalizeEntry)
      .filter((entry) => isAdminKnowledgeRole(role) || !isProtectedKnowledgeEntry(entry)),
    canManageKnowledge: canAccess(role, 'knowledge_base_manage'),
    operationalMode: !isAdminKnowledgeRole(role)
  };
};

export const createKnowledgeEntry = async (request, {
  title,
  key,
  category,
  value,
  is_active = true
}) => {
  const { supabase, hotel, role } = await getKnowledgeContext(request, 'knowledge_base_manage');
  assertKnowledgeWriteAllowed({ role, entry: { title, key, category } });
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
  const { supabase, hotel, role } = await getKnowledgeContext(request, 'knowledge_base_manage');
  const { data: existing } = await supabase
    .from('hotel_knowledge')
    .select('id, hotel_id, title, key, category, value, is_active')
    .eq('id', id)
    .eq('hotel_id', hotel.id)
    .maybeSingle();

  assertKnowledgeWriteAllowed({ role, entry: { title, key, category }, existing });
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
  const { supabase, hotel, role } = await getKnowledgeContext(request, 'knowledge_base_manage');
  const { data: existing } = await supabase
    .from('hotel_knowledge')
    .select('id, hotel_id, title, key, category, value, is_active')
    .eq('id', id)
    .eq('hotel_id', hotel.id)
    .maybeSingle();

  assertKnowledgeWriteAllowed({ role, entry: {}, existing });
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
