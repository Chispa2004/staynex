import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value || 0)));

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const missingGuestIntelligenceTable = (error) => (
  error?.message?.includes('guest_intelligence_profiles')
  || error?.message?.includes('guest_behavior_signals')
  || error?.message?.includes('guest_revenue_predictions')
  || error?.message?.includes('guest_sentiment_history')
  || error?.message?.includes('guest_interest_affinities')
  || error?.message?.includes('revenue_ai_events')
  || error?.details?.includes('guest_intelligence_profiles')
  || error?.details?.includes('guest_behavior_signals')
  || error?.details?.includes('guest_revenue_predictions')
  || error?.details?.includes('guest_sentiment_history')
  || error?.details?.includes('guest_interest_affinities')
  || error?.details?.includes('revenue_ai_events')
  || error?.hint?.includes('guest_intelligence_profiles')
  || error?.hint?.includes('guest_behavior_signals')
  || error?.hint?.includes('guest_revenue_predictions')
  || error?.hint?.includes('guest_sentiment_history')
  || error?.hint?.includes('guest_interest_affinities')
  || error?.hint?.includes('revenue_ai_events')
);

const safeDb = async (operation, fallback = null, label = 'guest_intelligence') => {
  try {
    const { data, error } = await operation();
    if (error) {
      if (missingGuestIntelligenceTable(error)) {
        logger.warn('guest_intelligence_schema_missing', {
          label,
          message: error.message
        });
        return fallback;
      }
      throw error;
    }
    return data ?? fallback;
  } catch (error) {
    if (missingGuestIntelligenceTable(error)) {
      logger.warn('guest_intelligence_schema_missing', {
        label,
        message: error.message
      });
      return fallback;
    }
    logger.warn('guest_intelligence_operation_failed', {
      label,
      message: error.message
    });
    return fallback;
  }
};

const signalDefinitions = [
  { type: 'spa_interest', words: ['spa', 'hammam', 'masaje', 'massage', 'wellness', 'bienestar', 'relax'], confidence: 0.84 },
  { type: 'transfer_interest', words: ['transfer', 'traslado', 'airport', 'aeropuerto', 'taxi', 'pickup'], confidence: 0.8 },
  { type: 'excursion_interest', words: ['excursion', 'excursion', 'tour', 'agafay', 'atlas', 'quad', 'essaouira', 'activity', 'actividad'], confidence: 0.86 },
  { type: 'late_checkout_interest', words: ['late checkout', 'salir mas tarde', 'checkout tarde', 'leave later'], confidence: 0.84 },
  { type: 'restaurant_interest', words: ['restaurant', 'restaurante', 'dinner', 'cena', 'breakfast', 'desayuno', 'food'], confidence: 0.78 },
  { type: 'complaint_signal', words: ['complaint', 'queja', 'unacceptable', 'inaceptable', 'refund', 'reembolso', 'terrible', 'muy mal'], confidence: 0.9 },
  { type: 'frustration_signal', words: ['angry', 'enfadado', 'waiting', 'esperando', 'nobody', 'nadie', 'still not', 'sigue sin'], confidence: 0.82 },
  { type: 'vip_signal', words: ['vip', 'suite', 'premium', 'luxury', 'lujo'], confidence: 0.78 },
  { type: 'premium_signal', words: ['private', 'privado', 'exclusive', 'exclusivo', 'champagne', 'yacht', 'premium'], confidence: 0.76 },
  { type: 'wellness_signal', words: ['wellness', 'bienestar', 'hammam', 'spa', 'yoga', 'relax'], confidence: 0.84 },
  { type: 'celebration_signal', words: ['anniversary', 'aniversario', 'honeymoon', 'luna de miel', 'birthday', 'cumpleanos', 'celebramos'], confidence: 0.88 },
  { type: 'family_signal', words: ['family', 'familia', 'children', 'kids', 'ninos', 'bebe', 'baby'], confidence: 0.82 },
  { type: 'business_signal', words: ['meeting', 'business', 'trabajo', 'conference', 'reunion', 'factura', 'invoice'], confidence: 0.72 },
  { type: 'nightlife_signal', words: ['club', 'nightlife', 'bar', 'copas', 'fiesta', 'party'], confidence: 0.7 }
];

const getTextCorpus = ({
  message = '',
  recentMessages = [],
  guestMemory = [],
  tickets = [],
  aiLogs = []
} = {}) => normalize([
  message,
  ...recentMessages.map((item) => item.content || item.message || ''),
  ...guestMemory.map((item) => `${item.memory_key || ''} ${item.memory_value || ''}`),
  ...tickets.map((item) => `${item.title || ''} ${item.description || ''} ${item.category || ''}`),
  ...aiLogs.map((item) => `${item.detected_intent || ''} ${item.human_reason || ''}`)
].filter(Boolean).join(' '));

export const detectBehaviorSignals = (input = {}) => {
  const text = getTextCorpus(input);
  return signalDefinitions
    .filter((definition) => includesAny(text, definition.words))
    .map((definition) => ({
      signalType: definition.type,
      confidence: definition.confidence,
      source: input.source || 'conversation',
      detectedFrom: input.message || input.detectedFrom || 'context',
      metadata: {
        rule: 'keyword_affinity'
      }
    }));
};

export const calculateAffinities = ({ signals = [], guestMemory = [], pmsIntelligenceContext = null } = {}) => {
  const signalTypes = new Set(signals.map((signal) => signal.signalType || signal.signal_type));
  const memoryText = normalize(guestMemory.map((item) => `${item.memory_key || ''} ${item.memory_value || ''}`).join(' '));
  const add = (base, amount) => clamp(base + amount);
  const affinities = {
    spa_affinity: 10,
    wellness_affinity: 10,
    adventure_affinity: 10,
    restaurant_affinity: 10,
    luxury_affinity: 10,
    transfer_affinity: 10,
    family_affinity: 10,
    nightlife_affinity: 10
  };

  if (signalTypes.has('spa_interest')) affinities.spa_affinity = add(affinities.spa_affinity, 62);
  if (signalTypes.has('wellness_signal')) affinities.wellness_affinity = add(affinities.wellness_affinity, 62);
  if (signalTypes.has('excursion_interest')) affinities.adventure_affinity = add(affinities.adventure_affinity, 56);
  if (signalTypes.has('restaurant_interest')) affinities.restaurant_affinity = add(affinities.restaurant_affinity, 52);
  if (signalTypes.has('premium_signal') || signalTypes.has('vip_signal')) affinities.luxury_affinity = add(affinities.luxury_affinity, 58);
  if (signalTypes.has('transfer_interest')) affinities.transfer_affinity = add(affinities.transfer_affinity, 58);
  if (signalTypes.has('family_signal')) affinities.family_affinity = add(affinities.family_affinity, 64);
  if (signalTypes.has('nightlife_signal')) affinities.nightlife_affinity = add(affinities.nightlife_affinity, 52);

  if (includesAny(memoryText, ['interested_spa', 'hammam'])) affinities.spa_affinity = add(affinities.spa_affinity, 18);
  if (includesAny(memoryText, ['traveling_with_partner', 'anniversary_trip'])) affinities.luxury_affinity = add(affinities.luxury_affinity, 14);
  if (pmsIntelligenceContext?.upgradeEligible) affinities.luxury_affinity = add(affinities.luxury_affinity, 12);
  if (pmsIntelligenceContext?.transferLikely) affinities.transfer_affinity = add(affinities.transfer_affinity, 16);

  return affinities;
};

export const calculateVipScore = ({ signals = [], pmsIntelligenceContext = null, bookings = [], revenue = 0 } = {}) => {
  const signalTypes = new Set(signals.map((signal) => signal.signalType || signal.signal_type));
  let score = Number(pmsIntelligenceContext?.vipScore || pmsIntelligenceContext?.guestStayContext?.vip_score || 0);
  if (signalTypes.has('vip_signal')) score += 25;
  if (signalTypes.has('premium_signal')) score += 18;
  if (bookings.length > 0) score += 10;
  if (revenue >= 200) score += 18;
  return clamp(score);
};

export const calculateReviewRisk = ({ signals = [], tickets = [], aiLogs = [] } = {}) => {
  const signalTypes = new Set(signals.map((signal) => signal.signalType || signal.signal_type));
  const complaints = tickets.filter((ticket) => ticket.category === 'complaint' || ticket.priority === 'urgent').length;
  const needsHuman = aiLogs.filter((log) => log.needs_human || log.human_reason).length;
  let score = complaints * 24 + needsHuman * 10;
  if (signalTypes.has('complaint_signal')) score += 34;
  if (signalTypes.has('frustration_signal')) score += 24;
  return clamp(score);
};

export const calculateRevenuePotential = ({ affinities = {}, vipScore = 0, pmsIntelligenceContext = null, reviewRiskScore = 0 } = {}) => {
  const topAffinity = Math.max(...Object.values(affinities).map(Number));
  const pmsRevenue = Number(pmsIntelligenceContext?.revenuePotential || 0);
  const score = topAffinity * 0.45
    + Number(vipScore) * 0.22
    + (pmsIntelligenceContext?.upgradeEligible ? 14 : 0)
    + (pmsIntelligenceContext?.lateCheckoutEligible ? 8 : 0)
    + Math.min(20, pmsRevenue / 10)
    - Number(reviewRiskScore) * 0.24;
  return clamp(score);
};

export const calculateSentimentScore = ({ signals = [] } = {}) => {
  const signalTypes = new Set(signals.map((signal) => signal.signalType || signal.signal_type));
  if (signalTypes.has('complaint_signal')) return 22;
  if (signalTypes.has('frustration_signal')) return 34;
  return 62;
};

export const detectGuestType = ({ affinities = {}, signals = [], vipScore = 0, reviewRiskScore = 0 } = {}) => {
  const signalTypes = new Set(signals.map((signal) => signal.signalType || signal.signal_type));

  if (reviewRiskScore >= 70) return 'high_maintenance';
  if (vipScore >= 75) return 'vip_guest';
  if (signalTypes.has('business_signal')) return 'business_guest';
  if (affinities.family_affinity >= 65) return 'family_guest';
  if (affinities.wellness_affinity >= 65 || affinities.spa_affinity >= 65) return 'wellness_traveler';
  if (affinities.adventure_affinity >= 60) return 'experience_seeker';
  if (affinities.luxury_affinity >= 60) return 'luxury_guest';
  if (signalTypes.has('celebration_signal')) return 'romantic_couple';
  return 'low_engagement';
};

export const generateProfileSummary = ({ profileType, affinities = {}, revenuePotentialScore = 0, reviewRiskScore = 0 } = {}) => {
  const topAffinities = Object.entries(affinities)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([key, value]) => `${key.replace('_affinity', '')} ${Math.round(value)}`)
    .join(', ');

  return `${profileType.replaceAll('_', ' ')} profile. Top affinities: ${topAffinities || 'none yet'}. Revenue potential ${Math.round(revenuePotentialScore)}/100. Review risk ${Math.round(reviewRiskScore)}/100.`;
};

export const buildGuestIntelligenceProfile = ({
  hotelId,
  guestId,
  reservationId = null,
  message = '',
  recentMessages = [],
  guestMemory = [],
  tickets = [],
  aiLogs = [],
  bookings = [],
  pmsIntelligenceContext = null,
  language = null,
  country = null,
  source = 'conversation'
} = {}) => {
  const signals = detectBehaviorSignals({
    message,
    recentMessages,
    guestMemory,
    tickets,
    aiLogs,
    source
  });
  const affinities = calculateAffinities({ signals, guestMemory, pmsIntelligenceContext });
  const acceptedRevenue = bookings.reduce((total, booking) => total + Number(booking.estimated_revenue || 0), 0);
  const vipScore = calculateVipScore({ signals, pmsIntelligenceContext, bookings, revenue: acceptedRevenue });
  const reviewRiskScore = calculateReviewRisk({ signals, tickets, aiLogs });
  const sentimentScore = calculateSentimentScore({ signals });
  const revenuePotentialScore = calculateRevenuePotential({
    affinities,
    vipScore,
    pmsIntelligenceContext,
    reviewRiskScore
  });
  const engagementScore = clamp(recentMessages.length * 8 + guestMemory.length * 5 + bookings.length * 12);
  const automationAffinityScore = clamp(revenuePotentialScore * 0.55 + engagementScore * 0.25 - reviewRiskScore * 0.2);
  const profileType = detectGuestType({ affinities, signals, vipScore, reviewRiskScore });
  const travelType = affinities.family_affinity >= 65
    ? 'family'
    : profileType === 'romantic_couple'
      ? 'couple'
      : profileType === 'business_guest'
        ? 'business'
        : null;
  const stayType = pmsIntelligenceContext?.stayPhase || pmsIntelligenceContext?.guestStayContext?.stay_phase || null;
  const profileSummary = generateProfileSummary({
    profileType,
    affinities,
    revenuePotentialScore,
    reviewRiskScore
  });

  return {
    hotelId,
    guestId,
    reservationId,
    profileType,
    vipScore,
    sentimentScore,
    reviewRiskScore,
    revenuePotentialScore,
    engagementScore,
    automationAffinityScore,
    language,
    country,
    travelType,
    stayType,
    profileSummary,
    signals,
    affinities,
    metadata: {
      source,
      top_affinities: Object.entries(affinities)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 4)
        .map(([key, value]) => ({ key, value }))
    }
  };
};

export const persistGuestIntelligenceProfile = async (profile) => {
  if (!profile?.hotelId || !profile?.guestId) return null;
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const profilePayload = {
    hotel_id: profile.hotelId,
    guest_id: profile.guestId,
    reservation_id: profile.reservationId,
    profile_type: profile.profileType,
    vip_score: profile.vipScore,
    sentiment_score: profile.sentimentScore,
    review_risk_score: profile.reviewRiskScore,
    revenue_potential_score: profile.revenuePotentialScore,
    engagement_score: profile.engagementScore,
    automation_affinity_score: profile.automationAffinityScore,
    language: profile.language,
    country: profile.country,
    travel_type: profile.travelType,
    stay_type: profile.stayType,
    profile_summary: profile.profileSummary,
    metadata: profile.metadata || {},
    updated_at: now
  };
  const affinitiesPayload = {
    hotel_id: profile.hotelId,
    guest_id: profile.guestId,
    reservation_id: profile.reservationId,
    ...profile.affinities,
    metadata: {
      source: profile.metadata?.source || 'conversation'
    },
    updated_at: now
  };

  const [savedProfile] = await Promise.all([
    safeDb(() => supabase
      .from('guest_intelligence_profiles')
      .upsert(profilePayload, { onConflict: 'hotel_id,guest_id' })
      .select('*')
      .single(), null, 'upsert_guest_intelligence_profile'),
    safeDb(() => supabase
      .from('guest_interest_affinities')
      .upsert(affinitiesPayload, { onConflict: 'hotel_id,guest_id' })
      .select('*')
      .single(), null, 'upsert_guest_interest_affinities'),
    ...profile.signals.map((signal) => safeDb(() => supabase
      .from('guest_behavior_signals')
      .insert({
        hotel_id: profile.hotelId,
        guest_id: profile.guestId,
        reservation_id: profile.reservationId,
        signal_type: signal.signalType,
        confidence: signal.confidence,
        source: signal.source,
        detected_from: signal.detectedFrom,
        metadata: signal.metadata || {}
      })
      .select('id')
      .single(), null, 'insert_guest_behavior_signal')),
    safeDb(() => supabase
      .from('guest_sentiment_history')
      .insert({
        hotel_id: profile.hotelId,
        guest_id: profile.guestId,
        conversation_id: profile.metadata?.conversation_id || null,
        sentiment: profile.sentimentScore <= 30 ? 'frustrated' : profile.sentimentScore >= 70 ? 'happy' : 'neutral',
        sentiment_score: profile.sentimentScore,
        confidence: 0.72,
        source: profile.metadata?.source || 'conversation',
        detected_from: profile.metadata?.detected_from || null
      })
      .select('id')
      .single(), null, 'insert_guest_sentiment_history')
  ]);

  return savedProfile || profile;
};

export const getGuestIntelligenceContext = async ({ hotelId, guestId } = {}) => {
  if (!hotelId || !guestId) return null;
  const supabase = getSupabase();
  const [profile, affinities, prediction, signals] = await Promise.all([
    safeDb(() => supabase
      .from('guest_intelligence_profiles')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('guest_id', guestId)
      .maybeSingle(), null, 'get_guest_intelligence_profile'),
    safeDb(() => supabase
      .from('guest_interest_affinities')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('guest_id', guestId)
      .maybeSingle(), null, 'get_guest_interest_affinities'),
    safeDb(() => supabase
      .from('guest_revenue_predictions')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('guest_id', guestId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(), null, 'get_guest_revenue_prediction'),
    safeDb(() => supabase
      .from('guest_behavior_signals')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('guest_id', guestId)
      .order('created_at', { ascending: false })
      .limit(20), [], 'get_guest_behavior_signals')
  ]);

  if (!profile && !affinities && !prediction && !signals?.length) {
    return null;
  }

  return {
    profile,
    affinities,
    prediction,
    signals: signals || []
  };
};

export const recordRevenueAiEvent = async ({
  hotelId,
  guestId = null,
  reservationId = null,
  conversationId = null,
  eventType,
  revenueType = null,
  estimatedRevenue = 0,
  conversionProbability = null,
  source = 'revenue_ai',
  metadata = {}
} = {}) => {
  if (!hotelId || !eventType) return null;
  const supabase = getSupabase();
  return safeDb(() => supabase
    .from('revenue_ai_events')
    .insert({
      hotel_id: hotelId,
      guest_id: guestId,
      reservation_id: reservationId,
      conversation_id: conversationId,
      event_type: eventType,
      revenue_type: revenueType,
      estimated_revenue: estimatedRevenue,
      conversion_probability: conversionProbability,
      source,
      metadata
    })
    .select('*')
    .single(), null, 'insert_revenue_ai_event');
};
