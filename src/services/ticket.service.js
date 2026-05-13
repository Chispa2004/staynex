import { createTicketRecord } from './supabase.service.js';

export const createTicketFromAiResponse = async ({
  aiResponse,
  hotel,
  guest,
  conversation
}) => {
  if (!aiResponse.create_ticket) {
    return null;
  }

  const category = aiResponse.emergency
    ? 'emergency'
    : aiResponse.ticket.category;

  const priority = aiResponse.emergency
    ? 'urgent'
    : aiResponse.ticket.priority;

  if (!category || !aiResponse.ticket.title || !aiResponse.ticket.description || !priority) {
    throw new Error('AI requested ticket creation but ticket fields are incomplete');
  }

  return createTicketRecord({
    hotelId: hotel.id,
    guestId: guest.id,
    conversationId: conversation.id,
    roomNumber: guest.current_room,
    category,
    title: aiResponse.ticket.title,
    description: aiResponse.ticket.description,
    priority
  });
};
