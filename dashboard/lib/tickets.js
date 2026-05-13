import { getSupabaseAdmin } from './supabase';

export const getTickets = async () => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('tickets')
    .select('id, room_number, category, priority, status, created_at, completed_at, title, description, conversation_id')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const getTicketsByCategories = async (categories) => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('tickets')
    .select('id, room_number, category, priority, status, created_at, completed_at, title, description, conversation_id')
    .in('category', categories)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const getTicketDetail = async (ticketId) => {
  const supabase = getSupabaseAdmin();

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('id, room_number, category, priority, status, created_at, completed_at, title, description, conversation_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) {
    throw ticketError;
  }

  if (!ticket) {
    return null;
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('conversation_id', ticket.conversation_id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    throw messagesError;
  }

  return {
    ticket,
    messages: messages || []
  };
};

export const updateTicketStatus = async ({ ticketId, status }) => {
  const supabase = getSupabaseAdmin();
  const completedAt = status === 'completed' ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('tickets')
    .update({
      status,
      completed_at: completedAt
    })
    .eq('id', ticketId)
    .select('id, room_number, category, priority, status, created_at, completed_at, title, description, conversation_id')
    .single();

  if (error) {
    throw error;
  }

  return data;
};
