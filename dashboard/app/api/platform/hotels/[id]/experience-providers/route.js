import { NextResponse } from 'next/server';
import {
  getPlatformContext,
  normalizeOptional,
  safeRows,
  slugify,
  writePlatformAuditLog
} from '@/lib/platform';

export const dynamic = 'force-dynamic';

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

const normalizeBoolean = (value, fallback = false) => (
  value === undefined || value === null ? fallback : Boolean(value)
);

const normalizeNumber = (value, fallback = null) => (
  value === '' || value === null || value === undefined ? fallback : Number(value)
);

const buildExperiencePayload = (body = {}, { hotelId = null } = {}) => {
  const title = normalizeOptional(body.title);

  if (!title) {
    throw new Error('Experience title is required');
  }

  const baseSlug = slugify(body.slug || title);
  const scopedSlug = hotelId ? `${baseSlug}-${String(hotelId).slice(0, 8)}` : baseSlug;

  return {
    title,
    slug: scopedSlug,
    category: normalizeOptional(body.category) || 'tour',
    description: normalizeOptional(body.description),
    short_description: normalizeOptional(body.short_description || body.shortDescription),
    price: body.price === '' || body.price === null || body.price === undefined ? null : Number(body.price),
    commission_percent: body.commission_percent === '' || body.commission_percent === null || body.commission_percent === undefined
      ? null
      : Number(body.commission_percent),
    currency: normalizeOptional(body.currency) || 'EUR',
    tags: normalizeArray(body.tags),
    audience_tags: normalizeArray(body.audience_tags || body.audienceTags),
    destination_city: normalizeOptional(body.destination_city || body.destinationCity),
    image_url: normalizeOptional(body.image_url || body.imageUrl),
    duration: normalizeOptional(body.duration),
    active: body.active === undefined ? true : Boolean(body.active),
    revenue_owner: normalizeOptional(body.revenue_owner) || 'staynex',
    revenue_type: normalizeOptional(body.revenue_type) || 'partner_marketplace',
    platform_commission_percent: normalizeNumber(body.platform_commission_percent ?? body.commission_percent),
    platform_commission_fixed: normalizeNumber(body.platform_commission_fixed),
    hotel_commission_percent: normalizeNumber(body.hotel_commission_percent, 0),
    hotel_visible_revenue: normalizeBoolean(body.hotel_visible_revenue, false),
    metadata: {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      managed_from: 'platform_hotel_detail',
      hotel_scope_id: hotelId || body.metadata?.hotel_scope_id || null,
      revenue_owner: normalizeOptional(body.revenue_owner) || 'staynex',
      revenue_type: normalizeOptional(body.revenue_type) || 'partner_marketplace',
      hotel_visible_revenue: normalizeBoolean(body.hotel_visible_revenue, false),
      future_api_ready: true
    },
    updated_at: new Date().toISOString()
  };
};

const loadProviderState = async ({ supabase, hotelId }) => {
  const [providers, assignments, experiences, bookingRequests] = await Promise.all([
    safeRows(
      supabase.from('experience_providers').select('*').order('name', { ascending: true }),
      'experience_providers'
    ),
    safeRows(
      supabase
        .from('hotel_experience_providers')
        .select('*, provider:experience_providers(*)')
        .eq('hotel_id', hotelId)
        .order('priority', { ascending: false }),
      'hotel_experience_providers'
    ),
    safeRows(
      supabase
        .from('provider_experiences')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200),
      'provider_experiences'
    ),
    safeRows(
      supabase
        .from('experience_booking_requests')
        .select('*')
        .eq('hotel_id', hotelId)
        .not('provider_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500),
      'experience_booking_requests'
    )
  ]);

  const assignedProviderIds = new Set(assignments.map((assignment) => assignment.provider_id));
  const metricsByProvider = bookingRequests.reduce((acc, request) => {
    if (!request.provider_id) return acc;
    const current = acc[request.provider_id] || {
      leadsGenerated: 0,
      estimatedRevenue: 0,
      commissionEstimate: 0
    };

    current.leadsGenerated += 1;
    current.estimatedRevenue += Number(request.estimated_revenue || 0);
    current.commissionEstimate += Number(request.platform_commission_amount || request.metadata?.platform_commission_amount || request.commission_estimate || 0);
    acc[request.provider_id] = current;
    return acc;
  }, {});
  const metricsByExperience = bookingRequests.reduce((acc, request) => {
    if (!request.provider_experience_id) return acc;
    const current = acc[request.provider_experience_id] || {
      leadsGenerated: 0,
      estimatedRevenue: 0,
      commissionEstimate: 0
    };

    current.leadsGenerated += 1;
    current.estimatedRevenue += Number(request.estimated_revenue || 0);
    current.commissionEstimate += Number(request.platform_commission_amount || request.metadata?.platform_commission_amount || request.commission_estimate || 0);
    acc[request.provider_experience_id] = current;
    return acc;
  }, {});
  const scopedExperiences = experiences.filter((experience) => {
    if (!assignedProviderIds.has(experience.provider_id)) {
      return false;
    }

    const scopeId = experience.metadata?.hotel_scope_id || experience.metadata?.created_for_hotel_id || null;
    return !scopeId || scopeId === hotelId;
  });
  const experienceCountsByProvider = scopedExperiences.reduce((acc, experience) => ({
    ...acc,
    [experience.provider_id]: (acc[experience.provider_id] || 0) + 1
  }), {});
  const connectedProviders = assignments.map((assignment) => ({
    ...assignment,
    experience_count: experienceCountsByProvider[assignment.provider_id] || 0,
    metrics: metricsByProvider[assignment.provider_id] || {
      leadsGenerated: 0,
      estimatedRevenue: 0,
      commissionEstimate: 0
    }
  }));
  const providerExperiences = scopedExperiences.map((experience) => ({
    ...experience,
    provider: providers.find((provider) => provider.id === experience.provider_id) || null,
    hotel_scoped: Boolean(experience.metadata?.hotel_scope_id || experience.metadata?.created_for_hotel_id),
    metrics: metricsByExperience[experience.id] || {
      leadsGenerated: 0,
      estimatedRevenue: 0,
      commissionEstimate: 0
    }
  }));

  return {
    hotelId,
    providers,
    assignments: connectedProviders,
    experiences: providerExperiences,
    connectedProviders,
    providerExperiences,
    missingTable: false
  };
};

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { supabase } = await getPlatformContext(request, { requireAdmin: true });
    const state = await loadProviderState({ supabase, hotelId: id });

    return NextResponse.json(state, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    if (isMissingProviderTable(error)) {
      return NextResponse.json({
        hotelId: null,
        providers: [],
        assignments: [],
        experiences: [],
        connectedProviders: [],
        providerExperiences: [],
        missingTable: true,
        error: 'Run supabase/sql/create_experience_providers.sql to enable Experience Providers.'
      }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return NextResponse.json({
      error: error.message || 'Could not load experience providers'
    }, { status: error.status || 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const action = body.action || 'assign_provider';

    if (action === 'assign_provider') {
      if (!body.providerId) {
        return NextResponse.json({ error: 'Provider id is required' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const { data: assignment, error } = await supabase
        .from('hotel_experience_providers')
        .upsert({
          hotel_id: id,
          provider_id: body.providerId,
          priority: Number(body.priority || 0),
          active: body.active === undefined ? true : Boolean(body.active),
          lead_email: normalizeOptional(body.leadEmail || body.lead_email),
          notes: normalizeOptional(body.notes),
          revenue_owner: normalizeOptional(body.revenue_owner) || 'staynex',
          revenue_type: normalizeOptional(body.revenue_type) || 'partner_marketplace',
          commission_model: normalizeOptional(body.commission_model) || 'percent',
          staynex_commission_percent: normalizeNumber(body.staynex_commission_percent, 10),
          staynex_commission_fixed: normalizeNumber(body.staynex_commission_fixed),
          hotel_commission_percent: normalizeNumber(body.hotel_commission_percent, 0),
          visible_to_hotel: normalizeBoolean(body.visible_to_hotel, true),
          hotel_can_manage: normalizeBoolean(body.hotel_can_manage, false),
          reception_action_required: normalizeBoolean(body.reception_action_required, false),
          updated_at: now
        }, { onConflict: 'hotel_id,provider_id' })
        .select('*, provider:experience_providers(*)')
        .single();

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_assigned',
        hotelId: id,
        metadata: {
          provider_id: body.providerId,
          active: assignment.active,
          priority: assignment.priority,
          revenue_owner: assignment.revenue_owner,
          revenue_type: assignment.revenue_type
        }
      });

      const state = await loadProviderState({ supabase, hotelId: id });
      return NextResponse.json({ ok: true, assignment, ...state });
    }

    if (action === 'create_experience') {
      if (!body.providerId) {
        return NextResponse.json({ error: 'Provider id is required' }, { status: 400 });
      }

      const assignment = await supabase
        .from('hotel_experience_providers')
        .select('id, provider_id')
        .eq('hotel_id', id)
        .eq('provider_id', body.providerId)
        .maybeSingle();

      if (assignment.error) {
        throw assignment.error;
      }

      if (!assignment.data) {
        return NextResponse.json({ error: 'Provider must be connected to this hotel before adding excursions' }, { status: 400 });
      }

      const payload = buildExperiencePayload(body, { hotelId: id });
      const { data: experience, error } = await supabase
        .from('provider_experiences')
        .upsert({
          ...payload,
          provider_id: body.providerId
        }, { onConflict: 'provider_id,slug' })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_created',
        hotelId: id,
        metadata: {
          provider_id: body.providerId,
          provider_experience_id: experience.id,
          title: experience.title
        }
      });

      const state = await loadProviderState({ supabase, hotelId: id });
      return NextResponse.json({ ok: true, experience, ...state }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported provider action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not update experience providers'
    }, { status: error.status || 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const action = body.action;

    if (action === 'update_assignment') {
      if (!body.assignmentId) {
        return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });
      }

      const updates = {
        priority: Number(body.priority || 0),
        active: body.active === undefined ? true : Boolean(body.active),
        lead_email: normalizeOptional(body.leadEmail || body.lead_email),
        notes: normalizeOptional(body.notes),
        revenue_owner: normalizeOptional(body.revenue_owner) || 'staynex',
        revenue_type: normalizeOptional(body.revenue_type) || 'partner_marketplace',
        commission_model: normalizeOptional(body.commission_model) || 'percent',
        staynex_commission_percent: normalizeNumber(body.staynex_commission_percent, 10),
        staynex_commission_fixed: normalizeNumber(body.staynex_commission_fixed),
        hotel_commission_percent: normalizeNumber(body.hotel_commission_percent, 0),
        visible_to_hotel: normalizeBoolean(body.visible_to_hotel, true),
        hotel_can_manage: normalizeBoolean(body.hotel_can_manage, false),
        reception_action_required: normalizeBoolean(body.reception_action_required, false),
        updated_at: new Date().toISOString()
      };
      const { data: assignment, error } = await supabase
        .from('hotel_experience_providers')
        .update(updates)
        .eq('id', body.assignmentId)
        .eq('hotel_id', id)
        .select('*, provider:experience_providers(*)')
        .single();

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_updated',
        hotelId: id,
        metadata: {
          provider_id: assignment.provider_id,
          active: assignment.active,
          priority: assignment.priority,
          revenue_owner: assignment.revenue_owner,
          revenue_type: assignment.revenue_type
        }
      });

      const state = await loadProviderState({ supabase, hotelId: id });
      return NextResponse.json({ ok: true, assignment, ...state });
    }

    if (action === 'update_experience') {
      if (!body.experienceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const existing = await supabase
        .from('provider_experiences')
        .select('*')
        .eq('id', body.experienceId)
        .single();

      if (existing.error) {
        throw existing.error;
      }

      const assigned = await supabase
        .from('hotel_experience_providers')
        .select('id')
        .eq('hotel_id', id)
        .eq('provider_id', existing.data.provider_id)
        .maybeSingle();

      if (assigned.error) {
        throw assigned.error;
      }

      if (!assigned.data) {
        return NextResponse.json({ error: 'Provider experience is not connected to this hotel' }, { status: 403 });
      }

      const scopeId = existing.data.metadata?.hotel_scope_id || existing.data.metadata?.created_for_hotel_id || null;
      if (!scopeId) {
        return NextResponse.json({
          error: 'Shared provider catalog experiences cannot be edited from a single hotel. Create a hotel-specific excursion instead.'
        }, { status: 403 });
      }

      if (scopeId && scopeId !== id) {
        return NextResponse.json({ error: 'Provider experience belongs to another hotel scope' }, { status: 403 });
      }

      const payload = buildExperiencePayload(body, { hotelId: scopeId });
      const { data: experience, error } = await supabase
        .from('provider_experiences')
        .update(payload)
        .eq('id', body.experienceId)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_updated',
        hotelId: id,
        metadata: {
          provider_id: experience.provider_id,
          provider_experience_id: experience.id,
          title: experience.title
        }
      });

      const state = await loadProviderState({ supabase, hotelId: id });
      return NextResponse.json({ ok: true, experience, ...state });
    }

    return NextResponse.json({ error: 'Unsupported provider action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not update provider state'
    }, { status: error.status || 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const action = body.action;

    if (action === 'disconnect_provider') {
      if (!body.assignmentId) {
        return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });
      }

      const { data: assignment, error: lookupError } = await supabase
        .from('hotel_experience_providers')
        .select('*')
        .eq('id', body.assignmentId)
        .eq('hotel_id', id)
        .single();

      if (lookupError) {
        throw lookupError;
      }

      const { error } = await supabase
        .from('hotel_experience_providers')
        .delete()
        .eq('id', body.assignmentId)
        .eq('hotel_id', id);

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_disconnected',
        hotelId: id,
        metadata: {
          provider_id: assignment.provider_id
        }
      });

      const state = await loadProviderState({ supabase, hotelId: id });
      return NextResponse.json({ ok: true, ...state });
    }

    if (action === 'delete_experience') {
      if (!body.experienceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const { data: experience, error: lookupError } = await supabase
        .from('provider_experiences')
        .select('*')
        .eq('id', body.experienceId)
        .single();

      if (lookupError) {
        throw lookupError;
      }

      const { data: assignment, error: assignmentError } = await supabase
        .from('hotel_experience_providers')
        .select('id')
        .eq('hotel_id', id)
        .eq('provider_id', experience.provider_id)
        .maybeSingle();

      if (assignmentError) {
        throw assignmentError;
      }

      if (!assignment) {
        return NextResponse.json({ error: 'Provider experience is not connected to this hotel' }, { status: 403 });
      }

      const scopeId = experience.metadata?.hotel_scope_id || experience.metadata?.created_for_hotel_id || null;
      if (!scopeId) {
        return NextResponse.json({
          error: 'Shared provider catalog experiences cannot be deleted from a single hotel.'
        }, { status: 403 });
      }

      if (scopeId && scopeId !== id) {
        return NextResponse.json({ error: 'Provider experience belongs to another hotel scope' }, { status: 403 });
      }

      const { error } = await supabase
        .from('provider_experiences')
        .delete()
        .eq('id', body.experienceId);

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_deleted',
        hotelId: id,
        metadata: {
          provider_id: experience.provider_id,
          provider_experience_id: experience.id,
          title: experience.title
        }
      });

      const state = await loadProviderState({ supabase, hotelId: id });
      return NextResponse.json({ ok: true, ...state });
    }

    return NextResponse.json({ error: 'Unsupported provider delete action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not delete provider state'
    }, { status: error.status || 500 });
  }
}
