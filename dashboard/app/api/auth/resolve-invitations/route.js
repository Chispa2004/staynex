import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  getUserHotelAssignments,
  resolvePendingInvitationsForUser
} from '@/lib/user-invitations';
import { getPermissionsForRole } from '@/lib/permissions';
import { resolvePostLoginDestination } from '@/lib/post-login-routing';

const ACTIVE_HOTEL_COOKIE = 'staynex_active_hotel_id';

const getBearerToken = (request) => {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

const getRequestedHotelId = (request) => (
  request.headers.get('x-staynex-hotel-id')
  || request.cookies.get(ACTIVE_HOTEL_COOKIE)?.value
  || null
);

export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();
    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: 'Missing session token' }, { status: 401 });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || 'Invalid session' }, { status: 401 });
    }

    const resolution = await resolvePendingInvitationsForUser({
      supabase,
      user: data.user
    });
    const assignments = await getUserHotelAssignments({
      supabase,
      userId: data.user.id,
      email: data.user.email,
      statuses: ['active']
    });
    const { data: memberships, error: membershipError } = await supabase.from('organization_users')
      .select('role,status,organization:organizations(status)').eq('user_id', data.user.id);
    if (membershipError) throw membershipError;
    const loginDestination = resolvePostLoginDestination({
      memberships: memberships || [],
      assignments,
      requestedHotelId: getRequestedHotelId(request)
    });
    if (loginDestination.accessDeniedReason === 'hotel_not_authorized') return NextResponse.json({ error: 'Hotel no autorizado', defaultRoute: '/my-hotels', accessDeniedReason: loginDestination.accessDeniedReason }, { status: 403 });
    const selected = loginDestination.selectedHotelId
      ? assignments.find((assignment) => assignment.hotel_id === loginDestination.selectedHotelId)
      : null;
    const role = selected?.role || 'blocked';

    return NextResponse.json({
      ok: true,
      resolvedInvitations: resolution.resolved,
      resolvedCount: resolution.count,
      assignments,
      hotel: selected?.hotel || null,
      hotelUser: selected || null,
      role,
      permissions: getPermissionsForRole(role),
      platformRole: loginDestination.platformRole || selected?.platform_role || 'none',
      defaultRoute: loginDestination.defaultRoute,
      selectedHotelId: loginDestination.selectedHotelId,
      routeReason: loginDestination.reason,
      accessDeniedReason: loginDestination.accessDeniedReason
    });
  } catch (error) {
    console.error('Invitation resolution failed', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not resolve invitations'
    }, { status: 500 });
  }
}
