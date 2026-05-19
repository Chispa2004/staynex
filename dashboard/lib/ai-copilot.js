const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const hasAny = (text, terms) => terms.some((term) => text.includes(term));

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const lastGuestMessage = (messages = []) => [...messages]
  .reverse()
  .find((message) => message?.sender_type === 'guest') || null;

const guestMessages = (messages = []) => messages.filter((message) => message?.sender_type === 'guest');

const money = (value, currency = 'EUR') => ({
  amount: Number(value || 0),
  currency
});

const languageFromConversation = (conversation = {}) => {
  const latestGuest = lastGuestMessage(conversation.messages || []);

  return latestGuest?.original_language
    || conversation.guest?.preferred_language
    || conversation.aiState?.state_metadata?.conversation_language
    || conversation.aiState?.state_metadata?.language
    || 'en';
};

const replyTemplates = {
  es: {
    urgent: 'Gracias por avisarnos. Voy a priorizarlo con el equipo para revisarlo cuanto antes.',
    maintenance: 'Gracias por avisarnos. Lo revisamos con mantenimiento y os mantenemos informados.',
    revenue: 'Sí, puedo ayudarte con esa opción. Si quieres, reviso disponibilidad y preparo la solicitud.',
    clarify: 'Claro. Para ayudarte bien, ¿me puedes confirmar si necesitas información, una reserva o asistencia de recepción?',
    default: 'Claro, te ayudo. Revisaré el contexto y te responderé con la mejor opción para tu estancia.'
  },
  en: {
    urgent: 'Thank you for letting us know. I will prioritize this with the team so it can be reviewed as soon as possible.',
    maintenance: 'Thank you for telling us. We will check this with maintenance and keep you updated.',
    revenue: 'Yes, I can help with that option. If you like, I can check availability and prepare the request.',
    clarify: 'Of course. To help you properly, could you confirm whether you need information, a booking, or reception assistance?',
    default: 'Of course, I can help. I will review the context and reply with the best option for your stay.'
  },
  fr: {
    urgent: 'Merci de nous avoir prevenus. Je vais prioriser cela avec l equipe afin que ce soit verifie rapidement.',
    maintenance: 'Merci de nous l avoir signale. Nous allons verifier avec la maintenance et vous tenir informes.',
    revenue: 'Oui, je peux vous aider avec cette option. Si vous le souhaitez, je peux verifier la disponibilite et preparer la demande.',
    clarify: 'Bien sur. Pour bien vous aider, pouvez-vous confirmer si vous souhaitez une information, une reservation ou l aide de la reception ?',
    default: 'Bien sur, je peux vous aider. Je vais verifier le contexte et vous repondre avec la meilleure option pour votre sejour.'
  },
  de: {
    urgent: 'Vielen Dank fur den Hinweis. Ich priorisiere das mit dem Team, damit es schnell gepruft wird.',
    maintenance: 'Vielen Dank fur den Hinweis. Wir prufen das mit der Technik und halten Sie auf dem Laufenden.',
    revenue: 'Ja, ich kann Ihnen dabei helfen. Wenn Sie mochten, prufe ich die Verfugbarkeit und bereite die Anfrage vor.',
    clarify: 'Gerne. Damit ich richtig helfen kann: Geht es um Informationen, eine Buchung oder Hilfe von der Rezeption?',
    default: 'Gerne, ich helfe Ihnen. Ich prufe den Kontext und antworte mit der besten Option fur Ihren Aufenthalt.'
  }
};

const getTemplateLanguage = (language) => {
  const normalized = normalizeText(language).slice(0, 2);
  return replyTemplates[normalized] ? normalized : 'en';
};

const classifySentiment = ({ conversation = {}, ticket = null } = {}) => {
  const messages = conversation.messages || [];
  const text = normalizeText([
    ...guestMessages(messages).slice(-6).map((message) => message.content),
    ticket?.title,
    ticket?.description,
    conversation.aiState?.sentiment,
    conversation.aiLog?.human_reason
  ].filter(Boolean).join(' '));
  const reasons = [];

  if (hasAny(text, ['fire', 'smoke', 'danger', 'emergency', 'humo', 'fuego', 'peligro', 'emergencia', 'notfall', 'feuer', 'urgence'])) {
    reasons.push('Emergency language detected');
    return { label: 'urgent', tone: 'red', confidence: 0.96, reasons };
  }

  if (hasAny(text, ['angry', 'furious', 'unacceptable', 'terrible', 'refund', 'complaint', 'enfad', 'muy mal', 'inaceptable', 'reembolso', 'queja', 'beschwerde', 'verargert'])) {
    reasons.push('Strong complaint or refund language');
    return { label: 'angry', tone: 'red', confidence: 0.9, reasons };
  }

  if (hasAny(text, ['not working', 'broken', 'noise', 'noisy', 'waiting', 'nobody', 'no funciona', 'roto', 'ruido', 'nadie', 'esperando', 'kaputt', 'funktioniert nicht'])) {
    reasons.push('Operational friction detected');
    return { label: 'frustrated', tone: 'orange', confidence: 0.82, reasons };
  }

  if (hasAny(text, ['confused', 'not sure', 'dont understand', 'no entiendo', 'duda', 'confund', 'je ne comprends pas'])) {
    reasons.push('Guest appears confused');
    return { label: 'confused', tone: 'sky', confidence: 0.72, reasons };
  }

  if (hasAny(text, ['perfect', 'great', 'thanks', 'thank you', 'gracias', 'genial', 'merci', 'danke'])) {
    reasons.push('Positive or calm wording');
    return { label: 'calm', tone: 'emerald', confidence: 0.74, reasons };
  }

  return {
    label: conversation.aiState?.sentiment || 'neutral',
    tone: conversation.aiState?.sentiment === 'negative' ? 'orange' : 'slate',
    confidence: Number(conversation.aiState?.intent_confidence || conversation.aiLog?.confidence_score || 0.62),
    reasons: conversation.aiState?.sentiment ? ['AI conversation state signal'] : ['No strong emotional signal']
  };
};

const detectRevenueOpportunity = (conversation = {}) => {
  const offers = conversation.offers || [];
  const upsells = conversation.upsells || [];
  const bookings = conversation.experienceBookings || [];
  const text = normalizeText(guestMessages(conversation.messages || []).slice(-5).map((message) => message.content).join(' '));

  if (offers[0]) {
    return {
      label: offers[0].offer_type || 'AI offer',
      ...money(offers[0].suggested_price, offers[0].currency || 'EUR'),
      confidence: Number(offers[0].confidence || 0.78),
      tone: 'emerald',
      source: 'ai_offer'
    };
  }

  if (bookings[0]) {
    return {
      label: bookings[0].experience_title || 'Experience booking',
      ...money(bookings[0].estimated_revenue, bookings[0].currency || 'EUR'),
      confidence: 0.8,
      tone: 'violet',
      source: 'experience_booking'
    };
  }

  if (upsells[0]) {
    return {
      label: upsells[0].title || upsells[0].upsell_type || 'Upsell opportunity',
      ...money(0),
      confidence: Number(upsells[0].confidence || 0.7),
      tone: 'violet',
      source: 'upsell'
    };
  }

  if (hasAny(text, ['spa', 'hammam', 'massage', 'late checkout', 'transfer', 'excursion', 'tour', 'agafay', 'quad', 'restaurant', 'upgrade'])) {
    return {
      label: 'Guest interest detected',
      ...money(0),
      confidence: 0.62,
      tone: 'sky',
      source: 'message_keywords'
    };
  }

  return {
    label: 'No active revenue signal',
    ...money(0),
    confidence: 0.35,
    tone: 'slate',
    source: 'none'
  };
};

const detectVip = (conversation = {}) => {
  const memoryText = normalizeText((conversation.guestMemory || [])
    .map((item) => `${item.memory_key || ''} ${item.memory_value || ''} ${item.memory_type || ''}`)
    .join(' '));
  const roomText = normalizeText(conversation.guest?.current_room || '');
  const text = `${memoryText} ${roomText}`;
  let score = 0.12;
  const reasons = [];

  if (hasAny(text, ['vip', 'premium', 'suite', 'high spender', 'high_spender', 'anniversary', 'honeymoon', 'returning guest'])) {
    score += 0.55;
    reasons.push('Premium guest memory signal');
  }

  if ((conversation.offers || []).some((offer) => Number(offer.suggested_price || 0) >= 100)) {
    score += 0.18;
    reasons.push('High-value offer context');
  }

  if ((conversation.experienceBookings || []).length > 0) {
    score += 0.12;
    reasons.push('Active experience request');
  }

  score = clamp(score);

  return {
    probability: score,
    label: score >= 0.7 ? 'Likely VIP' : score >= 0.4 ? 'Possible VIP' : 'Standard guest',
    tone: score >= 0.7 ? 'violet' : score >= 0.4 ? 'sky' : 'slate',
    reasons: reasons.length ? reasons : ['No VIP-specific signal']
  };
};

const priorityFromSignals = ({ sentiment, conversation = {}, ticket = null, vip = null }) => {
  const text = normalizeText([
    ticket?.title,
    ticket?.description,
    ...guestMessages(conversation.messages || []).slice(-5).map((message) => message.content)
  ].filter(Boolean).join(' '));
  const reasons = [];

  if (
    ticket?.priority === 'urgent'
    || ticket?.category === 'emergency'
    || sentiment.label === 'urgent'
    || hasAny(text, ['fire', 'smoke', 'emergency', 'danger', 'humo', 'fuego', 'peligro'])
  ) {
    reasons.push('Emergency or urgent operational signal');
    return { level: 'urgent', tone: 'red', confidence: 0.95, reasons };
  }

  if (
    ticket?.priority === 'high'
    || sentiment.label === 'angry'
    || conversation.aiLog?.needs_human
    || hasAny(text, ['refund', 'complaint', 'unacceptable', 'no funciona', 'not working'])
  ) {
    reasons.push('Complaint, failed service, or human review signal');
    return { level: 'high', tone: 'orange', confidence: 0.86, reasons };
  }

  if (sentiment.label === 'frustrated' || Number(vip?.probability || 0) >= 0.7) {
    reasons.push(sentiment.label === 'frustrated' ? 'Guest frustration detected' : 'VIP guest context');
    return { level: 'normal', tone: 'sky', confidence: 0.74, reasons };
  }

  return { level: 'low', tone: 'slate', confidence: 0.62, reasons: ['No urgent signal'] };
};

const suggestedActionFor = ({ priority, sentiment, revenueOpportunity, conversation = {}, ticket = null }) => {
  const text = normalizeText([
    ticket?.category,
    ticket?.title,
    ticket?.description,
    ...guestMessages(conversation.messages || []).slice(-4).map((message) => message.content)
  ].filter(Boolean).join(' '));

  const pmsContext = conversation.pmsIntelligenceContext || ticket?.pmsIntelligenceContext || null;

  if (pmsContext?.roomStatus?.maintenanceStatus === 'maintenance' || pmsContext?.roomStatus?.maintenance_status === 'maintenance') {
    return { title: 'Check room maintenance', detail: 'The PMS context says this room may be under maintenance. Confirm status before replying.', tone: 'orange' };
  }

  if (pmsContext?.roomStatus?.housekeepingStatus === 'dirty' || pmsContext?.roomStatus?.housekeeping_status === 'dirty') {
    return { title: 'Check room status', detail: 'The room is marked dirty. Coordinate housekeeping before promising readiness.', tone: 'orange' };
  }

  if (pmsContext?.lateCheckoutEligible) {
    return { title: 'Offer late checkout', detail: 'Guest is near checkout and PMS context suggests late checkout is eligible.', tone: 'emerald' };
  }

  if (pmsContext?.upgradeEligible) {
    return { title: 'Offer upgrade', detail: 'PMS context suggests this stay may be upgrade eligible.', tone: 'emerald' };
  }

  if (priority.level === 'urgent') {
    return { title: 'Escalate immediately', detail: 'Notify reception or the duty manager before sending a guest-facing promise.', tone: 'red' };
  }

  if (hasAny(text, ['ac', 'air conditioning', 'maintenance', 'broken', 'no funciona', 'averia', 'kaputt'])) {
    return { title: 'Send maintenance', detail: 'Create or update the maintenance ticket and follow up with the guest after inspection.', tone: 'orange' };
  }

  if (hasAny(text, ['clean', 'housekeeping', 'toalla', 'limpieza', 'towel'])) {
    return { title: 'Assign housekeeping', detail: 'Ask housekeeping to review the room and confirm completion in the ticket.', tone: 'sky' };
  }

  if (revenueOpportunity?.source && revenueOpportunity.source !== 'none') {
    return { title: 'Follow revenue opportunity', detail: `Guest may respond well to ${revenueOpportunity.label}. Keep it contextual and optional.`, tone: 'emerald' };
  }

  if (sentiment.label === 'confused') {
    return { title: 'Clarify intent', detail: 'Ask one short question before escalating or creating work for the team.', tone: 'sky' };
  }

  return { title: 'Reply normally', detail: 'A concise hospitality reply should be enough. No operational escalation is required yet.', tone: 'slate' };
};

const escalationRiskFor = ({ priority, sentiment, conversation = {}, ticket = null }) => {
  const messages = guestMessages(conversation.messages || []);
  const complaintCount = messages.filter((message) => {
    const text = normalizeText(message.content || '');
    return hasAny(text, ['again', 'still', 'nobody', 'complaint', 'angry', 'otra vez', 'sigue', 'nadie', 'queja']);
  }).length;
  const reasons = [];

  if (priority.level === 'urgent' || sentiment.label === 'angry' || complaintCount >= 2) {
    reasons.push(priority.level === 'urgent' ? 'Urgent issue' : complaintCount >= 2 ? 'Repeated complaint wording' : 'Angry sentiment');
    return { level: 'high', tone: 'red', reasons };
  }

  if (priority.level === 'high' || ticket?.status === 'open') {
    reasons.push('Open high-priority operational item');
    return { level: 'medium', tone: 'orange', reasons };
  }

  return { level: 'low', tone: 'emerald', reasons: ['No escalation pattern'] };
};

const summaryForConversation = (conversation = {}) => {
  const latestGuest = lastGuestMessage(conversation.messages || []);
  const memory = conversation.guestMemory || [];
  const bookings = conversation.experienceBookings || [];
  const bullets = [
    conversation.guest?.current_room ? `Room ${conversation.guest.current_room}` : null,
    latestGuest?.content ? `Latest guest message: ${latestGuest.content}` : 'No recent guest message',
    conversation.aiState?.current_intent ? `Detected intent: ${conversation.aiState.current_intent}` : null,
    bookings[0]?.experience_title ? `Experience request: ${bookings[0].experience_title}` : null,
    memory[0]?.memory_key ? `Memory signal: ${memory[0].memory_key}` : null
  ].filter(Boolean);

  return {
    bullets,
    text: bullets.join(' / ')
  };
};

const suggestedReplyFor = ({ language, priority, suggestedAction, revenueOpportunity, sentiment }) => {
  const templates = replyTemplates[getTemplateLanguage(language)];

  if (priority.level === 'urgent') {
    return { text: templates.urgent, language: getTemplateLanguage(language), confidence: 0.76 };
  }

  if (suggestedAction.title.toLowerCase().includes('maintenance')) {
    return { text: templates.maintenance, language: getTemplateLanguage(language), confidence: 0.74 };
  }

  if (revenueOpportunity?.source && revenueOpportunity.source !== 'none') {
    return { text: templates.revenue, language: getTemplateLanguage(language), confidence: 0.7 };
  }

  if (sentiment.label === 'confused') {
    return { text: templates.clarify, language: getTemplateLanguage(language), confidence: 0.68 };
  }

  return { text: templates.default, language: getTemplateLanguage(language), confidence: 0.62 };
};

export const buildConversationCopilot = (conversation = {}) => {
  const language = languageFromConversation(conversation);
  const pmsContext = conversation.pmsIntelligenceContext || null;
  const sentiment = classifySentiment({ conversation });
  const revenueOpportunity = detectRevenueOpportunity(conversation);
  const vip = detectVip(conversation);
  const priority = priorityFromSignals({ sentiment, conversation, vip });
  const suggestedAction = suggestedActionFor({ priority, sentiment, revenueOpportunity, conversation });
  const escalationRisk = escalationRiskFor({ priority, sentiment, conversation });
  const suggestedReply = suggestedReplyFor({ language, priority, suggestedAction, revenueOpportunity, sentiment });
  const summary = summaryForConversation(conversation);

  return {
    sentiment,
    priority,
    suggestedAction,
    suggestedReply,
    summary,
    revenueOpportunity,
    vip,
    escalationRisk,
    language,
    guestSnapshot: {
      room: conversation.guest?.current_room || null,
      phone: conversation.guest?.phone_number || null,
      memoryCount: (conversation.guestMemory || []).length,
      openTickets: conversation.openTickets?.length || 0,
      bookingsCount: (conversation.experienceBookings || []).length,
      lastIntent: conversation.aiState?.current_intent || conversation.aiLog?.detected_intent || null,
      stayPhase: pmsContext?.stayPhase || pmsContext?.guestStayContext?.stay_phase || null,
      roomType: pmsContext?.guestStayContext?.room_type || pmsContext?.roomStatus?.roomType || null,
      checkoutDate: pmsContext?.guestStayContext?.departure_date || null,
      vipScore: pmsContext?.vipScore ?? pmsContext?.guestStayContext?.vip_score ?? null
    },
    pmsContext: {
      stayPhase: pmsContext?.stayPhase || pmsContext?.guestStayContext?.stay_phase || null,
      roomStatus: pmsContext?.roomStatus || null,
      occupancy: pmsContext?.occupancy || null,
      revenuePotential: pmsContext?.revenuePotential || 0,
      upgradeEligible: Boolean(pmsContext?.upgradeEligible),
      lateCheckoutEligible: Boolean(pmsContext?.lateCheckoutEligible),
      recommendedActions: pmsContext?.recommendedActions || [],
      warnings: pmsContext?.operationalWarnings || []
    },
    logs: {
      copilot_action_generated: suggestedAction.title,
      copilot_reply_generated: true,
      copilot_summary_generated: true,
      sentiment_detected: sentiment.label,
      escalation_risk_detected: escalationRisk.level,
      revenue_opportunity_detected: revenueOpportunity.source !== 'none'
    }
  };
};

const departmentFromTicket = (ticket = {}) => {
  const text = normalizeText(`${ticket.category || ''} ${ticket.title || ''} ${ticket.description || ''}`);

  if (hasAny(text, ['maintenance', 'ac', 'air conditioning', 'electric', 'water', 'broken', 'no funciona'])) {
    return 'Maintenance';
  }

  if (hasAny(text, ['housekeeping', 'clean', 'towel', 'limpieza', 'toalla'])) {
    return 'Housekeeping';
  }

  if (hasAny(text, ['restaurant', 'breakfast', 'spa', 'experience', 'booking'])) {
    return 'Reception';
  }

  if (hasAny(text, ['refund', 'complaint', 'manager'])) {
    return 'Manager';
  }

  return 'Reception';
};

export const buildTicketCopilot = (ticket = {}, allTickets = []) => {
  const sentiment = classifySentiment({ ticket });
  const priority = priorityFromSignals({ sentiment, ticket });
  const department = departmentFromTicket(ticket);
  const pmsContext = ticket.pmsIntelligenceContext || {};
  const roomStatus = pmsContext.roomStatus || ticket.roomStatus || null;
  const similarIncidents = allTickets.filter((item) => (
    item.id !== ticket.id
    && item.category
    && ticket.category
    && item.category === ticket.category
  )).slice(0, 3);
  const satisfactionRisk = escalationRiskFor({ priority, sentiment, ticket });
  const suggestedResolution = roomStatus?.maintenanceStatus === 'maintenance' || roomStatus?.maintenance_status === 'maintenance'
    ? 'PMS context shows this room may be under maintenance. Confirm with maintenance before closing the ticket.'
    : roomStatus?.housekeepingStatus === 'dirty' || roomStatus?.housekeeping_status === 'dirty'
      ? 'PMS context shows the room is dirty. Assign housekeeping and follow up once the room is checked.'
      : priority.level === 'urgent'
    ? 'Escalate immediately and confirm safety before closing the ticket.'
    : department === 'Maintenance'
      ? 'Assign maintenance, confirm room access, then send a short follow-up to the guest.'
      : department === 'Housekeeping'
        ? 'Assign housekeeping and mark the ticket complete only after the room is checked.'
        : 'Reply with a clear next step and keep the ticket open until the guest confirms.';

  return {
    aiPriority: priority,
    estimatedUrgency: priority.level,
    suggestedDepartment: department,
    suggestedResolution,
    satisfactionRisk,
    sentiment,
    roomStatus,
    similarPastIncidents: similarIncidents.map((item) => ({
      id: item.id,
      title: item.title,
      room_number: item.room_number,
      created_at: item.created_at
    })),
    logs: {
      copilot_action_generated: suggestedResolution,
      sentiment_detected: sentiment.label,
      escalation_risk_detected: satisfactionRisk.level
    }
  };
};

export const buildCopilotInsights = ({ conversations = [], tickets = [] } = {}) => {
  const angryGuests = conversations.filter((conversation) => conversation.copilot?.sentiment?.label === 'angry').length;
  const highRisk = conversations.filter((conversation) => conversation.copilot?.escalationRisk?.level === 'high').length;
  const urgentTickets = tickets.filter((ticket) => ticket.copilot?.aiPriority?.level === 'urgent' || ticket.priority === 'urgent').length;
  const revenueSignals = conversations.filter((conversation) => conversation.copilot?.revenueOpportunity?.source && conversation.copilot.revenueOpportunity.source !== 'none').length;

  return [
    angryGuests ? `${angryGuests} frustrated guest${angryGuests === 1 ? '' : 's'} need reception tone control` : null,
    highRisk ? `${highRisk} conversation${highRisk === 1 ? '' : 's'} carry escalation risk` : null,
    urgentTickets ? `${urgentTickets} urgent ticket${urgentTickets === 1 ? '' : 's'} should be prioritized` : null,
    revenueSignals ? `${revenueSignals} active revenue opportunit${revenueSignals === 1 ? 'y' : 'ies'} detected` : null
  ].filter(Boolean);
};
