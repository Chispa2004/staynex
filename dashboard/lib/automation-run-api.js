import { AUTOMATION_RUNTIME_VERSION } from './automation-catalog.js';

export const AUTOMATION_RUN_HOTEL_HEADER = 'x-staynex-hotel-id';

const numberOrZero = (value) => Number(value || 0);

export const getExplicitAutomationRunHotelId = (request) => (
  String(request?.headers?.get?.(AUTOMATION_RUN_HOTEL_HEADER) || '').trim()
);

export const sanitizeAutomationRunHotel = (hotel = {}) => (
  hotel?.id
    ? {
      id: hotel.id,
      name: hotel.name || hotel.slug || 'Selected hotel'
    }
    : null
);

export const getAutomationRunRequestId = (request) => (
  request?.headers?.get?.('x-request-id')
  || request?.headers?.get?.('x-vercel-id')
  || null
);

export const buildAutomationRunResponse = ({
  hotel,
  summary = {},
  request = null
} = {}) => {
  const mode = summary.mode || 'preview';
  const evaluatedReservations = numberOrZero(summary.evaluatedReservations);
  const eligible = numberOrZero(summary.eligible);
  const preview = numberOrZero(summary.preview);
  const skipped = numberOrZero(summary.skipped);
  const duplicateCandidate = numberOrZero(summary.duplicateCandidate);
  const duplicateExisting = numberOrZero(summary.duplicateExisting);
  const blocked = numberOrZero(summary.blocked);
  const skipReasons = summary.skipReasons || {};

  return {
    ok: true,
    hotel: sanitizeAutomationRunHotel(hotel),
    hotelId: hotel?.id || null,
    evaluatedReservations,
    eligible,
    preview,
    scheduled: preview,
    previewGenerated: preview,
    skipped,
    duplicateCandidate,
    duplicateExisting,
    blocked,
    skipReasons,
    runtimeVersion: AUTOMATION_RUNTIME_VERSION,
    executionMode: mode,
    requestId: getAutomationRunRequestId(request),
    decisions: {
      mode,
      evaluatedReservations,
      eligible,
      preview,
      skipped,
      duplicateCandidate,
      duplicateExisting,
      blocked,
      skipReasons
    }
  };
};

export const buildAutomationRunErrorResponse = ({ status, error, request = null }) => ({
  status,
  body: {
    ok: false,
    hotel: null,
    hotelId: null,
    evaluatedReservations: 0,
    eligible: 0,
    preview: 0,
    scheduled: 0,
    previewGenerated: 0,
    skipped: 0,
    duplicateCandidate: 0,
    duplicateExisting: 0,
    blocked: 0,
    skipReasons: {},
    runtimeVersion: AUTOMATION_RUNTIME_VERSION,
    executionMode: 'preview',
    requestId: getAutomationRunRequestId(request),
    error
  }
});

export const handleAutomationRunPost = async ({
  request,
  getCurrentHotelForRequest,
  runDashboardAutomationScheduler,
  canAccess
}) => {
  const explicitHotelId = getExplicitAutomationRunHotelId(request);

  if (!explicitHotelId) {
    return buildAutomationRunErrorResponse({
      status: 400,
      error: 'Explicit hotelId is required for automation preview pass.',
      request
    });
  }

  const context = await getCurrentHotelForRequest(request);

  if (!context?.user?.id) {
    return buildAutomationRunErrorResponse({
      status: 403,
      error: 'Authentication required',
      request
    });
  }

  if (context.accessDenied) {
    return buildAutomationRunErrorResponse({
      status: 403,
      error: context.accessDeniedReason || 'Access denied',
      request
    });
  }

  if (context.fallback || !context.hotel?.id || context.hotel.id !== explicitHotelId) {
    return buildAutomationRunErrorResponse({
      status: 403,
      error: 'Access denied for requested hotel',
      request
    });
  }

  if (!canAccess(context.role, 'automations')) {
    return buildAutomationRunErrorResponse({
      status: 403,
      error: 'Access denied',
      request
    });
  }

  const result = await runDashboardAutomationScheduler({
    supabase: context.supabase,
    hotel: context.hotel
  });

  return {
    status: 200,
    body: buildAutomationRunResponse({
      hotel: context.hotel,
      summary: result.summary,
      request
    })
  };
};
