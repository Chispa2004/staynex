import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  getUserHotelAssignments,
  resolvePendingInvitationsForUser
} from '@/lib/user-invitations';
import { getFirstAllowedRoute, getPermissionsForRole } from '@/lib/permissions';

const getBearerToken = (request) => {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

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
    const selected = assignments.find((assignment) => assignment.is_default) || assignments[0] || null;
    const role = selected?.role || 'owner';

    return NextResponse.json({
      ok: true,
      resolvedInvitations: resolution.resolved,
      resolvedCount: resolution.count,
      assignments,
      hotel: selected?.hotel || null,
      role,
      permissions: getPermissionsForRole(role),
      defaultRoute: getFirstAllowedRoute(role)
    });
  } catch (error) {
    console.error('Invitation resolution failed', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not resolve invitations'
    }, { status: 500 });
  }
}
