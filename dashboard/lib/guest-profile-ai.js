const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));
const unique = (items) => [...new Set(items.filter(Boolean))];

export const formatGuestName = ({ guest, reservations = [] }) => (
  reservations.find((item) => item.guest_name)?.guest_name
  || guest?.name
  || guest?.phone_number
  || 'Guest'
);

export const getGuestEmail = ({ reservations = [] }) => (
  reservations.find((item) => item.guest_email)?.guest_email || '-'
);

export const getAcceptedRevenue = (conversions = []) => conversions
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
  if (memoryKeys.has('traveling_with_partner') || memoryKeys.has('anniversary_trip') || includesAny(text, ['pareja', 'romantic', 'romantico', 'romantica', 'anniversary'])) tags.push('romantic');
  if (includesAny(text, ['family', 'familia', 'children', 'ninos', 'kids'])) tags.push('family');
  if (memoryKeys.has('interested_late_checkout') || includesAny(text, ['late checkout', 'salir mas tarde'])) tags.push('late_checkout_interest');
  if (memoryKeys.has('interested_spa') || upsells.some((item) => item.upsell_type === 'spa')) tags.push('spa_interest');
  if (upsells.some((item) => ['room_upgrade', 'late_checkout'].includes(item.upsell_type))) tags.push('upgrade_ready');
  if (tickets.filter((item) => item.category === 'complaint' || item.priority === 'urgent').length >= 2) tags.push('complains_often');

  return unique(tags).map((tag) => ({
    tag,
    confidence: ['vip', 'high_spender', 'repeat_guest'].includes(tag) ? 0.88 : 0.78,
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
      negative ? 'Negative guest sentiment detected' : null
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

  return Math.round(Math.max(0, Math.min(100, 52 + positiveSignals + revenueBoost - risk * 0.35)));
};

export const generateGuestInsights = ({ memories = [], reservations = [], tickets = [], upsells = [], conversions = [], messages = [], aiLogs = [] } = {}) => {
  const tags = generateGuestTags({ memories, reservations, tickets, upsells, conversions, messages }).map((item) => item.tag);
  const risk = detectOperationalRisk({ tickets, aiLogs, messages });
  const revenue = detectRevenueSignals({ memories, upsells, reservations, conversions });
  const insights = [];

  if (tags.includes('upgrade_ready')) {
    insights.push({
      type: 'revenue',
      title: 'High probability of accepting a room upgrade',
      description: 'The guest has commercial signals that fit a premium room upgrade conversation.',
      priority: 'high'
    });
  }

  if (tags.includes('romantic')) {
    insights.push({
      type: 'experience',
      title: 'Romantic stay signal detected',
      description: 'Offer help with dinner, spa, welcome details or a quieter room assignment.',
      priority: 'normal'
    });
  }

  if (risk.level !== 'low') {
    insights.push({
      type: 'risk',
      title: risk.level === 'high' ? 'Bad review risk' : 'Operational follow-up recommended',
      description: risk.reasons.join(', ') || 'The profile contains signals that deserve human attention.',
      priority: risk.level === 'high' ? 'urgent' : 'high'
    });
  }

  if (revenue.signals.includes('late_checkout')) {
    insights.push({
      type: 'revenue',
      title: 'Late checkout interest',
      description: 'Reception can check availability and prepare pricing before the guest asks again.',
      priority: 'normal'
    });
  }

  if (!insights.length) {
    insights.push({
      type: 'profile',
      title: 'Profile is learning',
      description: 'Staynex will enrich this profile as the guest chats, books and interacts with the hotel.',
      priority: 'normal'
    });
  }

  return insights;
};

export const generateRecommendedActions = ({ tags = [], risk = {}, revenue = {} } = {}) => {
  const tagNames = new Set(tags.map((item) => item.tag || item));
  const actions = [];

  if (tagNames.has('romantic')) actions.push({ title: 'Offer spa or romantic dinner', department: 'revenue', priority: 'normal', actionType: 'offer_romantic_experience' });
  if (tagNames.has('late_checkout_interest')) actions.push({ title: 'Prepare late checkout option', department: 'reception', priority: 'normal', actionType: 'late_checkout_followup' });
  if (tagNames.has('upgrade_ready')) actions.push({ title: 'Offer premium upgrade', department: 'revenue', priority: 'high', actionType: 'premium_upgrade' });
  if (risk.level !== 'low') actions.push({ title: 'Manual reception follow-up', department: 'reception', priority: risk.level === 'high' ? 'urgent' : 'high', actionType: 'human_followup' });
  if (revenue.signals?.includes('spa')) actions.push({ title: 'Share spa availability', department: 'revenue', priority: 'normal', actionType: 'spa_offer' });

  return actions.length ? actions : [
    { title: 'Keep profile warm', department: 'reception', priority: 'low', actionType: 'monitor_guest' }
  ];
};

export const buildDepartmentContext = ({ memories = [], tickets = [], upsells = [], tags = [], risk = {}, revenue = {} } = {}) => {
  const tagNames = new Set(tags.map((item) => item.tag || item));

  return {
    reception: [
      risk.level !== 'low' ? `Attention level: ${risk.level}` : 'No major reception risk detected',
      tagNames.has('repeat_guest') ? 'Repeat guest: acknowledge loyalty naturally' : null,
      memories.find((item) => item.memory_key === 'preferred_language') ? `Preferred language: ${memories.find((item) => item.memory_key === 'preferred_language')?.memory_value}` : null
    ].filter(Boolean),
    housekeeping: [
      memories.find((item) => item.memory_key === 'extra_pillow_preference') ? 'Prepare extra pillow preference' : null,
      tickets.some((item) => item.category === 'housekeeping') ? 'Recent housekeeping requests exist' : 'No housekeeping sensitivity detected'
    ].filter(Boolean),
    maintenance: [
      tickets.some((item) => item.category === 'maintenance' || item.category === 'emergency') ? 'Review prior maintenance/emergency tickets' : 'No maintenance history requiring action'
    ],
    revenue: [
      revenue.signals?.length ? `Revenue signals: ${revenue.signals.join(', ')}` : 'No strong revenue signal yet',
      upsells.some((item) => item.status === 'accepted') ? 'Guest has accepted upsell before' : null
    ].filter(Boolean)
  };
};

export const buildTimeline = ({ messages = [], tickets = [], reservations = [], upsells = [], scheduledMessages = [], insights = [] } = {}) => [
  ...messages.map((item) => ({
    id: `message-${item.id}`,
    type: 'message',
    title: item.sender_type === 'guest' ? 'WhatsApp guest message' : item.sender_type === 'staff' ? 'Staff reply' : 'AI reply',
    description: item.content,
    createdAt: item.created_at,
    tone: item.sender_type === 'guest' ? 'emerald' : item.sender_type === 'staff' ? 'sky' : 'violet'
  })),
  ...tickets.map((item) => ({
    id: `ticket-${item.id}`,
    type: 'ticket',
    title: item.title || 'Operational ticket',
    description: `${item.category || 'ticket'} - ${item.status || 'open'} - ${item.priority || 'normal'}`,
    createdAt: item.created_at,
    tone: item.priority === 'urgent' ? 'red' : 'amber'
  })),
  ...reservations.map((item) => ({
    id: `reservation-${item.id}`,
    type: 'reservation',
    title: item.pms_reservation_id || 'Reservation',
    description: `${item.arrival_date || '-'} -> ${item.departure_date || '-'} ${item.room_type ? `- ${item.room_type}` : ''}`,
    createdAt: item.created_at || item.arrival_date,
    tone: 'sky'
  })),
  ...upsells.map((item) => ({
    id: `upsell-${item.id}`,
    type: 'upsell',
    title: item.title || 'Upsell opportunity',
    description: `${item.upsell_type} - ${item.status}`,
    createdAt: item.created_at,
    tone: item.status === 'accepted' ? 'emerald' : 'violet'
  })),
  ...scheduledMessages.map((item) => ({
    id: `automation-${item.id}`,
    type: 'automation',
    title: item.automation_type || 'Automation scheduled',
    description: `${item.status || 'scheduled'} - ${item.channel || 'whatsapp'}`,
    createdAt: item.scheduled_for || item.created_at,
    tone: 'slate'
  })),
  ...insights.map((item, index) => ({
    id: `insight-${index}`,
    type: 'insight',
    title: item.title,
    description: item.description,
    createdAt: item.created_at || item.updated_at || new Date().toISOString(),
    tone: item.priority === 'urgent' ? 'red' : item.priority === 'high' ? 'amber' : 'emerald'
  }))
]
  .filter((item) => item.createdAt)
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
