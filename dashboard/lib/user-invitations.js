import { selectEffectiveAssignments } from '../../shared/access/organization-scope.js';
export const normalizeAuthEmail = (email) => String(email || '').trim().toLowerCase();

export const attachUserToHotelInvitation = async ({ supabase, invitationId, userId }) => {
  if (!invitationId || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('hotel_users')
    .update({
      user_id: userId,
      status: 'active',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', invitationId)
    .eq('status', 'invited')
    .is('user_id', null)
    .select('*, hotel:hotels(*)')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

export const resolvePendingInvitationsForUser = async ({ supabase, user }) => {
  const userId = user?.id || null;
  const email = normalizeAuthEmail(user?.email);

  if (!userId || !email || (!user.email_confirmed_at && !user.confirmed_at)) {
    return {
      resolved: [],
      count: 0
    };
  }

  const { error: organizationError } = await supabase.rpc('staynex_accept_organization_invitations', { p_user: userId, p_email: email });
  if (organizationError) throw organizationError;

  const { data: invitations, error } = await supabase
    .from('hotel_users')
    .select('id')
    .eq('email', email)
    .eq('status', 'invited')
    .is('user_id', null);

  if (error) {
    throw error;
  }

  if (!invitations?.length) {
    return {
      resolved: [],
      count: 0
    };
  }

  const resolved = [];

  for (const invitation of invitations) {
    const row = await attachUserToHotelInvitation({
      supabase,
      invitationId: invitation.id,
      userId
    });

    if (row) {
      resolved.push(row);
    }
  }

  return {
    resolved,
    count: resolved.length
  };
};

export const getUserHotelAssignments = async ({
  supabase,
  userId,
  email,
  statuses = ['active'],
  includeHotels = true,
  authorize = true
}) => {
  if (!userId) return [];
  const data = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('hotel_users').select(includeHotels ? '*, hotel:hotels(*)' : '*')
      .eq('user_id', userId).order('is_default', { ascending: false }).order('created_at').order('id');
    if (Array.isArray(statuses) && statuses.length) query = query.in('status', statuses);
    const result = await query.range(offset, offset + 499);
    if (result.error) throw result.error;
    data.push(...(result.data || []));
    if ((result.data || []).length < 500) break;
  }

  const boundRows = (data || []).filter(row => row.user_id === userId);
  if (!includeHotels || !authorize) return boundRows;
  const ids = [...new Set(boundRows.map(row => row.hotel?.organization_id).filter(Boolean))];
  let memberships = [];
  if (ids.length) {
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from('organization_users')
        .select('id,organization_id,user_id,role,status,organization:organizations(id,name,kind,status)')
        .eq('user_id', userId).order('id').range(offset, offset + 499);
      if (result.error) throw result.error;
      memberships.push(...(result.data || []));
      if ((result.data || []).length < 500) break;
    }
  }
  const effective = selectEffectiveAssignments(boundRows, memberships, userId);
  return [
    ...boundRows.filter(row => row.status === 'active' && row.platform_role && row.platform_role !== 'none'),
    ...effective.map(row => ({ ...row, organization: memberships.find(m => m.organization_id === row.hotel.organization_id)?.organization || null }))
  ];
};
