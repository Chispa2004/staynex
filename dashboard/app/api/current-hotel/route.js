import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const jsonError = (message, status = 500) => NextResponse.json({
  hotel: null,
  role: 'admin',
  permissions: [],
  availableHotels: [],
  platformRole: 'none',
  platformPermissions: [],
  multiPropertyAccess: false,
  canSwitchWorkspaces: false,
  canCreateWorkspaces: false,
  error: message
}, { status, ...jsonOptions });

export async function GET(request) {
  try {
    const {
      hotel,
      hotelUser,
      role,
      permissions,
      platformRole,
      platformPermissions,
      multiPropertyAccess,
      canSwitchWorkspaces,
      canCreateWorkspaces,
      availableHotels,
      fallback,
      user,
      accessDenied,
      accessDeniedReason
    } = await getCurrentHotelForRequest(request);

    return NextResponse.json({
      hotel,
      hotelUser,
      role,
      permissions,
      platformRole: platformRole || 'none',
      platformPermissions: platformPermissions || [],
      multiPropertyAccess: Boolean(multiPropertyAccess),
      canSwitchWorkspaces: Boolean(canSwitchWorkspaces),
      canCreateWorkspaces: Boolean(canCreateWorkspaces),
      availableHotels,
      fallback,
      user,
      accessDenied: Boolean(accessDenied),
      accessDeniedReason: accessDeniedReason || null
    }, jsonOptions);
  } catch (error) {
    console.error('Current hotel API failed', error);
    return jsonError(error.message || 'Current hotel lookup failed');
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const hotelId = body.hotelId || null;
    const context = await getCurrentHotelForRequest(new Request(request.url, {
      headers: {
        authorization: request.headers.get('authorization') || '',
        'x-staynex-hotel-id': hotelId || ''
      }
    }));
    const allowed = context.availableHotels.some((item) => item.hotel?.id === hotelId);

    if (!hotelId || !allowed) {
      return jsonError('You do not have access to this hotel', 403);
    }

    const response = NextResponse.json({
      ok: true,
      hotel: context.hotel,
      hotelUser: context.hotelUser,
      role: context.role,
      permissions: context.permissions,
      platformRole: context.platformRole || 'none',
      platformPermissions: context.platformPermissions || [],
      multiPropertyAccess: Boolean(context.multiPropertyAccess),
      canSwitchWorkspaces: Boolean(context.canSwitchWorkspaces),
      canCreateWorkspaces: Boolean(context.canCreateWorkspaces),
      availableHotels: context.availableHotels,
      fallback: context.fallback
    }, jsonOptions);

    response.cookies.set('staynex_active_hotel_id', hotelId, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    });

    await writeEnterpriseAuditLog({
      supabase: context.supabase,
      request,
      actor: context.user,
      actorRole: context.role,
      actorPlatformRole: context.platformRole,
      hotelId,
      action: 'workspace_switch',
      entityType: 'hotel',
      entityId: hotelId,
      newValues: context.hotel || {},
      metadata: {
        source: 'current_hotel_api',
        can_switch_workspaces: Boolean(context.canSwitchWorkspaces)
      }
    });

    return response;
  } catch (error) {
    console.error('Current hotel switch failed', error);
    return jsonError(error.message || 'Could not switch hotel');
  }
}
