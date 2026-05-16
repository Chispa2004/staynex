import { getCurrentHotelForRequest } from './current-hotel';

export const ONBOARDING_STEPS = [
  'hotel_setup',
  'pms_connection',
  'whatsapp_setup',
  'knowledge_base',
  'ai_concierge',
  'automations',
  'test_flow',
  'completion'
];

export const isMissingOnboardingSchema = (error) => (
  error?.message?.includes('hotel_onboarding_state')
  || error?.details?.includes('hotel_onboarding_state')
  || error?.hint?.includes('hotel_onboarding_state')
);

const normalizeCompletedSteps = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

export const getOrCreateOnboardingState = async ({ supabase, hotelId }) => {
  const { data: existing, error: existingError } = await supabase
    .from('hotel_onboarding_state')
    .select('*')
    .eq('hotel_id', hotelId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return {
      ...existing,
      completed_steps: normalizeCompletedSteps(existing.completed_steps)
    };
  }

  const { data, error } = await supabase
    .from('hotel_onboarding_state')
    .insert({
      hotel_id: hotelId,
      current_step: ONBOARDING_STEPS[0],
      completed_steps: []
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    completed_steps: normalizeCompletedSteps(data.completed_steps)
  };
};

export const getOnboardingContext = async (request) => {
  const { supabase, hotel, role, fallback, user, platformRole } = await getCurrentHotelForRequest(request);

  if (!hotel?.id) {
    throw new Error('Hotel is required for onboarding');
  }

  try {
    const state = await getOrCreateOnboardingState({
      supabase,
      hotelId: hotel.id
    });

    return {
      supabase,
      hotel,
      role,
      fallback,
      user,
      platformRole,
      state,
      schemaReady: true
    };
  } catch (error) {
    if (isMissingOnboardingSchema(error)) {
      return {
        supabase,
        hotel,
        role,
        fallback,
        user,
        platformRole,
        state: {
          hotel_id: hotel.id,
          current_step: ONBOARDING_STEPS[0],
          completed_steps: [],
          onboarding_completed: true,
          onboarding_completed_at: null
        },
        schemaReady: false,
        warning: 'hotel_onboarding_state table is not installed yet'
      };
    }

    throw error;
  }
};

export const updateOnboardingState = async ({
  supabase,
  hotelId,
  currentStep,
  completedSteps,
  completed = false
}) => {
  const normalizedCompletedSteps = [...new Set(normalizeCompletedSteps(completedSteps))];
  const payload = {
    hotel_id: hotelId,
    current_step: currentStep || ONBOARDING_STEPS[0],
    completed_steps: normalizedCompletedSteps,
    onboarding_completed: Boolean(completed),
    onboarding_completed_at: completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('hotel_onboarding_state')
    .upsert(payload, {
      onConflict: 'hotel_id'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    completed_steps: normalizeCompletedSteps(data.completed_steps)
  };
};
