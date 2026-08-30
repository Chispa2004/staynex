import { getCurrentHotelForRequest } from './current-hotel';
import {
  buildPilotOnboardingSummary,
  normalizePilotCompletedSteps,
  normalizePilotOnboardingStep,
  PILOT_ONBOARDING_STEPS
} from './pilot-onboarding.js';
import {
  pmsConnectionInternalSelectForSurface,
  serializePmsConnectionsSafe
} from '../../shared/pms/safe-connection.js';
import { getHotelOperationalHealth } from './system-health.js';

const PMS_ONBOARDING_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings');

export const ONBOARDING_STEPS = PILOT_ONBOARDING_STEPS.map((step) => step.id);

export const isMissingOnboardingSchema = (error) => (
  error?.message?.includes('hotel_onboarding_state')
  || error?.details?.includes('hotel_onboarding_state')
  || error?.hint?.includes('hotel_onboarding_state')
);

const normalizeCompletedSteps = (value) => {
  if (Array.isArray(value)) {
    return normalizePilotCompletedSteps(value);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? normalizePilotCompletedSteps(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
};

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Pilot onboarding data unavailable', error.message);
    }

    return fallback;
  }

  return data || fallback;
};

const loadKnowledgeEntries = async ({ supabase, hotelId }) => {
  const result = await supabase
    .from('hotel_knowledge')
    .select('id, hotel_id, title, key, category, value, is_active, updated_at')
    .eq('hotel_id', hotelId)
    .limit(200);

  if (!result.error) {
    return result.data || [];
  }

  if (
    result.error?.message?.includes('title')
    || result.error?.message?.includes('category')
    || result.error?.message?.includes('is_active')
    || result.error?.details?.includes('title')
    || result.error?.details?.includes('category')
    || result.error?.details?.includes('is_active')
  ) {
    return safeRows(
      supabase
        .from('hotel_knowledge')
        .select('id, hotel_id, key, value')
        .eq('hotel_id', hotelId)
        .limit(200)
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('Pilot onboarding knowledge unavailable', result.error.message);
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
      current_step: normalizePilotOnboardingStep(existing.current_step),
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
    current_step: normalizePilotOnboardingStep(data.current_step),
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
    current_step: normalizePilotOnboardingStep(currentStep || ONBOARDING_STEPS[0]),
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
    current_step: normalizePilotOnboardingStep(data.current_step),
    completed_steps: normalizeCompletedSteps(data.completed_steps)
  };
};

export const getPilotOnboardingSummaryForContext = async ({
  supabase,
  hotel,
  role,
  platformRole,
  fallback
}) => {
  const hotelId = hotel?.id;

  if (!hotelId) {
    return buildPilotOnboardingSummary({
      hotel,
      role,
      platformRole,
      fallback
    });
  }

  const [
    users,
    pmsConnections,
    knowledgeEntries,
    localKnowledge,
    operationalHealth
  ] = await Promise.all([
    safeRows(
      supabase
        .from('hotel_users')
        .select('id, hotel_id, user_id, email, role, status, created_at, updated_at')
        .eq('hotel_id', hotelId)
        .limit(200)
    ),
    safeRows(
      supabase
        .from('hotel_pms_connections')
        .select(PMS_ONBOARDING_SELECT)
        .eq('hotel_id', hotelId)
        .order('updated_at', { ascending: false })
        .limit(20)
    ),
    loadKnowledgeEntries({ supabase, hotelId }),
    safeRows(
      supabase
        .from('local_knowledge_items')
        .select('id, hotel_id, title, description, active, updated_at')
        .eq('hotel_id', hotelId)
        .limit(200)
    ),
    getHotelOperationalHealth({
      supabase,
      hotelId,
      hotel
    }).catch(() => null)
  ]);

  return buildPilotOnboardingSummary({
    hotel,
    users,
    pmsConnections: serializePmsConnectionsSafe(pmsConnections, { surface: 'tenant_settings' }),
    knowledgeEntries,
    localKnowledge,
    operationalHealth,
    role,
    platformRole,
    fallback
  });
};
