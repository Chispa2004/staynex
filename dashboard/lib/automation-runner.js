const AUTOMATION_TYPES = [
  'pre_arrival_7d',
  'pre_arrival_1d',
  'in_stay_upsell',
  'post_stay_review'
];

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
    .in('automation_type', AUTOMATION_TYPES);

  if (error) {
    console.warn('Automation rules unavailable, using implicit rules', error.message);
    return new Map();
  }

  return new Map((data || []).map((rule) => [rule.automation_type, rule]));
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
  const inserted = [];

  for (const reservation of reservations || []) {
    for (const automationType of AUTOMATION_TYPES) {
      const scheduledFor = scheduledForType(reservation, automationType);

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

      const rule = rulesByType.get(automationType);
      const record = {
        hotel_id: hotel.id,
        reservation_id: reservation.id,
        guest_id: reservation.guest_id || null,
        conversation_id: null,
        automation_rule_id: rule?.id || null,
        automation_type: automationType,
        channel: rule?.channel || 'whatsapp',
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
        ai_model: 'dashboard-template',
        automation_fallback: true,
        metadata: {
          source: 'dashboard_run_scheduler'
        },
        updated_at: new Date().toISOString()
      };
      const { data: scheduledMessage, error: insertError } = await supabase
        .from('scheduled_messages')
        .insert(record)
        .select('*')
        .single();

      if (insertError) {
        throw insertError;
      }

      inserted.push(scheduledMessage);
    }
  }

  return inserted;
};
