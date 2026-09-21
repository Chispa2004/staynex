import { NextResponse } from 'next/server';
import {
  getPlatformContext,
  getPlatformOverview,
  normalizeOptional,
  slugify,
  writePlatformAuditLog
} from '@/lib/platform';
import {
  buildSafeLocationChangeAudit,
  confirmHotelTimezoneIntegrity,
  buildValidatedHotelCreationInput,
  buildValidatedHotelProfileUpdate
} from '../../../../../shared/location/hotel-location-integrity.js';

const validPlans = ['starter', 'professional', 'enterprise', 'enterprise_demo', 'pro_demo', 'workspace_trial'];

const normalizePlan = (value) => validPlans.includes(value) ? value : 'starter';

const buildHotelPayload = (body = {}) => {
  const name = normalizeOptional(body.name);

  if (!name) {
    throw new Error('Hotel name is required');
  }

  const baseSlug = slugify(body.slug || body.workspace_slug || name);

  return {
    name,
    brand_name: normalizeOptional(body.brand_name || body.brandName) || name,
    slug: baseSlug,
    workspace_slug: slugify(body.workspace_slug || body.workspaceSlug || baseSlug),
    default_language: normalizeOptional(body.default_language || body.defaultLanguage) || 'es',
    whatsapp_number: normalizeOptional(body.whatsapp_number || body.whatsappNumber),
    support_email: normalizeOptional(body.support_email || body.supportEmail),
    support_phone: normalizeOptional(body.support_phone || body.supportPhone),
    brand_color: normalizeOptional(body.brand_color || body.brandColor) || '#34d399',
    secondary_color: normalizeOptional(body.secondary_color || body.secondaryColor) || '#0f766e',
    logo_url: normalizeOptional(body.logo_url || body.logoUrl),
    favicon_url: normalizeOptional(body.favicon_url || body.faviconUrl),
    subscription_plan: normalizePlan(body.subscription_plan || body.subscriptionPlan),
    description: normalizeOptional(body.description) || 'Staynex hotel workspace.',
    updated_at: new Date().toISOString()
  };
};

const getUniqueSlug = async ({ supabase, slug, hotelId = null }) => {
  let candidate = slug;
  let index = 2;

  while (true) {
    let query = supabase
      .from('hotels')
      .select('id')
      .or(`slug.eq.${candidate},workspace_slug.eq.${candidate}`)
      .limit(1);

    if (hotelId) {
      query = query.neq('id', hotelId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (!data?.length) {
      return candidate;
    }

    candidate = `${slug}-${index}`;
    index += 1;
  }
};

export async function GET(request) {
  try {
    const { supabase, user, platformRole, platformPermissions } = await getPlatformContext(request);
    const overview = await getPlatformOverview(supabase);

    await writePlatformAuditLog({
      supabase,
      actor: user,
      platformRole,
      action: 'platform_dashboard_accessed',
      metadata: {
        hotels: overview.metrics?.totalHotels || 0
      }
    });

    return NextResponse.json({
      ...overview,
      platformRole,
      platformPermissions,
      user: user ? { id: user.id, email: user.email } : null
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      hotels: [],
      metrics: {},
      error: error.message || 'Could not load platform hotels'
    }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    if (!['super_admin', 'platform_admin'].includes(platformRole)) {
      return NextResponse.json({ error: 'Staynex administrator required' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.organization_id) return NextResponse.json({ error: 'Selecciona una organización cliente' }, { status: 400 });
    const adminEmail = normalizeOptional(body.admin_email || body.adminEmail)?.toLowerCase();
    if (!adminEmail || !adminEmail.includes('@')) return NextResponse.json({ error: 'A valid admin email is required' }, { status: 400 });
    const payload = buildHotelPayload(body);
    const locationPayload = buildValidatedHotelCreationInput(body);
    const slug = await getUniqueSlug({ supabase, slug: payload.slug });
    // One transaction includes membership/grants, onboarding and audit. No orphan hotel on failure.
    const { data, error } = await supabase.rpc('staynex_create_organization_hotel', {
      p_actor: user.id, p_organization: body.organization_id,
      p_payload: { ...payload, ...locationPayload, slug, admin_email: adminEmail }
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, ...data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not create hotel workspace'
    }, { status: error.status || 500 });
  }
}

export async function PATCH(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Hotel id is required' }, { status: 400 });
    }

    if (body.action === 'confirm_timezone_integrity') {
      const { hotel: confirmedHotel, confirmation } = await confirmHotelTimezoneIntegrity({
        supabase,
        hotelId: body.id,
        body
      });

      const audit = buildSafeLocationChangeAudit({
        previousValues: confirmation.previousValues,
        newValues: confirmation.newValues,
        changedFields: confirmation.changedFields
      });

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'hotel_timezone_integrity_confirmed',
        hotelId: confirmedHotel.id,
        entityType: 'hotel',
        oldValues: audit.previous_values,
        newValues: audit.new_values,
        metadata: {
          event_type: 'hotel_timezone_integrity_confirmed',
          ...audit
        }
      });

      return NextResponse.json({ hotel: confirmedHotel });
    }

    const { data: existingHotel, error: lookupError } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', body.id)
      .single();

    if (lookupError) {
      throw lookupError;
    }

    const payload = buildHotelPayload({
      ...existingHotel,
      ...body,
      name: body.name || existingHotel.name
    });
    const locationUpdate = buildValidatedHotelProfileUpdate({ body, existingHotel });
    const uniqueSlug = await getUniqueSlug({
      supabase,
      slug: payload.slug,
      hotelId: body.id
    });
    const { data: hotel, error } = await supabase
      .from('hotels')
      .update({
        ...payload,
        ...locationUpdate.updates,
        slug: uniqueSlug,
        workspace_slug: uniqueSlug
      })
      .eq('id', body.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    const locationAudit = buildSafeLocationChangeAudit({
      previousValues: locationUpdate.previousValues,
      newValues: locationUpdate.newValues,
      changedFields: [
        ...locationUpdate.changedLocationFields,
        ...(locationUpdate.changedLocationFields.length ? ['timezone_integrity_status'] : [])
      ]
    });

    await writePlatformAuditLog({
      supabase,
      actor: user,
      platformRole,
      action: 'hotel_branding_updated',
      hotelId: hotel.id,
      entityType: 'hotel',
      oldValues: locationAudit.previous_values,
      newValues: locationAudit.new_values,
      metadata: {
        subscription_plan: hotel.subscription_plan,
        workspace_slug: hotel.workspace_slug,
        event_type: locationAudit.changed_fields.length ? 'hotel_location_timezone_changed' : 'hotel_branding_updated',
        ...locationAudit
      }
    });

    return NextResponse.json({ hotel });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not update hotel'
    }, { status: error.status || 500 });
  }
}
