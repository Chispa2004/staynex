import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
import { isGuestMemoryEnabled } from '../../../../shared/guest-memory/feature-flag.js';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const SESSION_ACCESS_DENIED_REASONS = new Set(['missing_session', 'invalid_session']);

const getAccessDeniedStatus = (reason) => (
  SESSION_ACCESS_DENIED_REASONS.has(reason) ? 401 : reason === 'workspace_required' ? 200 : 403
);

const jsonError = (message, status = 503, reason = 'workspace_context_unavailable') => NextResponse.json({
  hotel: null,
  role: 'blocked',
  permissions: [],
  availableHotels: [],
  platformRole: 'none',
  platformPermissions: [],
  guestMemoryEnabled: false,
  multiPropertyAccess: false,
  canSwitchWorkspaces: false,
  canCreateWorkspaces: false,
  fallback: false,
  accessDenied: false,
  accessDeniedReason: reason,
  error: message,
  retryable: status >= 500
}, { status, ...jsonOptions });

export async function GET(request) {
  try {
    const {
      supabase,
      hotel,
      organization,
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

    if (hotel && platformRole && platformRole !== 'none') {
      await writeEnterpriseAuditLog({ supabase, request, actor: user, actorRole: role,
        actorPlatformRole: platformRole, hotelId: hotel.id, action: 'workspace_opened',
        entityType: 'hotel', entityId: hotel.id, required: true,
        metadata: { organization_id: organization?.id || null, source: 'current_hotel_api' } });
    }

    return NextResponse.json({
      hotel,
      organization,
      hotelUser,
      role,
      permissions,
      platformRole: platformRole || 'none',
      platformPermissions: platformPermissions || [],
      guestMemoryEnabled: isGuestMemoryEnabled(),
      multiPropertyAccess: Boolean(multiPropertyAccess),
      canSwitchWorkspaces: Boolean(canSwitchWorkspaces),
      canCreateWorkspaces: Boolean(canCreateWorkspaces),
      availableHotels,
      fallback,
      user,
      accessDenied: Boolean(accessDenied),
      accessDeniedReason: accessDeniedReason || null
    }, {
      status: accessDenied ? getAccessDeniedStatus(accessDeniedReason) : 200,
      ...jsonOptions
    });
  } catch (error) {
    console.error('Current hotel API failed', error);
    return jsonError('Workspace context temporarily unavailable');
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
      return jsonError(
        'You do not have access to this hotel',
        context.accessDenied && SESSION_ACCESS_DENIED_REASONS.has(context.accessDeniedReason) ? 401 : 403,
        context.accessDeniedReason || 'hotel_not_authorized'
      );
    }

    const response = NextResponse.json({
      ok: true,
      hotel: context.hotel,
      organization: context.organization || null,
      hotelUser: context.hotelUser,
      role: context.role,
      permissions: context.permissions,
      platformRole: context.platformRole || 'none',
      platformPermissions: context.platformPermissions || [],
      guestMemoryEnabled: isGuestMemoryEnabled(),
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
      required: context.platformRole !== 'none',
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
    return jsonError('Workspace context temporarily unavailable');
  }
}
