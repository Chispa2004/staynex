import { NextResponse } from 'next/server';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
import {
  getOnboardingContext,
  getPilotOnboardingSummaryForContext,
  ONBOARDING_STEPS,
  updateOnboardingState
} from '@/lib/onboarding';
import { canModifyPilotProtectedConfig, normalizePilotOnboardingStep } from '@/lib/pilot-onboarding';

const jsonError = (message, status = 500) => NextResponse.json({
  ok: false,
  error: message
}, { status });

const normalizeStep = (step) => (
  ONBOARDING_STEPS.includes(normalizePilotOnboardingStep(step)) ? normalizePilotOnboardingStep(step) : ONBOARDING_STEPS[0]
);

export async function GET(request) {
  try {
    const context = await getOnboardingContext(request);
    const { hotel, role, platformRole, fallback, state, schemaReady, warning } = context;
    const pilot = await getPilotOnboardingSummaryForContext(context);

    return NextResponse.json({
      ok: true,
      hotel,
      role,
      platformRole,
      fallback,
      state,
      pilot,
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
    const { supabase, hotel, role, user, platformRole, fallback, schemaReady, state: previousState } = await getOnboardingContext(request);

    if (!schemaReady) {
      return jsonError('La tabla de onboarding no está instalada todavía.', 400);
    }

    if (!canModifyPilotProtectedConfig({ role, platformRole, fallback })) {
      return jsonError('No tienes permiso para modificar la configuración piloto.', 403);
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
