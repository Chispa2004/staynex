import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const slugify = (value) => String(value || 'hotel')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'hotel';

const normalizeOptional = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

export async function POST(request) {
  try {
    const context = await getCurrentHotelForRequest(request);
    const { supabase, user } = context;

    if (!context.canCreateWorkspaces || !user?.id || !user?.email) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const name = normalizeOptional(body.name);

    if (!name) {
      return NextResponse.json({ error: 'Hotel name is required' }, { status: 400 });
    }

    const suffix = Math.random().toString(36).slice(2, 7);
    const baseSlug = slugify(body.workspaceSlug || name);
    const slug = `${baseSlug}-${suffix}`;

    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .insert({
        name,
        brand_name: normalizeOptional(body.brandName) || name,
        slug,
        workspace_slug: slug,
        timezone: normalizeOptional(body.timezone) || 'Europe/Madrid',
        default_language: normalizeOptional(body.defaultLanguage) || 'es',
        brand_color: normalizeOptional(body.brandColor) || '#34d399',
        secondary_color: normalizeOptional(body.secondaryColor) || '#0f766e',
        subscription_plan: 'workspace_trial'
      })
      .select('*')
      .single();

    if (hotelError) {
      throw hotelError;
    }

    const { data: hotelUser, error: userError } = await supabase
      .from('hotel_users')
      .insert({
        hotel_id: hotel.id,
        user_id: user.id,
        email: user.email,
        role: 'owner',
        status: 'active',
        is_default: false,
        accepted_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (userError) {
      throw userError;
    }

    return NextResponse.json({
      ok: true,
      hotel,
      hotelUser,
      role: hotelUser.role
    });
  } catch (error) {
    console.error('Workspace creation failed', error);
    return NextResponse.json({
      error: error.message || 'Could not create workspace'
    }, { status: 500 });
  }
}
