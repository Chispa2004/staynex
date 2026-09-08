import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { pmsConnectionSelectForSurface, serializePmsConnectionsSafe } from '../../../../shared/pms/safe-connection.js';
import { getPilotAiSafetyReadiness } from '../../../../shared/pilot/ai-safety.js';
import { buildConversationDashboard, loadConversationDashboardSources } from '@/lib/hotel-operations-workspace';
import { loadAttentionDashboard } from '@/lib/message-attention';

const readActiveCount = async (supabase, hotelId) => {
  try {
    const { count, error } = await supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('status', 'active');
    return !error && Number.isInteger(count) ? count : null;
  } catch { return null; }
};

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
    const { supabase, hotel, fallback, role, permissions = [] } = await getCurrentHotelForRequest(request);
    if (!canAccess(role, 'dashboard')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const hotelId = hotel?.id || null;
    if (!hotelId) return NextResponse.json({ error: 'Hotel context required' }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const origin = params.get('attentionOrigin') || 'traced';
    const cursor = params.get('attentionBefore') && params.get('attentionId') ? {at:params.get('attentionBefore'),id:params.get('attentionId')} : null;
    const [sources, activeConversationsCount, pmsSnapshot, attentionSnapshot] = await Promise.all([
      loadConversationDashboardSources(supabase, hotelId),
      readActiveCount(supabase, hotelId),
      readPmsSummary(supabase, hotelId),
      loadAttentionDashboard({supabase,hotelId,origin,urgentOnly:params.get('attentionUrgent') === 'true',cursor})
    ]);
    // Serialize only the presentation DTO, never AI log bodies or provider errors.
    return NextResponse.json({
      hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug, timezone: hotel.timezone, city: hotel.city, country: hotel.country, country_code: hotel.country_code },
      role, permissions, fallback,
      pilotAiSafety: getPilotAiSafetyReadiness({ hotel, env: process.env }),
      refreshedAt: new Date().toISOString(),
      conversationDashboard: buildConversationDashboard({ hotelId, timezone: hotel.timezone, sources, activeCount: activeConversationsCount, attentionSnapshot }),
      pmsSnapshot,
      onboardingHealth: { whatsappConfigured: Boolean(hotel.whatsapp_number) }
    });
  } catch {
    return NextResponse.json({ error: 'Dashboard unavailable' }, { status: 500 });
  }
}
