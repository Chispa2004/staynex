import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { pmsConnectionSelectForSurface, serializePmsConnectionsSafe } from '../../../../shared/pms/safe-connection.js';
import { getPilotAiSafetyReadiness } from '../../../../shared/pilot/ai-safety.js';
import {loadDashboardMessages} from '@/lib/dashboard-messages';
import {isCheckinDemoHotel} from '../../../../shared/checkin-demo-view.js';

const readPmsSummary = async (supabase, hotelId) => {
  try {
    const { data, count, error } = await supabase.from('hotel_pms_connections')
      .select(pmsConnectionSelectForSurface('tenant_settings'), { count: 'exact' })
      .eq('hotel_id', hotelId).limit(50);
    if (error || !Array.isArray(data) || count !== data.length) return { available: false };
    const connections = serializePmsConnectionsSafe(data, { surface: 'tenant_settings' });
    const primary = connections.find(item => item.enabled) || connections[0];
    return { available: true, connected: connections.some(item => item.enabled), providerName: primary?.provider || null,
      lastSyncAt: primary?.last_sync_at || null, errors: connections.filter(item => item.last_sync_error).length };
  } catch { return { available: false }; }
};

export async function GET(request) {
  try {
    const { supabase, hotel, fallback, role, permissions = [] } = await getCurrentHotelForRequest(request, {readOnly:true,includeDirectory:false});
    if (!canAccess(role, 'dashboard')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const hotelId = hotel?.id || null;
    if (!hotelId) return NextResponse.json({ error: 'Hotel context required' }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const origin = params.get('attentionOrigin') || 'traced';
    const [pmsSnapshot, attentionSnapshot] = await Promise.all([
      readPmsSummary(supabase, hotelId),
      loadDashboardMessages({supabase,hotel,origin,urgentOnly:params.get('attentionUrgent') === 'true'})
    ]);
    // Serialize only the presentation DTO, never AI log bodies or provider errors.
    return NextResponse.json({
      hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug, timezone: hotel.timezone, city: hotel.city, country: hotel.country, country_code: hotel.country_code },
      role, permissions, fallback, demoView:isCheckinDemoHotel(hotel),
      pilotAiSafety: getPilotAiSafetyReadiness({ hotel, env: process.env }),
      refreshedAt: new Date().toISOString(),
      conversationDashboard: {messageWorkspace:attentionSnapshot},
      pmsSnapshot,
      onboardingHealth: { whatsappConfigured: Boolean(hotel.whatsapp_number) }
    });
  } catch {
    return NextResponse.json({ error: 'Dashboard unavailable' }, { status: 500 });
  }
}
