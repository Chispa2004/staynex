import { getSupabaseAdmin } from './supabase';

const TICKET_SELECT = 'id, hotel_id, room_number, category, priority, status, created_at, completed_at, title, description, conversation_id, guest_id';

export const getTickets = async ({ supabase = getSupabaseAdmin(), hotelId = null } = {}) => {
  if (!hotelId) {
    return [];
  }

  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const getTicketsByCategories = async (categories, { supabase = getSupabaseAdmin(), hotelId = null } = {}) => {
  if (!hotelId) {
    return [];
  }

  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('hotel_id', hotelId)
    .in('category', categories)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const getTicketDetail = async (ticketId, { supabase = getSupabaseAdmin(), hotelId = null } = {}) => {
  if (!hotelId) {
    return null;
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('id', ticketId)
    .eq('hotel_id', hotelId)
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

export const updateTicketStatus = async ({ ticketId, status, supabase = getSupabaseAdmin(), hotelId = null }) => {
  if (!hotelId) {
    throw new Error('hotelId is required');
  }

  const completedAt = status === 'completed' ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('tickets')
    .update({
      status,
      completed_at: completedAt
    })
    .eq('id', ticketId)
    .eq('hotel_id', hotelId)
    .select(TICKET_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
};
