import {
  DEFAULT_INTELLIGENT_AUTOMATIONS,
  INTELLIGENT_AUTOMATION_TYPES,
  buildAutomationPreview,
  isMissingAutomationColumn,
  isMissingAutomationEngineTables,
  isRealAutomationId,
  mergeAutomationDefaults,
  scheduledForAutomation
} from '@/lib/automation-engine';

const LEGACY_AUTOMATION_TYPES = [
  'pre_arrival_7d',
  'pre_arrival_1d',
  'in_stay_upsell',
  'post_stay_review'
];

const AUTOMATION_TYPES = [
  ...LEGACY_AUTOMATION_TYPES,
  ...INTELLIGENT_AUTOMATION_TYPES
];

const PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE = 'pre_checkout_folio_reminder';

const addDays = (dateValue, days) => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const dateAtNoon = (dateValue) => dateValue ? `${dateValue}T12:00:00.000Z` : null;

const scheduledForType = (reservation, automationType) => {
  if (automationType === 'pre_arrival_7d') {
    return addDays(reservation.arrival_date, -7);
  }

  if (automationType === 'pre_arrival_1d') {
    return addDays(reservation.arrival_date, -1);
  }

  if (automationType === 'in_stay_upsell') {
    return dateAtNoon(reservation.arrival_date);
  }

  if (automationType === 'post_stay_review') {
    return addDays(reservation.departure_date, 1);
  }

  return null;
};

const dayKey = (value) => String(value || '').slice(0, 10);

const dayBounds = (dateValue) => {
  const date = new Date(dateValue);

  return {
    start: new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0
    )).toISOString(),
    end: new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
      0,
      0,
      0
    )).toISOString()
  };
};

const previewForType = ({ hotel, reservation, automationType }) => {
  if (INTELLIGENT_AUTOMATION_TYPES.includes(automationType)) {
    return buildAutomationPreview({
      hotel,
      reservation,
      automationType,
      language: hotel?.default_language || 'es'
    });
  }

  const hotelName = hotel?.name || 'the hotel';
  const firstName = reservation.guest_name?.split(' ')[0] || '';
  const prefix = firstName ? `${firstName}, ` : '';

  const templates = {
    pre_arrival_7d: `Hi ${prefix}we are looking forward to welcoming you to ${hotelName}. If you need transfer, parking or recommendations before arrival, we can help here.`,
    pre_arrival_1d: `Hi ${prefix}your arrival is tomorrow. You can message us here for anything you need before you arrive.`,
    in_stay_upsell: `Hi ${prefix}we hope you are enjoying your stay. If you need restaurant, spa or late checkout assistance, we can help here.`,
    post_stay_review: `Hi ${prefix}thank you for staying at ${hotelName}. We would love to hear your feedback about your stay.`
  };

  return templates[automationType] || templates.pre_arrival_1d;
};

const getRulesByType = async ({ supabase, hotelId }) => {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('automation_type', LEGACY_AUTOMATION_TYPES);

  if (error) {
    console.warn('Automation rules unavailable, using implicit rules', error.message);
    return new Map();
  }

  return new Map((data || []).map((rule) => [rule.automation_type, rule]));
};

const getEngineAutomationsByType = async ({ supabase, hotelId }) => {
  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('hotel_id', hotelId);

  if (error) {
    if (isMissingAutomationEngineTables(error)) {
      return new Map(DEFAULT_INTELLIGENT_AUTOMATIONS.map((automation) => [automation.type, automation]));
    }

    throw error;
  }

  return new Map(mergeAutomationDefaults(data || []).map((automation) => [automation.type, automation]));
};

const alreadyScheduled = async ({
  supabase,
  reservationId,
  automationType,
  scheduledFor
}) => {
  const bounds = dayBounds(scheduledFor);
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('automation_type', automationType)
    .gte('scheduled_for', bounds.start)
    .lt('scheduled_for', bounds.end)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
};

const insertScheduledMessage = async ({ supabase, record }) => {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .insert(record)
    .select('*')
    .single();

  if (!error) {
    return data;
  }

  if (!isMissingAutomationColumn(error)) {
    throw error;
  }

  const fallbackRecord = { ...record };
  delete fallbackRecord.estimated_revenue;
  delete fallbackRecord.revenue_owner;
  delete fallbackRecord.cooldown_applied;
  delete fallbackRecord.fatigue_score;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('scheduled_messages')
    .insert(fallbackRecord)
    .select('*')
    .single();

  if (fallbackError) {
    throw fallbackError;
  }

  return fallbackData;
};

const insertAutomationRun = async ({
  supabase,
  hotel,
  reservation,
  automation,
  scheduledMessage,
  scheduledFor,
  fatigueScore
}) => {
  const automationId = isRealAutomationId(automation?.id) ? automation.id : null;
  const estimatedRevenue = Number(automation?.actions?.estimated_revenue || 0);
  const record = {
    automation_id: automationId,
    hotel_id: hotel.id,
    guest_id: reservation.guest_id || null,
    reservation_id: reservation.id || null,
    conversation_id: null,
    trigger_type: automation.trigger_type || automation.triggerType || automation.type,
    automation_type: automation.type,
    message_sent: false,
    translated_language: hotel.default_language || 'es',
    converted: false,
    revenue_generated: 0,
    revenue_owner: automation.type === 'experience_recommendation' ? 'staynex' : 'hotel',
    scheduled_message_id: scheduledMessage?.id || null,
    status: 'scheduled',
    cooldown_applied: false,
    fatigue_score: fatigueScore,
    metadata: {
      source: 'dashboard_run_scheduler',
      scheduled_for: scheduledFor,
      estimated_revenue: estimatedRevenue,
      safety: {
        cooldown_minutes: automation.cooldown_minutes,
        max_per_guest: automation.max_per_guest,
        quiet_hours_ready: true,
        opt_out_ready: true
      }
    },
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('automation_runs')
    .insert(record)
    .select('*')
    .single();

  if (error) {
    if (!isMissingAutomationEngineTables(error) && !isMissingAutomationColumn(error)) {
      console.warn('automation_run_insert_failed', error.message);
    }

    return null;
  }

  return data;
};

const isVipReservation = (reservation = {}) => {
  const text = [
    reservation.guest_name,
    reservation.room_type,
    reservation.rate_plan,
    reservation.pms_status,
    reservation.metadata?.tags,
    reservation.metadata?.notes
  ].filter(Boolean).join(' ').toLowerCase();

  return /vip|suite|premium|luxury|honeymoon|anniversary/.test(text);
};

const automationMatchesReservation = ({ automationType, reservation }) => {
  const today = new Date().toISOString().slice(0, 10);
  const arrival = reservation.arrival_date;
  const departure = reservation.departure_date;
  const signals = [
    reservation.guest_notes,
    reservation.notes,
    reservation.metadata?.interests,
    reservation.metadata?.last_intent
  ].filter(Boolean).join(' ').toLowerCase();

  if (LEGACY_AUTOMATION_TYPES.includes(automationType)) {
    return true;
  }

  if (automationType === 'welcome_message') {
    return reservation.status === 'checked_in' || arrival === today;
  }

  if (automationType === 'late_checkout_offer') {
    return departure === today || departure === new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  }

  if (automationType === 'transfer_offer') {
    return arrival === today || arrival === new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  }

  if (automationType === 'spa_upsell') {
    return /spa|wellness|hammam|massage|relax|bienestar|masaje/.test(signals);
  }

  if (automationType === 'experience_recommendation') {
    return /experience|tour|excursion|actividad|agafay|atlas|boat|catamaran/.test(signals);
  }

  if (automationType === 'restaurant_promotion') {
    return ['checked_in', 'in_house'].includes(reservation.status);
  }

  if (automationType === 'vip_followup') {
    return isVipReservation(reservation);
  }

  if (automationType === 'birthday_message') {
    return /birthday|cumple|anniversary|honeymoon|celebration/.test(signals);
  }

  if (automationType === 'abandoned_interest_followup') {
    return /interested|me interesa|tell me more|details|availability/.test(signals);
  }

  if (automationType === 'weather_trigger') {
    return false;
  }

  return false;
};

export const runDashboardAutomationScheduler = async ({
  supabase,
  hotel
}) => {
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotel.id)
    .in('status', ['confirmed', 'checked_in', 'in_house'])
    .order('arrival_date', { ascending: true, nullsFirst: false })
    .limit(250);

  if (error) {
    throw error;
  }

  const rulesByType = await getRulesByType({
    supabase,
    hotelId: hotel.id
  });
  const engineAutomationsByType = await getEngineAutomationsByType({
    supabase,
    hotelId: hotel.id
  });
  const inserted = [];

  for (const reservation of reservations || []) {
    for (const automationType of AUTOMATION_TYPES) {
      if (automationType === PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE) {
        continue;
      }

      const engineAutomation = engineAutomationsByType.get(automationType);
      const isIntelligent = INTELLIGENT_AUTOMATION_TYPES.includes(automationType);
      const rule = rulesByType.get(automationType);
      const automation = isIntelligent ? engineAutomation : {
        id: rule?.id || null,
        type: automationType,
        name: automationType,
        active: rule?.is_active !== false,
        trigger_type: automationType,
        audience_type: 'reservation_journey',
        cooldown_minutes: 1440,
        max_per_guest: 1,
        actions: {
          channel: rule?.channel || 'whatsapp',
          estimated_revenue: 0
        }
      };

      if (automation?.active === false || automation?.is_active === false) {
        continue;
      }

      if (!automationMatchesReservation({ automationType, reservation })) {
        continue;
      }

      const scheduledFor = isIntelligent
        ? scheduledForAutomation({ automationType, reservation })
        : scheduledForType(reservation, automationType);

      if (!scheduledFor) {
        continue;
      }

      if (await alreadyScheduled({
        supabase,
        reservationId: reservation.id,
        automationType,
        scheduledFor
      })) {
        continue;
      }

      const fatigueScore = 0.18;
      const metadata = {
        source: 'dashboard_run_scheduler',
        engine: isIntelligent ? 'intelligent_automation_engine' : 'legacy_automation_rules',
        trigger_type: automation.trigger_type || automationType,
        audience_type: automation.audience_type || 'all_guests',
        safety: {
          cooldown_minutes: automation.cooldown_minutes || 1440,
          max_per_guest: automation.max_per_guest || 1,
          fatigue_score: fatigueScore,
          quiet_hours_ready: true,
          opt_out_ready: true
        }
      };
      const record = {
        hotel_id: hotel.id,
        reservation_id: reservation.id,
        guest_id: reservation.guest_id || null,
        conversation_id: null,
        automation_rule_id: !isIntelligent ? rule?.id || null : null,
        automation_type: automationType,
        channel: automation?.actions?.channel || rule?.channel || 'whatsapp',
        scheduled_for: scheduledFor,
        send_to: reservation.guest_phone || null,
        language: hotel.default_language || 'es',
        message_preview: previewForType({
          hotel,
          reservation,
          automationType
        }),
        status: 'scheduled',
        ai_provider: 'mock',
        ai_model: isIntelligent ? 'automation-intelligence-template' : 'dashboard-template',
        automation_fallback: true,
        estimated_revenue: Number(automation?.actions?.estimated_revenue || 0),
        revenue_owner: automationType === 'experience_recommendation' ? 'staynex' : 'hotel',
        cooldown_applied: false,
        fatigue_score: fatigueScore,
        metadata,
        updated_at: new Date().toISOString()
      };

      const scheduledMessage = await insertScheduledMessage({ supabase, record });
      await insertAutomationRun({
        supabase,
        hotel,
        reservation,
        automation,
        scheduledMessage,
        scheduledFor,
        fatigueScore
      });

      inserted.push(scheduledMessage);
    }
  }

  return inserted;
};
