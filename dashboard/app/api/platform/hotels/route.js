import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccessPlatform } from '@/lib/permissions';

export async function GET(request) {
  try {
    const { supabase, platformRole } = await getCurrentHotelForRequest(request);

    if (!canAccessPlatform(platformRole, 'platform_console')) {
      return NextResponse.json({ hotels: [], error: 'Access denied' }, { status: 403 });
    }

    const { data: hotels, error } = await supabase
      .from('hotels')
      .select('id, name, brand_name, slug, workspace_slug, logo_url, brand_color, timezone, subscription_plan, created_at')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ hotels: hotels || [] });
  } catch (error) {
    return NextResponse.json({
      hotels: [],
      error: error.message || 'Could not load platform hotels'
    }, { status: 500 });
  }
}
