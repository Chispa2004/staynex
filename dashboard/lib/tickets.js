import { getSupabaseAdmin } from './supabase';
import { buildTicketCopilot } from './ai-copilot';

const TICKET_SELECT = 'id, hotel_id, room_number, category, priority, status, created_at, completed_at, title, description, conversation_id, guest_id, request_context, status_version';

const getRoomStatusesForTickets = async ({ supabase, tickets, hotelId }) => {
  const roomNumbers = [...new Set((tickets || []).map((ticket) => ticket.room_number).filter(Boolean))];

  if (!hotelId || !roomNumbers.length) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('room_status_snapshots')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('room_number', roomNumbers)
      .order('last_updated_at', { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    return (data || []).reduce((byRoom, status) => {
      if (!byRoom.has(status.room_number)) {
        byRoom.set(status.room_number, status);
      }

      return byRoom;
    }, new Map());
  } catch (error) {
    console.warn('Ticket PMS room status unavailable', error.message);
    return new Map();
  }
};

export const attachTicketCopilot = async ({ supabase, tickets, hotelId, allTickets = tickets }) => {
  const roomStatusByRoom = await getRoomStatusesForTickets({ supabase, tickets, hotelId });

  return tickets.map((ticket) => {
    const roomStatus = roomStatusByRoom.get(ticket.room_number) || null;
    const pmsIntelligenceContext = {
      roomStatus: roomStatus ? {
        roomNumber: roomStatus.room_number,
        roomType: roomStatus.room_type,
        housekeepingStatus: roomStatus.housekeeping_status,
        maintenanceStatus: roomStatus.maintenance_status,
        occupancyStatus: roomStatus.occupancy_status,
        lastUpdatedAt: roomStatus.last_updated_at
      } : null
    };

    return {
      ...ticket,
      roomStatus,
      pmsIntelligenceContext,
      copilot: buildTicketCopilot({ ...ticket, roomStatus, pmsIntelligenceContext }, allTickets)
    };
  });
};

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

  return attachTicketCopilot({ supabase, tickets: data || [], hotelId });
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

  return attachTicketCopilot({ supabase, tickets: data || [], hotelId });
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
    .select('id, conversation_id, hotel_id, sender_type, content, created_at')
    .eq('hotel_id', hotelId)
    .eq('conversation_id', ticket.conversation_id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    throw messagesError;
  }

  const [ticketWithCopilot] = await attachTicketCopilot({ supabase, tickets: [ticket], hotelId });

  return {
    ticket: ticketWithCopilot,
    messages: messages || []
  };
};

export const updateTicketStatus = async ({
  ticketId,
  status, expectedVersion, expectedStatus, operationId,
  supabase = getSupabaseAdmin(),
  hotelId = null,
  actor = null,
  role = null,
  platformRole = 'none',
  request = null
}) => {
  if (!hotelId) {
    throw new Error('hotelId is required');
  }

  const {data,error}=await supabase.rpc('staynex_ticket_transition_v1',{
    p_hotel:hotelId,p_ticket:ticketId,p_actor:actor?.id,p_operation:operationId,
    p_target:status,p_version:expectedVersion,p_status:expectedStatus
  });
  if(error)throw Object.assign(new Error(error.code==='40001'?'El ticket cambió. Actualiza antes de reintentar.':'No se ha confirmado el cambio del ticket.'),
    {status:error.code==='40001'?409:error.code==='42501'?403:['22023','22P02'].includes(error.code)?400:503});
  const [ticketWithCopilot] = await attachTicketCopilot({ supabase, tickets: [data], hotelId });
  return ticketWithCopilot || {
    ...data,
    copilot: buildTicketCopilot(data, [data])
  };
};
