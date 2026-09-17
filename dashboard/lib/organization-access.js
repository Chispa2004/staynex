import { getSupabaseAdmin } from './supabase';
import { getUserHotelAssignments, resolvePendingInvitationsForUser } from './user-invitations';
import { getInternalRole, selectEffectiveAssignments, assignmentAuthorized } from '../../shared/access/organization-scope.js';

export const accessError = (message, status = 403) => Object.assign(new Error(message), { status });
export const readAllPages = async makeQuery => {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
};
const readInChunks = async (makeQuery, column, ids) => {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    rows.push(...await readAllPages(() => makeQuery().in(column, ids.slice(offset, offset + 100))));
  }
  return rows;
};
export const getOrganizationPrincipal = async request => {
  const supabase = getSupabaseAdmin();
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw accessError('Missing session', 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw accessError('Invalid session', 401);
  const user = data.user;
  await resolvePendingInvitationsForUser({ supabase, user });
  const assignments = await getUserHotelAssignments({ supabase, userId: user.id, email: user.email, statuses: ['active'], authorize: false });
  const memberships = await readAllPages(() => supabase.from('organization_users')
    .select('id,organization_id,user_id,email,role,status,organization:organizations(id,name,kind,status)')
    .eq('user_id', user.id).order('id'));
  return { supabase, user: { id: user.id, email: user.email }, memberships, assignments,
    platformRole: getInternalRole(assignments, user.id),
    effectiveAssignments: selectEffectiveAssignments(assignments, memberships, user.id) };
};
export const requireOrganization = (principal, id) => {
  if (principal.platformRole !== 'none' && principal.platformRole !== 'support') return;
  if (!principal.memberships.some(m => m.organization_id === id && m.status === 'active' && m.organization?.status === 'active')) {
    throw accessError('Organization not authorized');
  }
};
export const loadOrganizationDirectory = async (principal, organizationId = null) => {
  const { supabase, effectiveAssignments, memberships, platformRole } = principal;
  const internal = ['super_admin', 'platform_admin', 'internal_only'].includes(platformRole);
  if (organizationId) requireOrganization(principal, organizationId);
  const organizations = internal
    ? await readAllPages(() => supabase.from('organizations').select('id,name,kind,status').order('id'))
    : memberships.filter(m => m.status === 'active' && m.organization?.status === 'active').map(m => m.organization);
  if (!internal && !organizationId && organizations.length > 1) return { organizations, hotels: [], metrics: null, requiresOrganizationSelection: true };
  const selectedId = organizationId || (!internal ? organizations[0]?.id : null);
  const authorizedIds = effectiveAssignments.filter(a => !selectedId || a.hotel.organization_id === selectedId).map(a => a.hotel_id);
  const chainAdmin = memberships.some(m => m.organization_id === selectedId && m.role === 'org_admin' && m.status === 'active' && m.organization?.status === 'active');
  const hotelQuery = () => {
    let query = supabase.from('hotels').select('id,name,slug,organization_id,city,country_code,timezone,metadata').order('id');
    if (selectedId) query = query.eq('organization_id', selectedId);
    return query;
  };
  const hotels = internal || chainAdmin ? await readAllPages(hotelQuery) : await readInChunks(hotelQuery, 'id', authorizedIds);
  const visible = hotels.filter(h => !h.metadata?.archived && !h.metadata?.archived_at && !String(h.name || '').endsWith(' (archived)'));
  const ids = visible.filter(h => internal || authorizedIds.includes(h.id)).map(h => h.id);
  // Each query is restricted before paging/aggregation. No global payload is loaded.
  const scoped = (table, fields) => readInChunks(() => supabase.from(table).select(fields).order('id'), 'hotel_id', ids);
  const [users, tickets] = await Promise.all([
    scoped('hotel_users', 'id,hotel_id,user_id,role,status,platform_role,organization_user_id,organization_grant_revoked'), scoped('tickets', 'id,hotel_id,status,priority')
  ]);
  const orgIds = [...new Set(visible.map(h => h.organization_id).filter(Boolean))];
  const scopedMemberships = orgIds.length ? await readInChunks(() => supabase.from('organization_users')
    .select('id,organization_id,user_id,role,status,organization:organizations(id,status)').order('id'), 'organization_id', orgIds) : [];
  const activeUsers = users.filter(u => assignmentAuthorized({ ...u, hotel: visible.find(h => h.id === u.hotel_id) }, scopedMemberships, u.user_id));
  const open = tickets.filter(t => ['open','in_progress'].includes(t.status));
  return { organizations, selectedOrganizationId: selectedId || null, requiresOrganizationSelection: false,
    hotels: visible.map(({ metadata, ...h }) => ({ ...h,
      organizationName: organizations.find(o => o.id === h.organization_id)?.name || 'Pendiente de incorporación',
      canEnter: internal || authorizedIds.includes(h.id),
      role: internal ? 'admin' : effectiveAssignments.find(a => a.hotel_id === h.id)?.role,
      openTickets: open.filter(t => t.hotel_id === h.id).length,
      urgentTickets: open.filter(t => t.hotel_id === h.id && t.priority === 'urgent').length
    })), metrics: { hotels: visible.length, people: new Set(activeUsers.map(u => u.user_id).filter(Boolean)).size,
      assignments: activeUsers.length, openTickets: open.length, urgentTickets: open.filter(t => t.priority === 'urgent').length } };
};
