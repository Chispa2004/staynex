import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const unique = (items) => [...new Set(items.filter(Boolean))];

const getAcceptedRevenue = (conversions = []) => conversions
  .filter((item) => item.status === 'accepted')
  .reduce((total, item) => total + Number(item.estimated_amount || 0), 0);

export const generateGuestTags = ({
  memories = [],
  reservations = [],
  tickets = [],
  upsells = [],
  conversions = [],
  messages = []
} = {}) => {
  const memoryKeys = new Set(memories.map((item) => item.memory_key));
  const text = normalize([
    ...memories.map((item) => `${item.memory_key} ${item.memory_value}`),
    ...messages.map((item) => item.content || ''),
    ...tickets.map((item) => `${item.title || ''} ${item.description || ''}`)
  ].join(' '));
  const tags = [];

  if (reservations.length > 1) tags.push('repeat_guest');
  if (getAcceptedRevenue(conversions) >= 150) tags.push('high_spender');
  if (reservations.length > 2 || getAcceptedRevenue(conversions) >= 250) tags.push('vip');
  if (memoryKeys.has('traveling_with_partner') || memoryKeys.has('anniversary_trip') || includesAny(text, ['pareja', 'romantic', 'romantico', 'anniversary'])) tags.push('romantic');
  if (includesAny(text, ['family', 'familia', 'children', 'ninos', 'kids'])) tags.push('family');
  if (memoryKeys.has('interested_late_checkout') || includesAny(text, ['late checkout', 'salir mas tarde'])) tags.push('late_checkout_interest');
  if (memoryKeys.has('interested_spa') || upsells.some((item) => item.upsell_type === 'spa')) tags.push('spa_interest');
  if (upsells.some((item) => ['room_upgrade', 'late_checkout'].includes(item.upsell_type))) tags.push('upgrade_ready');
  if (tickets.filter((item) => item.category === 'complaint' || item.priority === 'urgent').length >= 2) tags.push('complains_often');

  return unique(tags).map((tag) => ({
    tag,
    confidence: tag === 'vip' || tag === 'high_spender' ? 0.86 : 0.78,
    source: 'computed_profile'
  }));
};

export const detectOperationalRisk = ({ tickets = [], aiLogs = [], messages = [] } = {}) => {
  const text = normalize(messages.map((item) => item.content || '').join(' '));
  const urgentTickets = tickets.filter((item) => item.priority === 'urgent' || item.category === 'emergency').length;
  const complaints = tickets.filter((item) => item.category === 'complaint').length;
  const lowConfidence = aiLogs.filter((item) => Number(item.confidence_score || 1) < 0.65).length;
  const negative = includesAny(text, ['enfadado', 'angry', 'terrible', 'unacceptable', 'muy mal', 'queja', 'refund']);
  const score = Math.min(100, urgentTickets * 30 + complaints * 22 + lowConfidence * 10 + (negative ? 20 : 0));

  return {
    score,
    level: score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low',
    reasons: [
      urgentTickets > 0 ? `${urgentTickets} urgent operational signals` : null,
      complaints > 0 ? `${complaints} complaint tickets` : null,
      lowConfidence > 0 ? `${lowConfidence} low-confidence AI decisions` : null,
      negative ? 'Negative sentiment detected in messages' : null
    ].filter(Boolean)
  };
};

export const detectRevenueSignals = ({ memories = [], upsells = [], reservations = [], conversions = [] } = {}) => {
  const memoryKeys = new Set(memories.map((item) => item.memory_key));
  const acceptedRevenue = getAcceptedRevenue(conversions);
  const signals = [];

  if (upsells.some((item) => item.upsell_type === 'room_upgrade')) signals.push('room_upgrade');
  if (memoryKeys.has('interested_late_checkout') || upsells.some((item) => item.upsell_type === 'late_checkout')) signals.push('late_checkout');
  if (memoryKeys.has('interested_spa') || upsells.some((item) => item.upsell_type === 'spa')) signals.push('spa');
  if (memoryKeys.has('traveling_with_partner') || memoryKeys.has('anniversary_trip')) signals.push('romantic_package');
  if (reservations.some((item) => normalize(item.board_basis || '').includes('breakfast'))) signals.push('dinner');

  return {
    signals: unique(signals),
    acceptedRevenue,
    opportunityScore: Math.min(100, signals.length * 18 + Math.min(40, acceptedRevenue / 5))
  };
};

export const calculateGuestScore = ({ reservations = [], tickets = [], upsells = [], conversions = [], memories = [], aiLogs = [] } = {}) => {
  const revenue = getAcceptedRevenue(conversions);
  const risk = detectOperationalRisk({ tickets, aiLogs }).score;
  const positiveSignals = Math.min(30, reservations.length * 8 + memories.length * 2 + upsells.length * 3);
  const revenueBoost = Math.min(25, revenue / 10);
  const score = Math.round(Math.max(0, Math.min(100, 52 + positiveSignals + revenueBoost - risk * 0.35)));

  return score;
};

export const generateGuestInsights = ({ memories = [], reservations = [], tickets = [], upsells = [], conversions = [], messages = [], aiLogs = [] } = {}) => {
  const tags = generateGuestTags({ memories, reservations, tickets, upsells, conversions, messages }).map((item) => item.tag);
  const risk = detectOperationalRisk({ tickets, aiLogs, messages });
  const revenue = detectRevenueSignals({ memories, upsells, reservations, conversions });
  const insights = [];

  if (tags.includes('upgrade_ready')) {
    insights.push({
      type: 'revenue',
      title: 'Alta probabilidad de aceptar room upgrade',
      description: 'El historial muestra señales comerciales compatibles con una mejora de habitación.',
      priority: 'high'
    });
  }

  if (tags.includes('romantic')) {
    insights.push({
      type: 'experience',
      title: 'Viaje romántico detectado',
      description: 'Conviene ofrecer ayuda con cena especial, spa o detalles de bienvenida.',
      priority: 'normal'
    });
  }

  if (risk.level !== 'low') {
    insights.push({
      type: 'risk',
      title: risk.level === 'high' ? 'Riesgo de mala review' : 'Seguimiento operativo recomendado',
      description: risk.reasons.join(', ') || 'Hay señales que recomiendan atención humana.',
      priority: risk.level === 'high' ? 'urgent' : 'high'
    });
  }

  if (revenue.signals.includes('late_checkout')) {
    insights.push({
      type: 'revenue',
      title: 'Interés en late checkout',
      description: 'Recepción puede preparar disponibilidad y precio antes de que el huésped lo vuelva a pedir.',
      priority: 'normal'
    });
  }

  return insights;
};

export const generateGuestProfile = async ({ hotelId, guestId }) => {
  const supabase = getSupabase();

  try {
    const [
      guestResult,
      memoriesResult,
      reservationsResult,
      conversationsResult,
      ticketsResult,
      upsellsResult,
      conversionsResult,
      aiLogsResult
    ] = await Promise.all([
      supabase.from('guests').select('*').eq('hotel_id', hotelId).eq('id', guestId).maybeSingle(),
      supabase.from('guest_memory').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('updated_at', { ascending: false }),
      supabase.from('reservations').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('arrival_date', { ascending: false }),
      supabase.from('conversations').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('last_message_at', { ascending: false }),
      supabase.from('tickets').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('created_at', { ascending: false }),
      supabase.from('ai_upsells').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('created_at', { ascending: false }),
      supabase.from('upsell_conversions').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('updated_at', { ascending: false }),
      supabase.from('ai_logs').select('*').eq('hotel_id', hotelId).eq('guest_id', guestId).order('created_at', { ascending: false }).limit(100)
    ]);

    if (guestResult.error) throw guestResult.error;

    const memories = memoriesResult.data || [];
    const reservations = reservationsResult.data || [];
    const conversations = conversationsResult.data || [];
    const tickets = ticketsResult.data || [];
    const upsells = upsellsResult.data || [];
    const conversions = conversionsResult.data || [];
    const aiLogs = aiLogsResult.data || [];

    return {
      guest: guestResult.data,
      memories,
      reservations,
      conversations,
      tickets,
      upsells,
      conversions,
      aiLogs,
      tags: generateGuestTags({ memories, reservations, tickets, upsells, conversions }),
      insights: generateGuestInsights({ memories, reservations, tickets, upsells, conversions, aiLogs }),
      guestScore: calculateGuestScore({ reservations, tickets, upsells, conversions, memories, aiLogs }),
      revenueSignals: detectRevenueSignals({ memories, upsells, reservations, conversions }),
      operationalRisk: detectOperationalRisk({ tickets, aiLogs })
    };
  } catch (error) {
    logger.warn('Guest AI profile generation failed', {
      hotelId,
      guestId,
      message: error.message
    });

    throw error;
  }
};
