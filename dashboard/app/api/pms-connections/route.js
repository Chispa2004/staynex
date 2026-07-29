import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
import { PMS_PROVIDERS, assertPmsHotelContext, getProviderWebhookUrl, redactConnection, saveConnection } from '@/lib/pms-connections';
import { canAccess } from '@/lib/permissions';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const jsonError = (message, status = 500, extra = {}) => NextResponse.json({
  ok: false,
  error: message,
  ...extra
}, { status, ...jsonOptions });

export async function GET(request) {
  try {
    const { supabase, hotel, role, platformRole, fallback } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections')) {
      return jsonError('Access denied', 403);
    }
    const hotelId = assertPmsHotelContext({ hotel, fallback });
    const canManage = canAccess(role, 'pms_connections_manage') && platformRole !== 'support';
    const { data, error } = await supabase
      .from('hotel_pms_connections')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId,
      role,
      platformRole: platformRole || 'none',
      canManage,
      providers: PMS_PROVIDERS.map((provider) => ({
        ...provider,
        webhookUrl: getProviderWebhookUrl(provider.key)
      })),
      connections: (data || []).map((connection) => ({
        ...redactConnection(connection),
        webhook_url: connection.webhook_url || getProviderWebhookUrl(connection.provider)
      }))
    }, jsonOptions);
  } catch (error) {
    return jsonError(error.message || 'Could not load PMS connections', error.status || 500);
  }
}

export async function POST(request) {
  try {
    const { supabase, hotel, role, platformRole, user, fallback } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections_manage')) {
      return jsonError('Access denied', 403);
    }
    if (platformRole === 'support') {
      return jsonError('Support sessions are read-only by default', 403);
    }
    const hotelId = assertPmsHotelContext({ hotel, fallback });
    const payload = await request.json();
    const connection = await saveConnection({
      supabase,
      hotelId,
      payload
    });

    await writeEnterpriseAuditLog({
      supabase,
      request,
      actor: user,
      actorRole: role,
      actorPlatformRole: platformRole,
      hotelId,
      action: 'pms_settings_changed',
      entityType: 'hotel_pms_connection',
      entityId: connection.id,
      newValues: connection,
      metadata: { provider: connection.provider, source: 'dashboard_pms_connections' }
    });

    return NextResponse.json({
      ok: true,
      hotelId,
      connection
    }, jsonOptions);
  } catch (error) {
    const missingEncryptionKey = error.message?.includes('PMS_SECRET_ENCRYPTION_KEY');

    return jsonError(
      error.message || 'Could not save PMS connection',
      missingEncryptionKey ? 400 : error.status || 500,
      missingEncryptionKey ? { missing_env: ['PMS_SECRET_ENCRYPTION_KEY'] } : {}
    );
  }
}

export async function DELETE(request) {
  try {
    const { supabase, hotel, role, platformRole, user, fallback } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections_manage')) {
      return jsonError('Access denied', 403);
    }
    if (platformRole === 'support') {
      return jsonError('Support sessions are read-only by default', 403);
    }
    const hotelId = assertPmsHotelContext({ hotel, fallback });
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('id');

    if (!connectionId) {
      return jsonError('Connection id is required', 400);
    }

    const { data: existing } = await supabase
      .from('hotel_pms_connections')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('id', connectionId)
      .maybeSingle();

    const { error } = await supabase
      .from('hotel_pms_connections')
      .delete()
      .eq('hotel_id', hotelId)
      .eq('id', connectionId);

    if (error) {
      throw error;
    }

    await writeEnterpriseAuditLog({
      supabase,
      request,
      actor: user,
      actorRole: role,
      actorPlatformRole: platformRole,
      hotelId,
      action: 'pms_settings_changed',
      entityType: 'hotel_pms_connection',
      entityId: connectionId,
      oldValues: existing ? redactConnection(existing) : {},
      metadata: { source: 'dashboard_pms_connections', operation: 'delete' }
    });

    return NextResponse.json({ ok: true, hotelId }, jsonOptions);
  } catch (error) {
    return jsonError(error.message || 'Could not delete PMS connection', error.status || 500);
  }
}
