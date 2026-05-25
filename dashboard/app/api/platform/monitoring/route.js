import { NextResponse } from 'next/server';
import { getPlatformContext } from '@/lib/platform';
import { canAccessPlatform } from '@/lib/permissions';
import { getPlatformMonitoring } from '@/lib/system-health';

const noStore = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

export async function GET(request) {
  try {
    const { supabase, platformRole } = await getPlatformContext(request, { requireAdmin: true });

    if (!canAccessPlatform(platformRole, 'platform_monitoring')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const monitoring = await getPlatformMonitoring({ supabase });

    return NextResponse.json({
      ok: true,
      platformRole,
      monitoring
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Platform monitoring could not be loaded'
    }, { status: error.status || 500, ...noStore });
  }
}
