import { NextResponse } from 'next/server';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
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
    const { supabase, hotel, role, user, platformRole, schemaReady, state: previousState } = await getOnboardingContext(request);

    if (!schemaReady) {
      return jsonError('Run supabase/sql/create_hotel_onboarding.sql before saving onboarding state', 400);
    }

    if (platformRole === 'support') {
      return jsonError('Support sessions are read-only by default', 403);
    }

    const body = await request.json().catch(() => ({}));
    const state = await updateOnboardingState({
      supabase,
      hotelId: hotel.id,
      currentStep: normalizeStep(body.current_step || body.currentStep),
      completedSteps: body.completed_steps || body.completedSteps || [],
      completed: body.onboarding_completed ?? body.completed ?? false
    });

    if (state.onboarding_completed && !previousState?.onboarding_completed) {
      await writeEnterpriseAuditLog({
        supabase,
        request,
        actor: user,
        actorRole: role,
        actorPlatformRole: platformRole,
        hotelId: hotel.id,
        action: 'onboarding_completed',
        entityType: 'hotel_onboarding_state',
        entityId: state.id,
        oldValues: previousState || {},
        newValues: state,
        metadata: { source: 'dashboard_onboarding' }
      });
    }

    return NextResponse.json({
      ok: true,
      hotel,
      state
    });
  } catch (error) {
    return jsonError(error.message || 'Could not save onboarding state', 400);
  }
}
