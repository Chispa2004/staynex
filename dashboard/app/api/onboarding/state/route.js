import { NextResponse } from 'next/server';
import { getOnboardingContext, ONBOARDING_STEPS, updateOnboardingState } from '@/lib/onboarding';

const jsonError = (message, status = 500) => NextResponse.json({
  ok: false,
  error: message
}, { status });

const normalizeStep = (step) => (
  ONBOARDING_STEPS.includes(step) ? step : ONBOARDING_STEPS[0]
);

export async function GET(request) {
  try {
    const { hotel, role, fallback, state, schemaReady, warning } = await getOnboardingContext(request);

    return NextResponse.json({
      ok: true,
      hotel,
      role,
      fallback,
      state,
      schemaReady,
      warning: warning || null,
      steps: ONBOARDING_STEPS
    });
  } catch (error) {
    return jsonError(error.message || 'Could not load onboarding state');
  }
}

export async function PATCH(request) {
  try {
    const { supabase, hotel, schemaReady } = await getOnboardingContext(request);

    if (!schemaReady) {
      return jsonError('Run supabase/sql/create_hotel_onboarding.sql before saving onboarding state', 400);
    }

    const body = await request.json().catch(() => ({}));
    const state = await updateOnboardingState({
      supabase,
      hotelId: hotel.id,
      currentStep: normalizeStep(body.current_step || body.currentStep),
      completedSteps: body.completed_steps || body.completedSteps || [],
      completed: body.onboarding_completed ?? body.completed ?? false
    });

    return NextResponse.json({
      ok: true,
      hotel,
      state
    });
  } catch (error) {
    return jsonError(error.message || 'Could not save onboarding state', 400);
  }
}
