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

  if (!userId || !email) {
    return {
      resolved: [],
      count: 0
    };
  }

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
  includeHotels = true
}) => {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!userId && !normalizedEmail) {
    return [];
  }

  const filters = [];

  if (userId) {
    filters.push(`user_id.eq.${userId}`);
  }

  if (normalizedEmail) {
    filters.push(`email.eq.${normalizedEmail}`);
  }

  let query = supabase
    .from('hotel_users')
    .select(includeHotels ? '*, hotel:hotels(*)' : '*')
    .or(filters.join(','))
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (Array.isArray(statuses) && statuses.length > 0) {
    query = query.in('status', statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
};
