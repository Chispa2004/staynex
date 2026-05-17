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

const buildExperiencePayload = (body = {}) => {
  const title = normalizeOptional(body.title);

  if (!title) {
    throw new Error('Experience title is required');
  }

  return {
    title,
    slug: slugify(body.slug || title),
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
    metadata: {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      managed_from: 'platform_hotel_detail',
      future_api_ready: true
    },
    updated_at: new Date().toISOString()
  };
};

const loadProviderState = async ({ supabase, hotelId }) => {
  const [providers, assignments, experiences] = await Promise.all([
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
    )
  ]);

  const assignedProviderIds = new Set(assignments.map((assignment) => assignment.provider_id));

  return {
    hotelId,
    providers,
    assignments,
    experiences: experiences.filter((experience) => assignedProviderIds.has(experience.provider_id)),
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
          priority: assignment.priority
        }
      });

      return NextResponse.json({ ok: true, assignment });
    }

    if (action === 'create_experience') {
      if (!body.providerId) {
        return NextResponse.json({ error: 'Provider id is required' }, { status: 400 });
      }

      const payload = buildExperiencePayload(body);
      const { data: experience, error } = await supabase
        .from('provider_experiences')
        .insert({
          ...payload,
          provider_id: body.providerId
        })
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

      return NextResponse.json({ ok: true, experience }, { status: 201 });
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
          priority: assignment.priority
        }
      });

      return NextResponse.json({ ok: true, assignment });
    }

    if (action === 'update_experience') {
      if (!body.experienceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const payload = buildExperiencePayload(body);
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

      return NextResponse.json({ ok: true, experience });
    }

    return NextResponse.json({ error: 'Unsupported provider action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not update provider state'
    }, { status: error.status || 500 });
  }
}
