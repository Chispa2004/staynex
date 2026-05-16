import { getSupabaseAdmin } from './supabase';
import { getCurrentHotelForRequest } from './current-hotel';

export const DEMO_SCENARIOS = [
  {
    id: 'towels-208',
    title: 'Housekeeping',
    message: 'Necesito dos toallas en la habitación 208',
    phone: '+34900000208',
    category: 'housekeeping'
  },
  {
    id: 'ac-312',
    title: 'Maintenance',
    message: 'El aire acondicionado no funciona en la habitación 312',
    phone: '+34900000312',
    category: 'maintenance'
  },
  {
    id: 'wifi',
    title: 'Knowledge Base',
    message: '¿Cuál es la contraseña del wifi?',
    phone: '+34900000080',
    category: 'hotel_info'
  },
  {
    id: 'taxi-501',
    title: 'Reception',
    message: 'Necesito un taxi al aeropuerto habitación 501',
    phone: '+34900000501',
    category: 'transport'
  },
  {
    id: 'complaint',
    title: 'Complaint',
    message: 'Estoy muy enfadado, nadie me ayuda',
    phone: '+34900000901',
    category: 'complaint'
  },
  {
    id: 'smoke-109',
    title: 'Emergency',
    message: 'Hay humo en mi habitación 109',
    phone: '+34900000109',
    category: 'emergency'
  },
  {
    id: 'english-305',
    title: 'English Guest',
    message: 'Can you bring more towels to room 305?',
    phone: '+34900000305',
    category: 'housekeeping'
  }
];

export const DEMO_PHONES = DEMO_SCENARIOS.map((scenario) => scenario.phone);

export const getBackendUrl = () => (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3000'
);

const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const getDemoContext = async (request) => {
  const supabase = getSupabaseAdmin();
  const context = request
    ? await getCurrentHotelForRequest(request)
    : { hotel: null, role: null };

  return {
    supabase,
    hotel: context.hotel || null,
    role: context.role || null
  };
};

export const getDemoStats = async (request) => {
  const { supabase, hotel } = await getDemoContext(request);
  const today = startOfTodayIso();
  const scope = (query) => (hotel?.id ? query.eq('hotel_id', hotel.id) : query);

  const [
    openTickets,
    urgentTickets,
    activeConversations,
    completedToday
  ] = await Promise.all([
    scope(supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')),
    scope(supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('priority', 'urgent')
      .in('status', ['open', 'in_progress'])),
    scope(supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')),
    scope(supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', today))
  ]);

  const errors = [openTickets.error, urgentTickets.error, activeConversations.error, completedToday.error]
    .filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    hotelId: hotel?.id || null,
    openTickets: openTickets.count || 0,
    urgentTickets: urgentTickets.count || 0,
    activeConversations: activeConversations.count || 0,
    completedToday: completedToday.count || 0
  };
};

export const cleanDemoData = async (request) => {
  const { supabase, hotel } = await getDemoContext(request);

  let guestsQuery = supabase
    .from('guests')
    .select('id')
    .in('phone_number', DEMO_PHONES);

  if (hotel?.id) {
    guestsQuery = guestsQuery.eq('hotel_id', hotel.id);
  }

  const { data: guests, error: guestsError } = await guestsQuery;

  if (guestsError) {
    throw guestsError;
  }

  const guestIds = (guests || []).map((guest) => guest.id);

  if (guestIds.length === 0) {
    return { deletedGuests: 0, hotelId: hotel?.id || null };
  }

  const { error } = await supabase
    .from('guests')
    .delete()
    .in('id', guestIds);

  if (error) {
    throw error;
  }

  return { deletedGuests: guestIds.length, hotelId: hotel?.id || null };
};
