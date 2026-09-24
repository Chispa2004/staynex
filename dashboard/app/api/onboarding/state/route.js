import { assertHotelIdMatchesContext } from '../../../../../shared/location/hotel-location-integrity.js';
import { readHotelJson, validateHotelFields, validationError } from '../../../../../shared/onboarding/hotel-fields.js';
import { NextResponse } from 'next/server';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
import {
  getOnboardingContext,
  getPilotOnboardingSummaryForContext,
  ONBOARDING_STEPS,
  updateOnboardingState
} from '@/lib/onboarding';
import { canModifyPilotProtectedConfig, normalizePilotOnboardingStep } from '@/lib/pilot-onboarding';

const jsonError = (message, status = 500, fields) => NextResponse.json({
  ok: false,
  error: message,
  fields
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
    return jsonError(error.message || 'No se pudo cargar el estado.', error.status || 503);
  }
}

export async function PATCH(request) {
  try {
    const context = await getOnboardingContext(request);
    const { supabase, hotel, role, user, platformRole, fallback, schemaReady, state: previousState } = context;

    if (!schemaReady) {
      return jsonError('La tabla de onboarding no está instalada todavía.', 503);
    }

    if (!canModifyPilotProtectedConfig({ role, platformRole, fallback })) {
      return jsonError('No tienes permiso para modificar la configuración piloto.', 403);
    }

    const body = await readHotelJson(request);
    assertHotelIdMatchesContext({ requestedHotelId: body.hotelId || body.hotel_id, currentHotelId: hotel.id });
    for (const key of ['onboarding_completed','completed']) if (Object.hasOwn(body,key) && typeof body[key] !== 'boolean') {
      throw validationError({_form:'Indica un estado de finalización válido.'},400);
    }
    for (const key of ['current_step','currentStep','hotelId','hotel_id']) if (Object.hasOwn(body,key) && (typeof body[key] !== 'string' || !body[key].trim())) {
      throw validationError({_form:'El hotel y el paso deben ser identificadores válidos.'},400);
    }
    const complete = body.onboarding_completed ?? body.completed ?? false;
    if (typeof complete !== 'boolean') throw validationError({_form:'Indica un estado de finalización válido.'},400);
    const step = body.current_step ?? body.currentStep ?? previousState?.current_step ?? 'hotel';
    if (typeof step !== 'string' || ![...ONBOARDING_STEPS,'hotel_setup'].includes(step)) {
      throw validationError({_form:'Selecciona un paso válido.'},400);
    }
    // Re-read the persisted dependencies. Client-supplied completed_steps never
    // establish readiness, and a missing dependency cannot count as completed.
    const pilot = await getPilotOnboardingSummaryForContext(context, {strict:complete});
    if (complete) {
      validateHotelFields({name:hotel.name,country_code:hotel.country_code,city:hotel.city,timezone:hotel.timezone});
      if (pilot.completion?.canCompleteConfiguration !== true) {
        return jsonError('Todavía hay requisitos pendientes. Revisa la preparación del hotel y vuelve a intentarlo.',422);
      }
    }
    const state = await updateOnboardingState({
      supabase, hotelId: hotel.id, currentStep: normalizeStep(step),
      completedSteps: pilot.blocks.filter(block => block.status === 'COMPLETADO').map(block => block.id),
      completed: complete
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
      state,
      redirectHref: complete ? '/dashboard/health' : null
    });
  } catch (error) {
    return jsonError(error.status ? error.message : 'No se pudo guardar el progreso. Reintenta.', error.status || 503, error.fields);
  }
}
