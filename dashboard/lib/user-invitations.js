export const normalizeAuthEmail = email => String(email || '').trim().toLowerCase();
// Login and GET context never grant access. Explicit token acceptance is required.
export const resolvePendingInvitationsForUser = async () => ({resolved:[],count:0});
export const attachUserToHotelInvitation = async () => { throw new Error('Explicit invitation acceptance required'); };

export const getUserHotelAssignments = async ({
  supabase,
  userId,
  email,
  statuses = ['active'],
  includeHotels = true
}) => {
  if (!userId) return [];
  let query = supabase
    .from('hotel_users')
    .select(includeHotels ? '*, hotel:hotels(*)' : '*')
    .eq('user_id', userId)
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
