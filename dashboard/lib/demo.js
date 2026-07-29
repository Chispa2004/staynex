import { getSupabaseAdmin } from './supabase';
import { getPlatformContext } from './platform';

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
const INTERNAL_PLATFORM_ROLES = ['platform_admin', 'super_admin', 'internal_only'];

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

const getBearerToken = (request) => {
  const header = request?.headers?.get('authorization') || '';
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
};

const createRouteError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const getExplicitDemoStatsHotelId = (request) => {
  try {
    const url = request?.url ? new URL(request.url) : null;
    return url?.searchParams.get('hotelId') || url?.searchParams.get('hotel') || null;
  } catch {
    return null;
  }
};

export const getExplicitDemoCleanHotelId = (body = {}) => body?.hotelId || body?.hotel_id || null;

export const hasExplicitHotelTarget = (request) => {
  const headerHotelId = request?.headers?.get('x-staynex-hotel-id');
  const queryHotelId = getExplicitDemoStatsHotelId(request);

  return Boolean(headerHotelId || queryHotelId);
};

export const assertDemoHotelContext = ({
  hotel,
  fallback,
  platformRole,
  request,
  body = null
} = {}) => {
  if (!hotel?.id || fallback) {
    throw createRouteError('Explicit hotel workspace is required for demo operations', 400);
  }

  if (INTERNAL_PLATFORM_ROLES.includes(platformRole) && !hasExplicitHotelTarget(request, body)) {
    throw createRouteError('Explicit hotelId is required for platform demo operations', 400);
  }

  return hotel.id;
};

export const getDemoPlatformAdminContext = async (request) => {
  if (!getBearerToken(request)) {
    throw createRouteError('Platform admin authorization required', 401);
  }

  return getPlatformContext(request, { requireAdmin: true });
};

export const getValidatedDemoHotel = async (supabase, hotelId) => {
  if (!hotelId) {
    throw createRouteError('hotelId is required', 400);
  }

  const { data: hotel, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('id', hotelId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!hotel?.id) {
    throw createRouteError('Hotel not found', 404);
  }

  return hotel;
};

export const getDemoStats = async ({ supabase = getSupabaseAdmin(), hotelId } = {}) => {
  await getValidatedDemoHotel(supabase, hotelId);
  const today = startOfTodayIso();
  const scope = (query) => query.eq('hotel_id', hotelId);

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
    hotelId,
    openTickets: openTickets.count || 0,
    urgentTickets: urgentTickets.count || 0,
    activeConversations: activeConversations.count || 0,
    completedToday: completedToday.count || 0
  };
};

export const cleanDemoData = async ({ supabase = getSupabaseAdmin(), hotelId } = {}) => {
  await getValidatedDemoHotel(supabase, hotelId);

  const guestsQuery = supabase
    .from('guests')
    .select('id')
    .eq('hotel_id', hotelId)
    .in('phone_number', DEMO_PHONES);

  const { data: guests, error: guestsError } = await guestsQuery;

  if (guestsError) {
    throw guestsError;
  }

  const guestIds = (guests || []).map((guest) => guest.id);

  if (guestIds.length === 0) {
    return { deletedGuests: 0, hotelId };
  }

  const { error } = await supabase
    .from('guests')
    .delete()
    .eq('hotel_id', hotelId)
    .in('id', guestIds);

  if (error) {
    throw error;
  }

  return { deletedGuests: guestIds.length, hotelId };
};
