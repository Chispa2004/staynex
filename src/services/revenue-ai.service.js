import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const clampProbability = (value) => Math.min(0.98, Math.max(0.02, Number(value || 0)));

const scoreToProbability = (score) => clampProbability(Number(score || 0) / 100);

const missingRevenueAiTable = (error) => (
  error?.message?.includes('guest_revenue_predictions')
  || error?.message?.includes('revenue_ai_events')
  || error?.details?.includes('guest_revenue_predictions')
  || error?.details?.includes('revenue_ai_events')
  || error?.hint?.includes('guest_revenue_predictions')
  || error?.hint?.includes('revenue_ai_events')
);

const safeDb = async (operation, fallback = null, label = 'revenue_ai') => {
  try {
    const { data, error } = await operation();
    if (error) {
      if (missingRevenueAiTable(error)) {
        logger.warn('revenue_ai_schema_missing', {
          label,
          message: error.message
        });
        return fallback;
      }
      throw error;
    }
    return data ?? fallback;
  } catch (error) {
    if (missingRevenueAiTable(error)) {
      logger.warn('revenue_ai_schema_missing', {
        label,
        message: error.message
      });
      return fallback;
    }
    logger.warn('revenue_ai_operation_failed', {
      label,
      message: error.message
    });
    return fallback;
  }
};

const estimateByType = {
  spa: 85,
  transfer: 60,
  experience: 95,
  upgrade: 120,
  late_checkout: 45,
  restaurant: 65,
  romantic: 140
};

export const predictLikelyConversions = ({ guestIntelligence = {}, pmsIntelligenceContext = null } = {}) => {
  const affinities = guestIntelligence.affinities || {};
  const revenueScore = Number(guestIntelligence.revenuePotentialScore || guestIntelligence.profile?.revenue_potential_score || 0);
  const reviewRisk = Number(guestIntelligence.reviewRiskScore || guestIntelligence.profile?.review_risk_score || 0);
  const riskPenalty = reviewRisk >= 60 ? 0.18 : reviewRisk >= 35 ? 0.08 : 0;
  const probabilityFor = (affinity, bonus = 0) => clampProbability(scoreToProbability((Number(affinity || 0) * 0.7) + (revenueScore * 0.3) + bonus) - riskPenalty);

  const likelyToBuySpa = probabilityFor(Math.max(Number(affinities.spa_affinity || 0), Number(affinities.wellness_affinity || 0)));
  const likelyToBuyTransfer = probabilityFor(affinities.transfer_affinity, pmsIntelligenceContext?.transferLikely ? 12 : 0);
  const likelyToBuyExperience = probabilityFor(affinities.adventure_affinity, pmsIntelligenceContext?.experienceLikely ? 8 : 0);
  const likelyToBuyUpgrade = probabilityFor(affinities.luxury_affinity, pmsIntelligenceContext?.upgradeEligible ? 18 : 0);
  const likelyToBuyLateCheckout = probabilityFor(revenueScore, pmsIntelligenceContext?.lateCheckoutEligible ? 22 : 0);
  const estimatedRevenue = Math.round(
    likelyToBuySpa * estimateByType.spa
    + likelyToBuyTransfer * estimateByType.transfer
    + likelyToBuyExperience * estimateByType.experience
    + likelyToBuyUpgrade * estimateByType.upgrade
    + likelyToBuyLateCheckout * estimateByType.late_checkout
  );
  const conversionProbability = Math.max(
    likelyToBuySpa,
    likelyToBuyTransfer,
    likelyToBuyExperience,
    likelyToBuyUpgrade,
    likelyToBuyLateCheckout
  );

  return {
    likelyToBuySpa,
    likelyToBuyTransfer,
    likelyToBuyExperience,
    likelyToBuyUpgrade,
    likelyToBuyLateCheckout,
    estimatedRevenue,
    conversionProbability,
    predictionConfidence: revenueScore >= 70 ? 0.82 : revenueScore >= 40 ? 0.7 : 0.58
  };
};

export const detectRevenueOpportunities = ({ guestIntelligence = {}, revenuePrediction = null, pmsIntelligenceContext = null } = {}) => {
  const prediction = revenuePrediction || predictLikelyConversions({ guestIntelligence, pmsIntelligenceContext });
  const opportunities = [
    {
      type: 'spa',
      label: 'Spa / hammam',
      probability: prediction.likelyToBuySpa,
      estimatedRevenue: estimateByType.spa,
      reason: 'wellness affinity'
    },
    {
      type: 'experience',
      label: 'Local experience',
      probability: prediction.likelyToBuyExperience,
      estimatedRevenue: estimateByType.experience,
      reason: 'adventure or excursion affinity'
    },
    {
      type: 'upgrade',
      label: 'Room upgrade',
      probability: prediction.likelyToBuyUpgrade,
      estimatedRevenue: estimateByType.upgrade,
      reason: pmsIntelligenceContext?.upgradeEligible ? 'PMS upgrade eligible' : 'luxury affinity'
    },
    {
      type: 'late_checkout',
      label: 'Late checkout',
      probability: prediction.likelyToBuyLateCheckout,
      estimatedRevenue: estimateByType.late_checkout,
      reason: pmsIntelligenceContext?.lateCheckoutEligible ? 'pre-checkout timing' : 'revenue potential'
    },
    {
      type: 'transfer',
      label: 'Transfer',
      probability: prediction.likelyToBuyTransfer,
      estimatedRevenue: estimateByType.transfer,
      reason: 'transfer or travel logistics affinity'
    }
  ].sort((a, b) => b.probability - a.probability);

  return opportunities.filter((item) => item.probability >= 0.35);
};

export const generateUpsellRecommendations = ({ guestIntelligence = {}, revenuePrediction = null, pmsIntelligenceContext = null } = {}) => (
  detectRevenueOpportunities({ guestIntelligence, revenuePrediction, pmsIntelligenceContext })
    .slice(0, 3)
    .map((opportunity) => ({
      ...opportunity,
      suggestedTiming: opportunity.type === 'late_checkout'
        ? 'pre_checkout'
        : opportunity.type === 'transfer'
          ? 'pre_arrival_or_pre_departure'
          : 'in_conversation',
      tone: opportunity.probability >= 0.7 ? 'high_confidence' : 'soft_suggestion'
    }))
);

export const generateRevenueActions = ({ guestIntelligence = {}, revenuePrediction = null, pmsIntelligenceContext = null } = {}) => {
  const recommendations = generateUpsellRecommendations({ guestIntelligence, revenuePrediction, pmsIntelligenceContext });
  return recommendations.map((recommendation) => ({
    title: `Suggest ${recommendation.label}`,
    actionType: recommendation.type,
    probability: recommendation.probability,
    estimatedRevenue: recommendation.estimatedRevenue,
    reason: recommendation.reason
  }));
};

export const generateAutomationSuggestions = ({ guestIntelligence = {}, revenuePrediction = null, pmsIntelligenceContext = null } = {}) => {
  const recommendations = generateUpsellRecommendations({ guestIntelligence, revenuePrediction, pmsIntelligenceContext });
  return recommendations.map((recommendation) => ({
    automationType: recommendation.type === 'spa'
      ? 'spa_upsell'
      : recommendation.type === 'experience'
        ? 'experience_recommendation'
        : recommendation.type === 'late_checkout'
          ? 'late_checkout_offer'
          : recommendation.type === 'transfer'
            ? 'transfer_offer'
            : 'vip_followup',
    reason: recommendation.reason,
    expectedRevenue: recommendation.estimatedRevenue,
    conversionProbability: recommendation.probability
  }));
};

export const calculateUpsellProbability = ({ offerType, guestIntelligence = {}, pmsIntelligenceContext = null } = {}) => {
  const prediction = predictLikelyConversions({ guestIntelligence, pmsIntelligenceContext });
  const mapping = {
    spa: prediction.likelyToBuySpa,
    spa_upsell: prediction.likelyToBuySpa,
    transfer: prediction.likelyToBuyTransfer,
    airport_transfer: prediction.likelyToBuyTransfer,
    experience: prediction.likelyToBuyExperience,
    experience_recommendation: prediction.likelyToBuyExperience,
    room_upgrade: prediction.likelyToBuyUpgrade,
    upgrade: prediction.likelyToBuyUpgrade,
    late_checkout: prediction.likelyToBuyLateCheckout
  };

  return mapping[offerType] || prediction.conversionProbability;
};

export const persistRevenuePrediction = async ({
  hotelId,
  guestId,
  reservationId = null,
  prediction,
  metadata = {}
} = {}) => {
  if (!hotelId || !guestId || !prediction) return null;
  const supabase = getSupabase();
  return safeDb(() => supabase
    .from('guest_revenue_predictions')
    .insert({
      hotel_id: hotelId,
      guest_id: guestId,
      reservation_id: reservationId,
      likely_to_buy_spa: prediction.likelyToBuySpa,
      likely_to_buy_transfer: prediction.likelyToBuyTransfer,
      likely_to_buy_experience: prediction.likelyToBuyExperience,
      likely_to_buy_upgrade: prediction.likelyToBuyUpgrade,
      likely_to_buy_late_checkout: prediction.likelyToBuyLateCheckout,
      estimated_revenue: prediction.estimatedRevenue,
      conversion_probability: prediction.conversionProbability,
      prediction_confidence: prediction.predictionConfidence,
      metadata
    })
    .select('*')
    .single(), null, 'insert_guest_revenue_prediction');
};
