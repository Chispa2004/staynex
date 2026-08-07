import { AUTOMATION_RUNTIME_VERSION } from './automation-catalog.js';

export const AUTOMATION_RUN_HOTEL_HEADER = 'x-staynex-hotel-id';
export const UNKNOWN_SUPABASE_PROJECT_REF = 'unknown';

const numberOrZero = (value) => Number(value || 0);

export const getSupabaseProjectRefFromUrl = (value) => {
  const text = String(value || '').trim();

  if (!text) {
    return UNKNOWN_SUPABASE_PROJECT_REF;
  }

  try {
    const url = new URL(text);

    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
    ) {
      return UNKNOWN_SUPABASE_PROJECT_REF;
    }

    const hostnameParts = url.hostname.toLowerCase().split('.');

    if (hostnameParts.length !== 3) {
      return UNKNOWN_SUPABASE_PROJECT_REF;
    }

    const [projectRef, domain, tld] = hostnameParts;

    return domain === 'supabase' && tld === 'co' && /^[a-z0-9-]+$/.test(projectRef) && projectRef
      ? projectRef
      : UNKNOWN_SUPABASE_PROJECT_REF;
  } catch {
    return UNKNOWN_SUPABASE_PROJECT_REF;
  }
};

export const buildAutomationEnvironmentDiagnostic = ({ env = process.env } = {}) => {
  const serverSupabaseProjectRef = getSupabaseProjectRefFromUrl(env?.SUPABASE_URL);
  const publicSupabaseProjectRef = getSupabaseProjectRefFromUrl(env?.NEXT_PUBLIC_SUPABASE_URL);
  const projectsMatch = (
    serverSupabaseProjectRef !== UNKNOWN_SUPABASE_PROJECT_REF
    && publicSupabaseProjectRef !== UNKNOWN_SUPABASE_PROJECT_REF
    && serverSupabaseProjectRef === publicSupabaseProjectRef
  );

  return {
    serverSupabaseProjectRef,
    publicSupabaseProjectRef,
    projectsMatch
  };
};

export const logAutomationEnvironmentDiagnostic = ({
  request = null,
  hotel = null,
  environmentDiagnostic = buildAutomationEnvironmentDiagnostic(),
  logger = console
} = {}) => {
  const logPayload = {
    event: 'automation_preview_environment',
    requestId: getAutomationRunRequestId(request),
    hotelId: hotel?.id || null,
    serverSupabaseProjectRef: environmentDiagnostic.serverSupabaseProjectRef,
    publicSupabaseProjectRef: environmentDiagnostic.publicSupabaseProjectRef,
    supabaseProjectsMatch: environmentDiagnostic.projectsMatch
  };

  if (typeof logger?.info === 'function') {
    logger.info(logPayload);
  } else if (typeof logger?.log === 'function') {
    logger.log(logPayload);
  }

  return logPayload;
};

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
  request = null,
  environmentDiagnostic = buildAutomationEnvironmentDiagnostic()
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
    environmentDiagnostic,
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
  canAccess,
  env = process.env,
  logger = console
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

  const environmentDiagnostic = buildAutomationEnvironmentDiagnostic({ env });
  logAutomationEnvironmentDiagnostic({
    request,
    hotel: context.hotel,
    environmentDiagnostic,
    logger
  });

  const result = await runDashboardAutomationScheduler({
    supabase: context.supabase,
    hotel: context.hotel
  });

  return {
    status: 200,
    body: buildAutomationRunResponse({
      hotel: context.hotel,
      summary: result.summary,
      request,
      environmentDiagnostic
    })
  };
};
