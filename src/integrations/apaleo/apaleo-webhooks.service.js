import { createHash } from 'node:crypto';
import { scheduleReservationAutomations } from '../../services/automation.service.js';
import { reconcileReservationAutomationLifecycle } from '../../services/automation-reconciliation.service.js';
import { connectionToApaleoConfig } from '../../services/pms-connections.service.js';
import { createOrUpdateReservation } from '../../services/reservation.service.js';
import { getSupabase } from '../../services/supabase.service.js';
import { logger } from '../../utils/logger.js';
import { getReservationById } from './apaleo-reservations.service.js';
import { normalizeApaleoReservation } from './apaleo-normalizer.service.js';
import { isReservationTerminalForAutomations } from '../../../shared/automations/reservation-lifecycle.js';
import { pmsConnectionSelectForSurface } from '../../../shared/pms/safe-connection.js';

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
const PMS_WEBHOOK_CONNECTION_SELECT = pmsConnectionSelectForSurface('tenant_settings');

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

const stableHash = (value) => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const isUniqueViolation = (error) => (
  error?.code === '23505'
  || String(error?.message || '').toLowerCase().includes('duplicate key')
  || String(error?.details || '').toLowerCase().includes('already exists')
);

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
  ) || stableHash({
    provider: 'apaleo',
    eventType,
    eventAction,
    externalResourceId,
    createdAt: payload.createdAt || payload.created_at || payload.timestamp || null,
    payload
  });
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
        error: error.message
      });
    }
  } catch (error) {
    logger.warn('Apaleo webhook connection status update failed', {
      connectionId,
      error: error.message
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
        error: error.message
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('PMS webhook event update failed', {
      eventId,
      error: error.message
    });
    return null;
  }
};

const findExistingWebhookEvent = async (parsed, { supabase = getSupabase() } = {}) => {
  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .select('*')
      .eq('provider', parsed.provider)
      .eq('external_event_id', parsed.externalEventId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('PMS webhook duplicate lookup failed', { error: error.message });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('PMS webhook duplicate lookup failed', { error: error.message });
    return null;
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
        error: error.message
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('PMS webhook claim reread failed', {
      eventId,
      error: error.message
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

export const resolveHotelConnectionFromWebhook = async (payload = {}, headers = {}, { supabase = getSupabase() } = {}) => {
  const parsed = parseApaleoWebhookEvent(payload, headers);
  let query = supabase
    .from('hotel_pms_connections')
    .select(PMS_WEBHOOK_CONNECTION_SELECT)
    .eq('provider', 'apaleo');

  if (parsed.connectionId) {
    query = query.eq('id', parsed.connectionId);
  } else if (parsed.accountCode) {
    query = query.eq('account_code', parsed.accountCode);
  } else {
    query = query.eq('enabled', true);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const createWebhookEvent = async ({ parsed, connection, supabase }) => {
  const existing = await findExistingWebhookEvent(parsed, { supabase });

  if (shouldIgnoreExistingEvent(existing)) {
    logger.info('Apaleo webhook duplicate ignored', {
      eventId: existing.id,
      externalEventId: parsed.externalEventId
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
    return {
      event: existing,
      duplicate: false
    };
  }

  try {
    const { data, error } = await supabase
      .from('pms_webhook_events')
      .insert({
        hotel_id: connection?.hotel_id || null,
        provider: parsed.provider,
        connection_id: connection?.id || null,
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
        const existingAfterConflict = await findExistingWebhookEvent(parsed, { supabase });

        if (shouldIgnoreExistingEvent(existingAfterConflict)) {
          return {
            event: existingAfterConflict,
            duplicate: true,
            reason: getWebhookEventStatus(existingAfterConflict) === 'processed'
              ? 'already_processed'
              : 'already_ignored'
          };
        }

        if (existingAfterConflict) {
          return {
            event: existingAfterConflict,
            duplicate: false
          };
        }

        throw new Error('PMS webhook unique conflict could not be resolved');
      }

      throw error;
    }

    return {
      event: data,
      duplicate: false
    };
  } catch (error) {
    logger.warn('PMS webhook event persistence failed', {
      error: error.message
    });

    throw error;
  }
};

export const claimWebhookEventForProcessing = async ({
  event,
  parsed,
  connection = null,
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

  const previousStatus = getWebhookEventStatus(event);
  const claimUpdates = {
    hotel_id: connection?.hotel_id || event.hotel_id || null,
    connection_id: connection?.id || event.connection_id || null,
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
    .in('status', WEBHOOK_CLAIMABLE_STATUSES)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.warn('Apaleo webhook event claim failed', {
      eventId: event.id,
      provider: parsed?.provider || event.provider || null,
      externalEventId: parsed?.externalEventId || event.external_event_id || null,
      previousStatus,
      error: error.message
    });
    throw error;
  }

  if (data) {
    const claimResult = previousStatus === 'failed' ? 'retry_claimed' : 'claimed';
    logger.info('Apaleo webhook event claim acquired', {
      eventId: data.id,
      provider: data.provider || parsed?.provider || null,
      externalEventId: data.external_event_id || parsed?.externalEventId || null,
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
    ? await findExistingWebhookEvent(parsed, { supabase })
    : await findWebhookEventById(event.id, { supabase });
  const currentEvent = current || event;
  const classification = classifyUnclaimedWebhookEvent(currentEvent);

  logger.info('Apaleo webhook event claim skipped', {
    eventId: currentEvent?.id || event.id,
    provider: parsed?.provider || currentEvent?.provider || null,
    externalEventId: parsed?.externalEventId || currentEvent?.external_event_id || null,
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
      error: error.message
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

  let lookup = supabase
    .from('reservations')
    .select('*')
    .eq('pms_provider', 'apaleo')
    .eq('pms_reservation_id', reservationId);

  if (hotelId) {
    lookup = lookup.eq('hotel_id', hotelId);
  }

  const { data: previousReservation, error: lookupError } = await lookup
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  let query = supabase
    .from('reservations')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('pms_provider', 'apaleo')
    .eq('pms_reservation_id', reservationId);

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }

  const { data, error } = await query.select('*').maybeSingle();

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
  parsed,
  statusOverride = null,
  supabase,
  fetchReservationById = getReservationById
}) => {
  if (!parsed.externalResourceId) {
    throw new Error('Apaleo webhook did not include a reservation id');
  }

  const config = connection ? connectionToApaleoConfig(connection) : null;
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
        hotelId: connection?.hotel_id || null,
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
    hotel_id: connection?.hotel_id || null
  }, {
    source: 'apaleo_webhook',
    sourceEventId: parsed.externalEventId,
    supabase
  });

  if (!isReservationTerminalForAutomations(reservation.status)) {
    await scheduleReservationAutomations(reservation, { supabase });
  }

  logger.info('Apaleo webhook reservation synced', {
    reservationId: reservation.id,
    pmsReservationId: reservation.pms_reservation_id,
    status: reservation.status
  });

  return {
    reservation,
    fetched: true
  };
};

export const handleReservationCreated = async ({ connection, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  parsed,
  supabase,
  fetchReservationById
});

export const handleReservationAmended = async ({ connection, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  parsed,
  supabase,
  fetchReservationById
});

export const handleReservationCanceled = async ({ connection, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  parsed,
  supabase,
  fetchReservationById,
  statusOverride: 'cancelled'
});

export const handleReservationDeleted = async ({ connection, parsed, supabase, fetchReservationById }) => syncFetchedReservation({
  connection,
  parsed,
  supabase,
  fetchReservationById,
  statusOverride: 'deleted'
});

const runActionHandler = async ({ connection, parsed, supabase, fetchReservationById }) => {
  if (parsed.eventAction === 'created') {
    return handleReservationCreated({ connection, parsed, supabase, fetchReservationById });
  }

  if (parsed.eventAction === 'amended') {
    return handleReservationAmended({ connection, parsed, supabase, fetchReservationById });
  }

  if (parsed.eventAction === 'canceled') {
    return handleReservationCanceled({ connection, parsed, supabase, fetchReservationById });
  }

  if (parsed.eventAction === 'deleted') {
    return handleReservationDeleted({ connection, parsed, supabase, fetchReservationById });
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
  let storedEvent = null;
  let hasProcessingClaim = false;

  try {
    connection = await resolveHotelConnectionFromWebhook(payload, headers, { supabase });
    logger.info('Apaleo webhook connection resolved', {
      connectionId: connection?.id || null,
      hotelId: connection?.hotel_id || null,
      accountCode: connection?.account_code || parsed.accountCode || null
    });

    const { event, duplicate, reason } = await createWebhookEvent({
      parsed,
      connection,
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
      connection,
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
      reservationId: result.reservation?.id || null
    });

    return {
      ok: true,
      status: 'processed',
      event: storedEvent,
      reservation: result.reservation || null
    };
  } catch (error) {
    logger.warn('Apaleo webhook event failed', {
      externalEventId: parsed.externalEventId,
      externalResourceId: parsed.externalResourceId,
      error: error.message
    });

    if (hasProcessingClaim) {
      await updateWebhookEvent(storedEvent?.id, {
        status: 'failed',
        error: error.message,
        processed_at: null
      }, { supabase });
    }

    await safeUpdateConnection(connection?.id, {
      webhook_status: 'failed',
      last_webhook_at: new Date().toISOString(),
      last_webhook_error: error.message
    }, { supabase });

    return {
      ok: false,
      status: 'failed',
      error: error.message,
      event: storedEvent
    };
  }
};
