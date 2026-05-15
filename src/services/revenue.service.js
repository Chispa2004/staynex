import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

export const UPSELL_REVENUE_DEFAULTS = {
  late_checkout: 40,
  room_upgrade: 120,
  airport_transfer: 60,
  spa: 80,
  romantic_package: 150,
  dinner: 90,
  breakfast_upgrade: 25,
  early_checkin: 45,
  luggage_storage: 15,
  shower_room: 35,
  wine: 55,
  family_activities: 50,
  extra_bed: 35,
  babysitting: 80,
  kids_menu: 25,
  vip_welcome: 75
};

const isMissingRevenueTable = (error) => (
  error?.message?.includes('upsell_conversions')
  || error?.details?.includes('upsell_conversions')
  || error?.hint?.includes('upsell_conversions')
);

export const getDefaultUpsellAmount = (upsellType) => (
  UPSELL_REVENUE_DEFAULTS[upsellType] || 50
);

export const createConversion = async ({
  hotelId,
  guestId = null,
  reservationId = null,
  conversationId = null,
  upsellId = null,
  upsellType,
  source = 'ai_upsell',
  status = 'pending',
  estimatedAmount = null,
  currency = 'EUR',
  notes = null
}) => {
  try {
    const supabase = getSupabase();
    let existing = null;

    if (upsellId) {
      const { data, error } = await supabase
        .from('upsell_conversions')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('upsell_id', upsellId)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      existing = data;
    }

    const record = {
      hotel_id: hotelId,
      guest_id: guestId,
      reservation_id: reservationId,
      conversation_id: conversationId,
      upsell_id: upsellId,
      upsell_type: upsellType,
      source,
      status,
      estimated_amount: estimatedAmount ?? getDefaultUpsellAmount(upsellType),
      currency,
      notes,
      updated_at: new Date().toISOString()
    };
    const query = existing?.id
      ? supabase.from('upsell_conversions').update(record).eq('id', existing.id)
      : supabase.from('upsell_conversions').insert(record);
    const { data, error } = await query
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    if (isMissingRevenueTable(error)) {
      logger.warn('upsell_conversions table missing; revenue conversion skipped');
      return null;
    }

    throw error;
  }
};

const updateConversionStatus = async ({ conversionId, status, fields = {} }) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('upsell_conversions')
      .update({
        status,
        ...fields,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversionId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    if (isMissingRevenueTable(error)) {
      logger.warn('upsell_conversions table missing; conversion status update skipped');
      return null;
    }

    throw error;
  }
};

export const markConversionSent = (conversionId) => updateConversionStatus({
  conversionId,
  status: 'sent',
  fields: { offer_sent_at: new Date().toISOString() }
});

export const markConversionAccepted = (conversionId) => updateConversionStatus({
  conversionId,
  status: 'accepted',
  fields: { accepted_at: new Date().toISOString() }
});

export const markConversionRejected = (conversionId) => updateConversionStatus({
  conversionId,
  status: 'rejected'
});

export const calculateRevenueTotals = async ({ hotelId, since = null } = {}) => {
  const supabase = getSupabase();
  let query = supabase
    .from('upsell_conversions')
    .select('*');

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }

  if (since) {
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRevenueTable(error)) {
      return {
        totalEstimatedRevenue: 0,
        acceptedRevenue: 0,
        totalConversions: 0,
        acceptedConversions: 0,
        conversionRate: 0,
        revenueByType: {},
        estimatedMonthlyRevenue: 0
      };
    }

    throw error;
  }

  const conversions = data || [];
  const accepted = conversions.filter((item) => item.status === 'accepted');
  const revenueByType = conversions.reduce((acc, item) => {
    acc[item.upsell_type] = (acc[item.upsell_type] || 0) + Number(item.estimated_amount || 0);
    return acc;
  }, {});

  return {
    totalEstimatedRevenue: conversions.reduce((total, item) => total + Number(item.estimated_amount || 0), 0),
    acceptedRevenue: accepted.reduce((total, item) => total + Number(item.estimated_amount || 0), 0),
    totalConversions: conversions.length,
    acceptedConversions: accepted.length,
    conversionRate: conversions.length ? Math.round((accepted.length / conversions.length) * 100) : 0,
    revenueByType,
    estimatedMonthlyRevenue: conversions.reduce((total, item) => total + Number(item.estimated_amount || 0), 0)
  };
};
