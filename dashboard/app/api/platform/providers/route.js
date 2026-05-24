import { NextResponse } from 'next/server';
import {
  getPlatformContext,
  normalizeOptional,
  safeRows,
  slugify,
  writePlatformAuditLog
} from '@/lib/platform';

export const dynamic = 'force-dynamic';

const isProviderTableMissing = (error) => (
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

const normalizeTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const providerPayload = (body = {}) => {
  const name = normalizeOptional(body.name);

  if (!name) {
    throw new Error('Provider name is required');
  }

  return {
    name,
    slug: slugify(body.slug || name),
    provider_type: normalizeOptional(body.provider_type || body.providerType) || 'tour_operator',
    destination_country: normalizeOptional(body.destination_country || body.destinationCountry) || 'Morocco',
    destination_city: normalizeOptional(body.destination_city || body.destinationCity),
    contact_email: normalizeOptional(body.contact_email || body.contactEmail),
    website_url: normalizeOptional(body.website_url || body.websiteUrl),
    active: body.active === undefined ? true : Boolean(body.active),
    metadata: {
      ...(body.metadata || {}),
      phone: normalizeOptional(body.phone),
      logo_url: normalizeOptional(body.logo_url || body.logoUrl),
      categories: normalizeTags(body.categories),
      languages: normalizeTags(body.languages),
      notes: normalizeOptional(body.notes),
      revenue_config: normalizeOptional(body.revenue_config || body.revenueConfig)
    },
    updated_at: new Date().toISOString()
  };
};

const experiencePayload = (body = {}) => {
  const providerId = normalizeOptional(body.provider_id || body.providerId);
  const title = normalizeOptional(body.title);

  if (!providerId) {
    throw new Error('Provider is required');
  }

  if (!title) {
    throw new Error('Experience title is required');
  }

  return {
    provider_id: providerId,
    title,
    slug: slugify(body.slug || title),
    category: normalizeOptional(body.category) || 'tour',
    description: normalizeOptional(body.description),
    short_description: normalizeOptional(body.short_description || body.shortDescription),
    price: body.price === '' || body.price === undefined || body.price === null ? null : Number(body.price),
    commission_percent: body.commission_percent === '' || body.commissionPercent === '' ? null : Number(body.commission_percent ?? body.commissionPercent ?? 0),
    currency: normalizeOptional(body.currency) || 'EUR',
    tags: normalizeTags(body.tags),
    audience_tags: normalizeTags(body.audience_tags || body.audienceTags),
    destination_city: normalizeOptional(body.destination_city || body.destinationCity),
    duration: normalizeOptional(body.duration),
    active: body.active === undefined ? true : Boolean(body.active),
    metadata: {
      ...(body.metadata || {}),
      ai_aliases: normalizeTags(body.aliases || body.ai_aliases || body.aiAliases),
      languages: normalizeTags(body.languages),
      provider_email: normalizeOptional(body.provider_email || body.providerEmail),
      internal_notes: normalizeOptional(body.internal_notes || body.internalNotes),
      provider_marketplace_managed: true
    },
    updated_at: new Date().toISOString()
  };
};

const mergeProviderPayload = (provider, body = {}) => {
  const payload = providerPayload({
    ...provider,
    ...body,
    name: body.name || provider.name
  });

  return {
    ...payload,
    metadata: {
      ...(provider.metadata || {}),
      ...(payload.metadata || {})
    }
  };
};

const mergeExperiencePayload = (experience, body = {}) => {
  const payload = experiencePayload({
    ...experience,
    ...body,
    provider_id: body.provider_id || body.providerId || experience.provider_id,
    title: body.title || experience.title,
    aliases: body.aliases || body.ai_aliases || body.aiAliases || experience.metadata?.ai_aliases || [],
    languages: body.languages || experience.metadata?.languages || [],
    provider_email: body.provider_email || body.providerEmail || experience.metadata?.provider_email || null,
    internal_notes: body.internal_notes || body.internalNotes || experience.metadata?.internal_notes || null
  });

  return {
    ...payload,
    metadata: {
      ...(experience.metadata || {}),
      ...(payload.metadata || {})
    }
  };
};

const assignmentPayload = (body = {}) => {
  const hotelId = normalizeOptional(body.hotel_id || body.hotelId);
  const providerId = normalizeOptional(body.provider_id || body.providerId);

  if (!hotelId || !providerId) {
    throw new Error('Hotel and provider are required');
  }

  return {
    hotel_id: hotelId,
    provider_id: providerId,
    priority: Number(body.priority || 0),
    active: body.active === undefined ? true : Boolean(body.active),
    lead_email: normalizeOptional(body.lead_email || body.leadEmail),
    notes: normalizeOptional(body.notes),
    updated_at: new Date().toISOString()
  };
};

const buildProviderMarketplace = async (supabase) => {
  const [
    providers,
    experiences,
    assignments,
    hotels,
    bookings
  ] = await Promise.all([
    safeRows(supabase.from('experience_providers').select('*').order('name', { ascending: true }), 'experience_providers'),
    safeRows(supabase.from('provider_experiences').select('*').order('updated_at', { ascending: false }), 'provider_experiences'),
    safeRows(supabase.from('hotel_experience_providers').select('*').order('updated_at', { ascending: false }), 'hotel_experience_providers'),
    safeRows(supabase.from('hotels').select('*').order('name', { ascending: true }), 'hotels'),
    safeRows(supabase.from('experience_booking_requests').select('*').order('created_at', { ascending: false }), 'experience_booking_requests')
  ]);

  const providerBookings = bookings.filter((booking) => booking.provider_id || booking.partner_id || booking.metadata?.provider_id);

  const activeHotels = hotels.filter((hotel) => !hotel.deleted_at && !hotel.archived_at);
  const hotelsById = activeHotels.reduce((acc, hotel) => ({ ...acc, [hotel.id]: hotel }), {});
  const visibleExperiences = experiences.filter((experience) => !experience.metadata?.deleted_at);
  const experiencesByProvider = visibleExperiences.reduce((acc, experience) => {
    acc[experience.provider_id] = acc[experience.provider_id] || [];
    acc[experience.provider_id].push(experience);
    return acc;
  }, {});
  const assignmentsByProvider = assignments.reduce((acc, assignment) => {
    acc[assignment.provider_id] = acc[assignment.provider_id] || [];
    acc[assignment.provider_id].push({
      ...assignment,
      hotel: hotelsById[assignment.hotel_id] || null
    });
    return acc;
  }, {});
  const bookingsByProvider = providerBookings.reduce((acc, booking) => {
    const providerId = booking.provider_id || booking.partner_id || booking.metadata?.provider_id;
    if (!providerId) return acc;
    acc[providerId] = acc[providerId] || [];
    acc[providerId].push(booking);
    return acc;
  }, {});

  const providerRows = providers.map((provider) => {
    const providerExperiences = experiencesByProvider[provider.id] || [];
    const providerAssignments = assignmentsByProvider[provider.id] || [];
    const providerBookings = bookingsByProvider[provider.id] || [];
    const grossRevenue = providerBookings.reduce((sum, row) => sum + Number(row.estimated_revenue || 0), 0);
    const staynexCommission = providerBookings.reduce((sum, row) => sum + Number(row.platform_commission_amount || row.metadata?.platform_commission_amount || row.commission_estimate || 0), 0);
    const providerPayout = providerBookings.reduce((sum, row) => sum + Number(row.provider_payout_amount || row.metadata?.provider_payout_amount || 0), 0);

    return {
      ...provider,
      phone: provider.metadata?.phone || null,
      logo_url: provider.metadata?.logo_url || null,
      categories: provider.metadata?.categories || [],
      languages: provider.metadata?.languages || [],
      notes: provider.metadata?.notes || null,
      experiences: providerExperiences,
      assignments: providerAssignments,
      metrics: {
        activeExperiences: providerExperiences.filter((item) => item.active !== false).length,
        assignedHotels: providerAssignments.filter((item) => item.active !== false).length,
        leads: providerBookings.length,
        bookings: providerBookings.filter((item) => ['confirmed', 'completed', 'provider_confirmed'].includes(item.status)).length,
        grossRevenue,
        staynexCommission,
        providerPayout,
        failedEmails: providerBookings.filter((item) => item.lead_status === 'failed' || item.metadata?.provider_email_status === 'failed').length
      }
    };
  });

  return {
    providers: providerRows,
    hotels: activeHotels,
    metrics: {
      totalProviders: providerRows.length,
      activeProviders: providerRows.filter((provider) => provider.active !== false).length,
      activeExperiences: visibleExperiences.filter((experience) => experience.active !== false).length,
      assignedHotels: new Set(assignments.filter((assignment) => assignment.active !== false).map((assignment) => assignment.hotel_id)).size,
      totalLeads: providerBookings.length,
      grossRevenue: providerBookings.reduce((sum, row) => sum + Number(row.estimated_revenue || 0), 0),
      staynexCommission: providerBookings.reduce((sum, row) => sum + Number(row.platform_commission_amount || row.metadata?.platform_commission_amount || row.commission_estimate || 0), 0)
    },
    sqlReady: true
  };
};

export async function GET(request) {
  try {
    const { supabase } = await getPlatformContext(request);
    const marketplace = await buildProviderMarketplace(supabase);

    return NextResponse.json(marketplace, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    if (isProviderTableMissing(error)) {
      return NextResponse.json({
        providers: [],
        hotels: [],
        metrics: {},
        sqlReady: false,
        warning: 'Provider marketplace SQL migration required.'
      }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return NextResponse.json({
      providers: [],
      hotels: [],
      metrics: {},
      error: error.message || 'Could not load provider marketplace'
    }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const action = body.action || 'create_provider';
    const now = new Date().toISOString();

    if (action === 'create_provider') {
      const payload = providerPayload(body);
      const { data, error } = await supabase
        .from('experience_providers')
        .insert({
          ...payload,
          created_at: now
        })
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_created',
        metadata: { provider_id: data.id, provider_name: data.name }
      });

      return NextResponse.json({ ok: true, provider: data }, { status: 201 });
    }

    if (action === 'create_experience') {
      const payload = experiencePayload(body);
      const { data, error } = await supabase
        .from('provider_experiences')
        .insert({
          ...payload,
          created_at: now
        })
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_created',
        metadata: { provider_id: data.provider_id, provider_experience_id: data.id, title: data.title }
      });

      return NextResponse.json({ ok: true, experience: data }, { status: 201 });
    }

    if (action === 'duplicate_experience') {
      const sourceId = normalizeOptional(body.experience_id || body.experienceId || body.id);

      if (!sourceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const { data: source, error: sourceError } = await supabase
        .from('provider_experiences')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError) throw sourceError;

      const title = normalizeOptional(body.title) || `${source.title} copy`;
      const { data, error } = await supabase
        .from('provider_experiences')
        .insert({
          provider_id: source.provider_id,
          title,
          slug: `${slugify(title)}-${Date.now().toString(36)}`,
          category: source.category,
          description: source.description,
          short_description: source.short_description,
          price: source.price,
          commission_percent: source.commission_percent,
          currency: source.currency,
          tags: source.tags || [],
          audience_tags: source.audience_tags || [],
          destination_city: source.destination_city,
          duration: source.duration,
          active: false,
          metadata: {
            ...(source.metadata || {}),
            duplicated_from: source.id,
            provider_marketplace_managed: true
          },
          created_at: now,
          updated_at: now
        })
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_duplicated',
        metadata: { source_experience_id: source.id, provider_experience_id: data.id, provider_id: data.provider_id }
      });

      return NextResponse.json({ ok: true, experience: data }, { status: 201 });
    }

    if (action === 'assign_provider') {
      const payload = assignmentPayload(body);
      const { data, error } = await supabase
        .from('hotel_experience_providers')
        .upsert({
          ...payload,
          created_at: now
        }, { onConflict: 'hotel_id,provider_id' })
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_assigned_to_hotel',
        hotelId: data.hotel_id,
        metadata: { provider_id: data.provider_id, assignment_id: data.id }
      });

      return NextResponse.json({ ok: true, assignment: data }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported provider marketplace action' }, { status: 400 });
  } catch (error) {
    if (isProviderTableMissing(error)) {
      return NextResponse.json({
        error: 'Provider marketplace SQL migration required.'
      }, { status: 409 });
    }

    return NextResponse.json({
      error: error.message || 'Could not update provider marketplace'
    }, { status: error.status || 500 });
  }
}

export async function PATCH(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const action = body.action || 'update_experience';
    const now = new Date().toISOString();

    if (action === 'update_provider') {
      const providerId = normalizeOptional(body.provider_id || body.providerId || body.id);
      if (!providerId) {
        return NextResponse.json({ error: 'Provider id is required' }, { status: 400 });
      }

      const { data: provider, error: lookupError } = await supabase
        .from('experience_providers')
        .select('*')
        .eq('id', providerId)
        .single();

      if (lookupError) throw lookupError;

      const payload = mergeProviderPayload(provider, body);
      const { data, error } = await supabase
        .from('experience_providers')
        .update(payload)
        .eq('id', providerId)
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_updated',
        metadata: { provider_id: data.id, provider_name: data.name }
      });

      return NextResponse.json({ ok: true, provider: data });
    }

    if (action === 'update_experience') {
      const experienceId = normalizeOptional(body.experience_id || body.experienceId || body.id);
      if (!experienceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const { data: experience, error: lookupError } = await supabase
        .from('provider_experiences')
        .select('*')
        .eq('id', experienceId)
        .single();

      if (lookupError) throw lookupError;

      const payload = mergeExperiencePayload(experience, body);
      const { data, error } = await supabase
        .from('provider_experiences')
        .update(payload)
        .eq('id', experienceId)
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_updated',
        metadata: { provider_id: data.provider_id, provider_experience_id: data.id, title: data.title }
      });

      return NextResponse.json({ ok: true, experience: data });
    }

    if (action === 'set_experience_active') {
      const experienceId = normalizeOptional(body.experience_id || body.experienceId || body.id);
      if (!experienceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const active = Boolean(body.active);
      const { data, error } = await supabase
        .from('provider_experiences')
        .update({
          active,
          updated_at: now
        })
        .eq('id', experienceId)
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: active ? 'provider_experience_activated' : 'provider_experience_deactivated',
        metadata: { provider_id: data.provider_id, provider_experience_id: data.id, title: data.title }
      });

      return NextResponse.json({ ok: true, experience: data });
    }

    if (action === 'unassign_provider') {
      const assignmentId = normalizeOptional(body.assignment_id || body.assignmentId || body.id);
      if (!assignmentId) {
        return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('hotel_experience_providers')
        .update({
          active: false,
          updated_at: now
        })
        .eq('id', assignmentId)
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_unassigned_from_hotel',
        hotelId: data.hotel_id,
        metadata: { provider_id: data.provider_id, assignment_id: data.id }
      });

      return NextResponse.json({ ok: true, assignment: data });
    }

    return NextResponse.json({ error: 'Unsupported provider marketplace action' }, { status: 400 });
  } catch (error) {
    if (isProviderTableMissing(error)) {
      return NextResponse.json({
        error: 'Provider marketplace SQL migration required.'
      }, { status: 409 });
    }

    return NextResponse.json({
      error: error.message || 'Could not update provider marketplace'
    }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const type = body.type || 'experience';
    const now = new Date().toISOString();

    if (type === 'experience') {
      const experienceId = normalizeOptional(body.experience_id || body.experienceId || body.id);
      if (!experienceId) {
        return NextResponse.json({ error: 'Experience id is required' }, { status: 400 });
      }

      const { data: experience, error: lookupError } = await supabase
        .from('provider_experiences')
        .select('*')
        .eq('id', experienceId)
        .single();

      if (lookupError) throw lookupError;

      const { data, error } = await supabase
        .from('provider_experiences')
        .update({
          active: false,
          metadata: {
            ...(experience.metadata || {}),
            deleted_at: now,
            soft_deleted: true,
            deleted_reason: normalizeOptional(body.reason) || 'platform_provider_management'
          },
          updated_at: now
        })
        .eq('id', experienceId)
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'provider_experience_soft_deleted',
        metadata: { provider_id: data.provider_id, provider_experience_id: data.id, title: data.title }
      });

      return NextResponse.json({ ok: true, experience: data, mode: 'soft_delete' });
    }

    if (type === 'assignment') {
      const assignmentId = normalizeOptional(body.assignment_id || body.assignmentId || body.id);
      if (!assignmentId) {
        return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('hotel_experience_providers')
        .update({
          active: false,
          updated_at: now
        })
        .eq('id', assignmentId)
        .select('*')
        .single();

      if (error) throw error;

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'experience_provider_unassigned_from_hotel',
        hotelId: data.hotel_id,
        metadata: { provider_id: data.provider_id, assignment_id: data.id, delete_method: 'soft_unassign' }
      });

      return NextResponse.json({ ok: true, assignment: data, mode: 'soft_unassign' });
    }

    return NextResponse.json({ error: 'Unsupported delete type' }, { status: 400 });
  } catch (error) {
    if (isProviderTableMissing(error)) {
      return NextResponse.json({
        error: 'Provider marketplace SQL migration required.'
      }, { status: 409 });
    }

    return NextResponse.json({
      error: error.message || 'Could not delete provider marketplace item'
    }, { status: error.status || 500 });
  }
}
