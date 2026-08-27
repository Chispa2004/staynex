import { scheduleReservationAutomations } from '../../services/automation.service.js';
import { reconcileReservationAutomationLifecycle } from '../../services/automation-reconciliation.service.js';
import { connectionToApaleoConfig } from '../../services/pms-connections.service.js';
import {
  PmsReservationTenantCollisionError,
  assertTenantScopedPmsReservationIdentity,
  createOrUpdateReservation
} from '../../services/reservation.service.js';
import {
  hashSafeWebhookValue,
  sanitizeWebhookErrorCode,
  writePmsWebhookQuarantine
} from '../../services/pms-webhook-quarantine.service.js';
import { getSupabase } from '../../services/supabase.service.js';
import { logger } from '../../utils/logger.js';
import { getReservationById } from './apaleo-reservations.service.js';
import { normalizeApaleoReservation } from './apaleo-normalizer.service.js';
import { isReservationTerminalForAutomations } from '../../../shared/automations/reservation-lifecycle.js';
import { pmsConnectionInternalSelectForSurface } from '../../../shared/pms/safe-connection.js';

const RESERVATION_ACTIONS = {
  created: 'created',
  amended: 'amended',
  updated: 'amended',
  modified: 'amended',
  canceled: 'canceled',
  cancelled: 'canceled',
  deleted: 'deleted'
};

const WEBHOOK_CLAIMABLE_STATUSES = ['received', 'failed'];
const WEBHOOK_TERMINAL_STATUSES = ['processed', 'ignored'];
const WEBHOOK_PROCESSING_STATUS = 'processing';
const PMS_WEBHOOK_CONNECTION_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings');

const readHeader = (headers, name) => {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || null;
  }

  return headers[name] || headers[name.toLowerCase()] || null;
};

const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || null;

const getNested = (object, paths) => {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], object);

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const isUniqueViolation = (error) => (
  error?.code === '23505'
  || String(error?.message || '').toLowerCase().includes('duplicate key')
  || String(error?.details || '').toLowerCase().includes('already exists')
);

export class PmsWebhookRuntimeBlockedError extends Error {
  constructor(reasonCode, message = reasonCode, details = {}) {
    super(message);
    this.name = 'PmsWebhookRuntimeBlockedError';
    this.reasonCode = reasonCode;
    this.safeFlags = details.safeFlags || {};
    this.candidateConnectionId = details.candidateConnectionId || null;
  }
}

const safeRuntimeErrorMessage = (error) => sanitizeWebhookErrorCode(error);

const assertRuntimeCondition = (condition, reasonCode, message, details = {}) => {
  if (!condition) {
    throw new PmsWebhookRuntimeBlockedError(reasonCode, message, details);
  }
};

const normalizeAction = (eventType, explicitAction) => {
  const candidates = [
    explicitAction,
    eventType,
    eventType?.split('.').pop(),
    eventType?.split('/').pop(),
    eventType?.split(':').pop()
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = String(candidate).toLowerCase().replace(/reservation[_\-.]/g, '').trim();

    if (RESERVATION_ACTIONS[normalized]) {
      return RESERVATION_ACTIONS[normalized];
    }
  }

  return null;
};

export const parseApaleoWebhookEvent = (payload = {}, headers = {}) => {
  const eventType = firstText(
    readHeader(headers, 'x-apaleo-event-type'),
    payload.type,
    payload.eventType,
    payload.event_type,
    payload.topic,
    payload.name,
    payload.event?.type,
    payload.event?.name
  ) || 'unknown';
  const eventAction = normalizeAction(eventType, firstText(payload.action, payload.event?.action));
  const externalResourceId = firstText(
    readHeader(headers, 'x-apaleo-resource-id'),
    getNested(payload, [
      'reservationId',
      'reservation_id',
      'resourceId',
      'resource.id',
      'entityId',
      'entity.id',
      'data.id',
      'reservation.id',
      'content.id',
      'payload.id'
    ])
  );
  const externalEventId = firstText(
    readHeader(headers, 'x-apaleo-event-id'),
    payload.id,
    payload.eventId,
    payload.event_id,
    payload.event?.id
  );
  const accountCode = firstText(
    readHeader(headers, 'x-apaleo-account-code'),
    payload.accountCode,
    payload.account_code,
    payload.account?.code,
    payload.tenant,
    payload.tenantId
  );
  const connectionId = firstText(
    readHeader(headers, 'x-staynex-connection-id'),
    payload.connection_id,
    payload.connectionId
  );

  return {
    provider: 'apaleo',
    externalEventId,
    externalResourceId,
    eventType,
    eventAction,
    accountCode,
    connectionId,
    payload
  };
};

const safeUpdateConnection = async (connectionId, updates, { supabase = getSupabase() } = {}) => {
  if (!connectionId) {
    return;
  }

  try {
    const { error } = await supabase
      .from('hotel_pms_connections')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId);

    if (error) {
      logger.warn('Apaleo webhook connection status update failed', {
        connectionId,
        error: safeRuntimeErrorMessage(error)
      });
    }
  } catch (error) {
    logger.warn('Apaleo webhook connection status update failed', {
      connectionId,
      error: safeRuntimeErrorMessage(error)
    });
  }
};

const updateWebhookEvent = async (eventId, updates, { supabase = getSupabase() } = {}) => {
  if (!eventId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .update(updates)
      .eq('id', eventId)
      .select('*')
      .single();

    if (error) {
      logger.warn('PMS webhook event update failed', {
        eventId,
        error: safeRuntimeErrorMessage(error)
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('PMS webhook event update failed', {
      eventId,
      error: safeRuntimeErrorMessage(error)
    });
    return null;
  }
};

const findExistingWebhookEvent = async (parsed, {
  connectionId,
  supabase = getSupabase()
} = {}) => {
  if (!parsed?.provider || !parsed?.externalEventId || !connectionId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .select('*')
      .eq('provider', parsed.provider)
      .eq('connection_id', connectionId)
      .eq('external_event_id', parsed.externalEventId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('PMS webhook duplicate lookup failed', { error: safeRuntimeErrorMessage(error) });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('PMS webhook duplicate lookup failed', { error: safeRuntimeErrorMessage(error) });
    return null;
  }
};

const findLegacyGlobalWebhookEvents = async (parsed, { supabase = getSupabase() } = {}) => {
  if (!parsed?.provider || !parsed?.externalEventId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .select('*')
      .eq('provider', parsed.provider)
      .eq('external_event_id', parsed.externalEventId)
      .limit(2);

    if (error) {
      logger.warn('PMS webhook legacy identity lookup failed', { error: safeRuntimeErrorMessage(error) });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.warn('PMS webhook legacy identity lookup failed', { error: safeRuntimeErrorMessage(error) });
    return [];
  }
};

const findWebhookEventById = async (eventId, { supabase = getSupabase() } = {}) => {
  if (!eventId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .select('*')
      .eq('id', eventId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('PMS webhook claim reread failed', {
        eventId,
        error: safeRuntimeErrorMessage(error)
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('PMS webhook claim reread failed', {
      eventId,
      error: safeRuntimeErrorMessage(error)
    });
    return null;
  }
};

const getWebhookEventStatus = (event) => String(event?.status || '').toLowerCase();

const shouldIgnoreExistingEvent = (event) => WEBHOOK_TERMINAL_STATUSES.includes(getWebhookEventStatus(event));

const classifyUnclaimedWebhookEvent = (event) => {
  const status = getWebhookEventStatus(event);

  if (status === WEBHOOK_PROCESSING_STATUS) {
    return {
      status: 'duplicate_processing',
      reason: 'already_processing'
    };
  }

  if (status === 'processed') {
    return {
      status: 'ignored',
      reason: 'already_processed'
    };
  }

  if (status === 'ignored') {
    return {
      status: 'ignored',
      reason: 'already_ignored'
    };
  }

  return {
    status: 'duplicate_processing',
    reason: 'claim_conflict'
  };
};

const buildSafeWebhookEventPayload = (parsed) => ({
  provider: parsed.provider,
  external_event_id: parsed.externalEventId,
  external_resource_id: parsed.externalResourceId,
  event_type: parsed.eventType,
  event_action: parsed.eventAction,
  account_code_present: Boolean(parsed.accountCode),
  connection_id_present: Boolean(parsed.connectionId)
});

const buildQuarantineHashes = (parsed) => ({
  requestHash: hashSafeWebhookValue({
    provider: parsed.provider,
    event_type: parsed.eventType || null,
    event_action: parsed.eventAction || null,
    external_event_id_present: Boolean(parsed.externalEventId),
    external_resource_id_present: Boolean(parsed.externalResourceId),
    account_code_present: Boolean(parsed.accountCode),
    connection_id_present: Boolean(parsed.connectionId)
  }),
  eventHash: parsed.externalEventId
    ? hashSafeWebhookValue({
      provider: parsed.provider,
      external_event_id: parsed.externalEventId
    })
    : null
});

const quarantineWebhookRuntimeBlock = async ({
  parsed,
  reasonCode,
  candidateConnectionId = null,
  safeFlags = {},
  supabase
}) => {
  const hashes = buildQuarantineHashes(parsed);
  const quarantineResult = await writePmsWebhookQuarantine({
    provider: parsed.provider || 'unknown',
    reasonCode,
    requestHash: hashes.requestHash,
    eventHash: hashes.eventHash,
    candidateConnectionId,
    safeFlags: {
      provider: parsed.provider || 'unknown',
      event_type: parsed.eventType || null,
      event_action: parsed.eventAction || null,
      external_event_id_present: Boolean(parsed.externalEventId),
      external_resource_id_present: Boolean(parsed.externalResourceId),
      reservation_identity_present: Boolean(parsed.externalResourceId),
      account_code_present: Boolean(parsed.accountCode),
      connection_id_present: Boolean(parsed.connectionId),
      ...safeFlags
    },
    supabase
  });

  return {
    ok: quarantineResult.ok,
    status: quarantineResult.ok ? 'quarantined' : 'quarantine_failed',
    reason: reasonCode,
    quarantine: quarantineResult.quarantine || null,
    error: quarantineResult.ok ? null : quarantineResult.errorCode
  };
};

const validateApaleoWebhookRequest = async ({
  payload,
  headers,
  parsed,
  options
}) => {
  if (options.validationResult) {
    return options.validationResult;
  }

  if (typeof options.validateWebhookRequest !== 'function') {
    return {
      ok: false,
      reasonCode: 'VALIDATION_NOT_CONFIGURED',
      safeFlags: {
        validation_configured: false,
        validation_result: 'not_configured'
      }
    };
  }

  const validation = await options.validateWebhookRequest({
    payload,
    headers,
    parsed
  });

  if (validation?.ok === true) {
    return {
      ok: true,
      safeFlags: {
        validation_configured: true,
        validation_result: 'valid'
      }
    };
  }

  return {
    ok: false,
    reasonCode: validation?.reasonCode === 'MISSING_SIGNATURE'
      ? 'MISSING_SIGNATURE'
      : 'INVALID_SIGNATURE',
    safeFlags: {
      validation_configured: true,
      validation_result: validation?.reasonCode === 'MISSING_SIGNATURE' ? 'missing' : 'invalid'
    }
  };
};

const normalizeValidatedConnectionContext = (context = {}) => {
  if (!context) {
    return null;
  }

  const connection = context.connection || context;

  if (!connection?.id || !connection?.hotel_id) {
    return null;
  }

  return {
    provider: context.provider || connection.provider || 'apaleo',
    connectionId: context.connectionId || connection.id,
    hotelId: context.hotelId || connection.hotel_id,
    connection
  };
};

const classifyConnectionRows = ({ rows, parsed }) => {
  if (rows.length === 0) {
    return {
      ok: false,
      reasonCode: 'UNKNOWN_CONNECTION',
      candidateConnectionId: parsed.connectionId || null,
      safeFlags: {
        connection_lookup: parsed.connectionId ? 'connection_id_not_found' : 'account_code_not_found'
      }
    };
  }

  if (rows.length > 1) {
    return {
      ok: false,
      reasonCode: 'AMBIGUOUS_CONNECTION',
      candidateConnectionId: null,
      safeFlags: {
        connection_lookup: 'ambiguous'
      }
    };
  }

  const connection = rows[0];

  if (connection.enabled === false) {
    return {
      ok: false,
      reasonCode: 'CONNECTION_DISABLED',
      candidateConnectionId: connection.id || parsed.connectionId || null,
      safeFlags: {
        connection_lookup: 'disabled'
      }
    };
  }

  if (!connection.hotel_id) {
    return {
      ok: false,
      reasonCode: 'TENANT_MISMATCH',
      candidateConnectionId: connection.id || parsed.connectionId || null,
      safeFlags: {
        connection_lookup: 'missing_hotel_id',
        hotel_id_present: false
      }
    };
  }

  return {
    ok: true,
    context: normalizeValidatedConnectionContext({
      provider: 'apaleo',
      connection,
      connectionId: connection.id,
      hotelId: connection.hotel_id
    }),
    safeFlags: {
      connection_lookup: parsed.connectionId ? 'connection_id' : 'account_code',
      hotel_id_present: true,
      tenant_context_present: true
    }
  };
};

const resolveValidatedApaleoConnection = async (parsed, {
  supabase = getSupabase(),
  validatedConnectionContext = null
} = {}) => {
  const providedContext = normalizeValidatedConnectionContext(validatedConnectionContext);

  if (providedContext) {
    return {
      ok: true,
      context: providedContext,
      safeFlags: {
        connection_lookup: 'provided_validated_context',
        hotel_id_present: true,
        tenant_context_present: true
      }
    };
  }

  let query = supabase
    .from('hotel_pms_connections')
    .select(PMS_WEBHOOK_CONNECTION_SELECT)
    .eq('provider', 'apaleo');

  if (parsed.connectionId) {
    query = query.eq('id', parsed.connectionId);
  } else if (parsed.accountCode) {
    query = query.eq('account_code', parsed.accountCode);
  } else {
    return {
      ok: false,
      reasonCode: 'UNKNOWN_CONNECTION',
      candidateConnectionId: null,
      safeFlags: {
        connection_lookup: 'missing_connection_hint'
      }
    };
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(2);

  if (error) {
    throw error;
  }

  return classifyConnectionRows({
    rows: data || [],
    parsed
  });
};

export const resolveHotelConnectionFromWebhook = async (payload = {}, headers = {}, options = {}) => {
  const parsed = parseApaleoWebhookEvent(payload, headers);

  assertRuntimeCondition(
    options.validationResult?.ok === true || options.validatedConnectionContext,
    'VALIDATION_NOT_CONFIGURED',
    'Apaleo webhook connection resolution requires prior validation',
    {
      candidateConnectionId: parsed.connectionId,
      safeFlags: {
        validation_configured: false,
        validation_result: 'not_configured'
      }
    }
  );

  const resolved = await resolveValidatedApaleoConnection(parsed, {
    supabase: options.supabase || getSupabase(),
    validatedConnectionContext: options.validatedConnectionContext
  });

  if (!resolved.ok) {
    throw new PmsWebhookRuntimeBlockedError(resolved.reasonCode, 'Apaleo webhook connection could not be resolved', {
      candidateConnectionId: resolved.candidateConnectionId,
      safeFlags: resolved.safeFlags || {}
    });
  }

  return resolved.context || null;
};

const isSameTenantWebhookEvent = (event, context) => (
  event?.provider === context.provider
  && event?.connection_id === context.connectionId
  && event?.hotel_id === context.hotelId
);

const getLegacyGlobalWebhookCollision = async ({ parsed, context, supabase }) => {
  const globalMatches = await findLegacyGlobalWebhookEvents(parsed, { supabase });

  return globalMatches.find((event) => !isSameTenantWebhookEvent(event, context)) || null;
};

const assertWebhookEventMatchesTenant = (event, context) => {
  if (!event) {
    return;
  }

  if (event.connection_id === context.connectionId && event.hotel_id !== context.hotelId) {
    throw new PmsWebhookRuntimeBlockedError('TENANT_MISMATCH', 'PMS webhook event tenant mismatch', {
      candidateConnectionId: context.connectionId,
      safeFlags: {
        connection_lookup: 'event_tenant_mismatch'
      }
    });
  }

  assertRuntimeCondition(
    isSameTenantWebhookEvent(event, context),
    'LEGACY_GLOBAL_EVENT_COLLISION',
    'PMS webhook legacy global event collision',
    {
      candidateConnectionId: context.connectionId,
      safeFlags: {
        connection_lookup: 'legacy_global_event_collision'
      }
    }
  );
};

const createWebhookEvent = async ({ parsed, context, supabase }) => {
  assertRuntimeCondition(parsed.externalEventId, 'MISSING_EVENT_ID', 'Apaleo webhook did not include an event id', {
    candidateConnectionId: context.connectionId
  });
  assertRuntimeCondition(context?.connectionId && context?.hotelId, 'TENANT_MISMATCH', 'PMS webhook missing tenant context');

  const existing = await findExistingWebhookEvent(parsed, {
    connectionId: context.connectionId,
    supabase
  });

  if (shouldIgnoreExistingEvent(existing)) {
    assertWebhookEventMatchesTenant(existing, context);
    logger.info('Apaleo webhook duplicate ignored', {
      eventId: existing.id,
      externalEventId: parsed.externalEventId,
      connectionId: context.connectionId,
      hotelId: context.hotelId
    });
    return {
      event: existing,
      duplicate: true,
      reason: getWebhookEventStatus(existing) === 'processed'
        ? 'already_processed'
        : 'already_ignored'
    };
  }

  if (existing) {
    assertWebhookEventMatchesTenant(existing, context);
    return {
      event: existing,
      duplicate: false
    };
  }

  const legacyCollision = await getLegacyGlobalWebhookCollision({
    parsed,
    context,
    supabase
  });

  if (legacyCollision) {
    throw new PmsWebhookRuntimeBlockedError(
      legacyCollision.connection_id === context.connectionId
        ? 'TENANT_MISMATCH'
        : 'LEGACY_GLOBAL_EVENT_COLLISION',
      'PMS webhook legacy global event collision',
      {
        candidateConnectionId: context.connectionId,
        safeFlags: {
          connection_lookup: 'legacy_global_event_collision'
        }
      }
    );
  }

  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .insert({
        hotel_id: context.hotelId,
        provider: parsed.provider,
        connection_id: context.connectionId,
        external_event_id: parsed.externalEventId,
        external_resource_id: parsed.externalResourceId,
        event_type: parsed.eventType,
        event_action: parsed.eventAction,
        status: 'received',
        payload: buildSafeWebhookEventPayload(parsed)
      })
      .select('*')
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const existingAfterConflict = await findExistingWebhookEvent(parsed, {
          connectionId: context.connectionId,
          supabase
        });

        if (shouldIgnoreExistingEvent(existingAfterConflict)) {
          assertWebhookEventMatchesTenant(existingAfterConflict, context);
          return {
            event: existingAfterConflict,
            duplicate: true,
            reason: getWebhookEventStatus(existingAfterConflict) === 'processed'
              ? 'already_processed'
              : 'already_ignored'
          };
        }

        if (existingAfterConflict) {
          assertWebhookEventMatchesTenant(existingAfterConflict, context);
          return {
            event: existingAfterConflict,
            duplicate: false
          };
        }

        const conflictingLegacyEvent = await getLegacyGlobalWebhookCollision({
          parsed,
          context,
          supabase
        });

        if (conflictingLegacyEvent) {
          throw new PmsWebhookRuntimeBlockedError(
            conflictingLegacyEvent.connection_id === context.connectionId
              ? 'TENANT_MISMATCH'
              : 'LEGACY_GLOBAL_EVENT_COLLISION',
            'PMS webhook legacy global event collision',
            {
              candidateConnectionId: context.connectionId,
              safeFlags: {
                connection_lookup: 'legacy_global_event_collision'
              }
            }
          );
        }

        throw new PmsWebhookRuntimeBlockedError(
          'LEGACY_GLOBAL_EVENT_COLLISION',
          'PMS webhook unique conflict could not be resolved safely',
          {
            candidateConnectionId: context.connectionId,
            safeFlags: {
              connection_lookup: 'unresolved_unique_conflict'
            }
          }
        );
      }

      throw error;
    }

    return {
      event: data,
      duplicate: false
    };
  } catch (error) {
    logger.warn('PMS webhook event persistence failed', {
      error: safeRuntimeErrorMessage(error)
    });

    throw error;
  }
};

export const claimWebhookEventForProcessing = async ({
  event,
  parsed,
  connection = null,
  validatedContext = null,
  supabase = getSupabase()
} = {}) => {
  if (!event?.id) {
    return {
      claimed: false,
      event: event || null,
      duplicate: true,
      status: 'duplicate_processing',
      reason: 'missing_event_id'
    };
  }

  const context = normalizeValidatedConnectionContext(validatedContext || connection);

  assertRuntimeCondition(
    context?.connectionId && context?.hotelId,
    'TENANT_MISMATCH',
    'PMS webhook claim missing validated tenant context'
  );
  assertWebhookEventMatchesTenant(event, context);

  const previousStatus = getWebhookEventStatus(event);
  const claimUpdates = {
    hotel_id: context.hotelId,
    connection_id: context.connectionId,
    external_resource_id: parsed?.externalResourceId || event.external_resource_id || null,
    event_type: parsed?.eventType || event.event_type,
    event_action: parsed?.eventAction || event.event_action || null,
    status: WEBHOOK_PROCESSING_STATUS,
    payload: parsed ? buildSafeWebhookEventPayload(parsed) : event.payload || {},
    error: null,
    processed_at: null
  };

  const { data, error } = await supabase
    .from('pms_webhook_events')
    .update(claimUpdates)
    .eq('id', event.id)
    .eq('provider', context.provider)
    .eq('connection_id', context.connectionId)
    .eq('hotel_id', context.hotelId)
    .in('status', WEBHOOK_CLAIMABLE_STATUSES)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.warn('Apaleo webhook event claim failed', {
      eventId: event.id,
      provider: parsed?.provider || event.provider || null,
      externalEventId: parsed?.externalEventId || event.external_event_id || null,
      previousStatus,
      error: safeRuntimeErrorMessage(error)
    });
    throw error;
  }

  if (data) {
    const claimResult = previousStatus === 'failed' ? 'retry_claimed' : 'claimed';
    logger.info('Apaleo webhook event claim acquired', {
      eventId: data.id,
      provider: data.provider || parsed?.provider || null,
      externalEventId: data.external_event_id || parsed?.externalEventId || null,
      connectionId: context.connectionId,
      hotelId: context.hotelId,
      previousStatus,
      status: data.status,
      claimResult
    });

    return {
      claimed: true,
      event: data,
      duplicate: false,
      status: 'claimed',
      reason: claimResult
    };
  }

  const current = parsed?.provider && parsed?.externalEventId
    ? await findExistingWebhookEvent(parsed, {
      connectionId: context.connectionId,
      supabase
    })
    : await findWebhookEventById(event.id, { supabase });
  const currentEvent = current || event;
  const classification = classifyUnclaimedWebhookEvent(currentEvent);

  logger.info('Apaleo webhook event claim skipped', {
    eventId: currentEvent?.id || event.id,
    provider: parsed?.provider || currentEvent?.provider || null,
    externalEventId: parsed?.externalEventId || currentEvent?.external_event_id || null,
    connectionId: context.connectionId,
    hotelId: context.hotelId,
    observedStatus: currentEvent?.status || null,
    claimResult: classification.reason
  });

  return {
    claimed: false,
    event: currentEvent,
    duplicate: true,
    ...classification
  };
};

const reconcileApaleoReservationStatusChange = async ({
  previousReservation,
  currentReservation,
  sourceEventId,
  supabase
}) => {
  try {
    await reconcileReservationAutomationLifecycle({
      previousReservation,
      currentReservation,
      source: 'apaleo_webhook',
      sourceEventId,
      supabase
    });
  } catch (error) {
    logger.warn('Apaleo reservation automation reconciliation failed', {
      reservationId: currentReservation?.id || previousReservation?.id || null,
      hotelId: currentReservation?.hotel_id || previousReservation?.hotel_id || null,
      sourceEventId,
      error: safeRuntimeErrorMessage(error)
    });
    throw error;
  }
};

export const markLocalReservationStatus = async ({
  reservationId,
  status,
  hotelId,
  sourceEventId = null,
  supabase = getSupabase()
}) => {
  if (!reservationId) {
    return null;
  }

  assertRuntimeCondition(
    hotelId,
    'TENANT_MISMATCH',
    'Apaleo webhook reservation status update missing hotel context'
  );

  const lookup = supabase
    .from('reservations')
    .select('*')
    .eq('pms_provider', 'apaleo')
    .eq('pms_reservation_id', reservationId)
    .eq('hotel_id', hotelId);

  const { data: previousReservation, error: lookupError } = await lookup
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('pms_provider', 'apaleo')
    .eq('pms_reservation_id', reservationId)
    .eq('hotel_id', hotelId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    await reconcileApaleoReservationStatusChange({
      previousReservation,
      currentReservation: data,
      sourceEventId,
      supabase
    });
  }

  return data;
};

const syncFetchedReservation = async ({
  connection,
  validatedContext = null,
  parsed,
  statusOverride = null,
  supabase,
  fetchReservationById = getReservationById
}) => {
  if (!parsed.externalResourceId) {
    throw new Error('Apaleo webhook did not include a reservation id');
  }

  const context = normalizeValidatedConnectionContext(validatedContext || connection);

  assertRuntimeCondition(
    context?.connectionId && context?.hotelId,
    'TENANT_MISMATCH',
    'Apaleo webhook reservation fetch missing validated tenant context'
  );

  const config = connectionToApaleoConfig(context.connection);
  const rawReservation = await fetchReservationById({
    credentials: config,
    reservationId: parsed.externalResourceId
  });

  logger.info('Apaleo webhook reservation fetched', {
    reservationId: parsed.externalResourceId,
    found: Boolean(rawReservation)
  });

  if (!rawReservation) {
    if (statusOverride) {
      const updatedReservation = await markLocalReservationStatus({
        reservationId: parsed.externalResourceId,
        status: statusOverride,
        hotelId: context.hotelId,
        sourceEventId: parsed.externalEventId,
        supabase
      });

      return {
        reservation: updatedReservation,
        fetched: false
      };
    }

    throw new Error(`Apaleo reservation not found: ${parsed.externalResourceId}`);
  }

  const normalizedReservation = normalizeApaleoReservation(rawReservation);
  const normalized = {
    ...normalizedReservation,
    status: statusOverride || normalizedReservation?.status
  };

  if (!normalized?.pms_reservation_id) {
    throw new Error('Apaleo reservation could not be normalized');
  }

  const { reservation } = await createOrUpdateReservation({
    ...normalized,
    hotel_id: context.hotelId
  }, {
    source: 'apaleo_webhook',
    sourceEventId: parsed.externalEventId,
    requireExplicitHotelId: true,
    tenantScopedPmsIdentity: true,
    supabase
  });

  if (!isReservationTerminalForAutomations(reservation.status)) {
    await scheduleReservationAutomations(reservation, { supabase });
  }

  logger.info('Apaleo webhook reservation synced', {
    reservationId: reservation.id,
    hotelId: reservation.hotel_id || context.hotelId,
    pmsReservationId: reservation.pms_reservation_id,
    status: reservation.status
  });

  return {
    reservation,
    fetched: true
  };
};

export const handleReservationCreated = async ({ connection, validatedContext, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  validatedContext,
  parsed,
  supabase,
  fetchReservationById
});

export const handleReservationAmended = async ({ connection, validatedContext, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  validatedContext,
  parsed,
  supabase,
  fetchReservationById
});

export const handleReservationCanceled = async ({ connection, validatedContext, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  validatedContext,
  parsed,
  supabase,
  fetchReservationById,
  statusOverride: 'cancelled'
});

export const handleReservationDeleted = async ({ connection, validatedContext, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  validatedContext,
  parsed,
  supabase,
  fetchReservationById,
  statusOverride: 'deleted'
});

const runActionHandler = async ({ connection, validatedContext, parsed, supabase, fetchReservationById }) => {
  if (parsed.eventAction === 'created') {
    return handleReservationCreated({ connection, validatedContext, parsed, supabase, fetchReservationById });
  }

  if (parsed.eventAction === 'amended') {
    return handleReservationAmended({ connection, validatedContext, parsed, supabase, fetchReservationById });
  }

  if (parsed.eventAction === 'canceled') {
    return handleReservationCanceled({ connection, validatedContext, parsed, supabase, fetchReservationById });
  }

  if (parsed.eventAction === 'deleted') {
    return handleReservationDeleted({ connection, validatedContext, parsed, supabase, fetchReservationById });
  }

  return {
    ignored: true,
    reason: `Unsupported Apaleo webhook action: ${parsed.eventAction || parsed.eventType}`
  };
};

export const processApaleoWebhookEvent = async (payload = {}, headers = {}, options = {}) => {
  const parsed = parseApaleoWebhookEvent(payload, headers);
  const supabase = options.supabase || getSupabase();
  const fetchReservationById = options.fetchReservationById || getReservationById;

  logger.info('Apaleo webhook received', {
    eventType: parsed.eventType,
    eventAction: parsed.eventAction,
    externalEventId: parsed.externalEventId,
    externalResourceId: parsed.externalResourceId
  });

  let connection = null;
  let validatedContext = null;
  let storedEvent = null;
  let hasProcessingClaim = false;

  try {
    const validation = await validateApaleoWebhookRequest({
      payload,
      headers,
      parsed,
      options
    });

    if (!validation.ok) {
      return quarantineWebhookRuntimeBlock({
        parsed,
        reasonCode: validation.reasonCode || 'INVALID_SIGNATURE',
        candidateConnectionId: parsed.connectionId,
        safeFlags: validation.safeFlags || {},
        supabase
      });
    }

    const connectionResult = await resolveValidatedApaleoConnection(parsed, {
      supabase,
      validatedConnectionContext: options.validatedConnectionContext
    });

    if (!connectionResult.ok) {
      return quarantineWebhookRuntimeBlock({
        parsed,
        reasonCode: connectionResult.reasonCode,
        candidateConnectionId: connectionResult.candidateConnectionId,
        safeFlags: {
          ...(validation.safeFlags || {}),
          ...(connectionResult.safeFlags || {})
        },
        supabase
      });
    }

    validatedContext = connectionResult.context;
    connection = validatedContext.connection;
    logger.info('Apaleo webhook connection resolved', {
      connectionId: validatedContext.connectionId,
      hotelId: validatedContext.hotelId
    });

    if (!parsed.externalEventId) {
      return quarantineWebhookRuntimeBlock({
        parsed,
        reasonCode: 'MISSING_EVENT_ID',
        candidateConnectionId: validatedContext.connectionId,
        safeFlags: {
          ...(validation.safeFlags || {}),
          ...(connectionResult.safeFlags || {})
        },
        supabase
      });
    }

    if (parsed.eventAction && parsed.externalResourceId) {
      await assertTenantScopedPmsReservationIdentity({
        hotelId: validatedContext.hotelId,
        pmsProvider: parsed.provider,
        pmsReservationId: parsed.externalResourceId,
        supabase
      });
    }

    const { event, duplicate, reason } = await createWebhookEvent({
      parsed,
      context: validatedContext,
      supabase
    });
    storedEvent = event;

    if (duplicate) {
      return {
        ok: true,
        status: 'ignored',
        duplicate: true,
        reason,
        event: storedEvent
      };
    }

    const claim = await claimWebhookEventForProcessing({
      event: storedEvent,
      parsed,
      validatedContext,
      supabase
    });
    storedEvent = claim.event;

    if (!claim.claimed) {
      return {
        ok: true,
        status: claim.status,
        duplicate: true,
        reason: claim.reason,
        event: storedEvent
      };
    }

    hasProcessingClaim = true;

    if (!parsed.eventAction) {
      await updateWebhookEvent(storedEvent?.id, {
        status: 'ignored',
        error: 'Unsupported or unknown Apaleo event action',
        processed_at: new Date().toISOString()
      }, { supabase });
      return {
        ok: true,
        status: 'ignored',
        reason: 'unsupported_event_action'
      };
    }

    const result = await runActionHandler({
      connection,
      validatedContext,
      parsed,
      supabase,
      fetchReservationById
    });

    if (result.ignored) {
      await updateWebhookEvent(storedEvent?.id, {
        status: 'ignored',
        error: result.reason,
        processed_at: new Date().toISOString()
      }, { supabase });
      return {
        ok: true,
        status: 'ignored',
        reason: result.reason
      };
    }

    await updateWebhookEvent(storedEvent?.id, {
      status: 'processed',
      processed_at: new Date().toISOString()
    }, { supabase });
    await safeUpdateConnection(connection?.id, {
      webhook_enabled: true,
      webhook_status: 'received',
      last_webhook_at: new Date().toISOString(),
      last_webhook_error: null
    }, { supabase });

    logger.info('Apaleo webhook event processed', {
      eventId: storedEvent?.id || null,
      externalEventId: parsed.externalEventId,
      connectionId: validatedContext.connectionId,
      hotelId: validatedContext.hotelId,
      reservationId: result.reservation?.id || null
    });

    return {
      ok: true,
      status: 'processed',
      event: storedEvent,
      reservation: result.reservation || null
    };
  } catch (error) {
    if (error instanceof PmsReservationTenantCollisionError) {
      const quarantine = await quarantineWebhookRuntimeBlock({
        parsed,
        reasonCode: error.reasonCode,
        candidateConnectionId: validatedContext?.connectionId || parsed.connectionId || null,
        safeFlags: {
          connection_lookup: 'reservation_identity_collision',
          tenant_context_present: Boolean(validatedContext?.hotelId)
        },
        supabase
      });

      if (!hasProcessingClaim) {
        return quarantine;
      }
    }

    if (error instanceof PmsWebhookRuntimeBlockedError) {
      const quarantine = await quarantineWebhookRuntimeBlock({
        parsed,
        reasonCode: error.reasonCode,
        candidateConnectionId: error.candidateConnectionId || validatedContext?.connectionId || parsed.connectionId || null,
        safeFlags: error.safeFlags || {},
        supabase
      });

      if (!hasProcessingClaim) {
        return quarantine;
      }
    }

    const safeError = safeRuntimeErrorMessage(error);
    logger.warn('Apaleo webhook event failed', {
      externalEventId: parsed.externalEventId,
      externalResourceId: parsed.externalResourceId,
      error: safeError
    });

    if (hasProcessingClaim) {
      await updateWebhookEvent(storedEvent?.id, {
        status: 'failed',
        error: safeError,
        processed_at: null
      }, { supabase });
    }

    await safeUpdateConnection(connection?.id, {
      webhook_status: 'failed',
      last_webhook_at: new Date().toISOString(),
      last_webhook_error: safeError
    }, { supabase });

    return {
      ok: false,
      status: 'failed',
      error: safeError,
      event: storedEvent
    };
  }
};
