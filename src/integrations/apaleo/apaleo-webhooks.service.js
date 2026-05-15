import { createHash } from 'node:crypto';
import { scheduleReservationAutomations } from '../../services/automation.service.js';
import { connectionToApaleoConfig } from '../../services/pms-connections.service.js';
import { createOrUpdateReservation } from '../../services/reservation.service.js';
import { getSupabase } from '../../services/supabase.service.js';
import { logger } from '../../utils/logger.js';
import { getReservationById } from './apaleo-reservations.service.js';
import { normalizeApaleoReservation } from './apaleo-normalizer.service.js';

const RESERVATION_ACTIONS = {
  created: 'created',
  amended: 'amended',
  updated: 'amended',
  modified: 'amended',
  canceled: 'canceled',
  cancelled: 'canceled',
  deleted: 'deleted'
};

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

const safeUpdateConnection = async (connectionId, updates) => {
  if (!connectionId) {
    return;
  }

  try {
    const { error } = await getSupabase()
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

const updateWebhookEvent = async (eventId, updates) => {
  if (!eventId) {
    return null;
  }

  try {
    const { data, error } = await getSupabase()
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

const findExistingWebhookEvent = async (parsed) => {
  try {
    const { data, error } = await getSupabase()
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

const shouldIgnoreExistingEvent = (event) => ['processed', 'ignored'].includes(event?.status);

export const resolveHotelConnectionFromWebhook = async (payload = {}, headers = {}) => {
  const parsed = parseApaleoWebhookEvent(payload, headers);
  const client = getSupabase();
  let query = client
    .from('hotel_pms_connections')
    .select('*')
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

const createWebhookEvent = async ({ parsed, connection }) => {
  const existing = await findExistingWebhookEvent(parsed);

  if (shouldIgnoreExistingEvent(existing)) {
    logger.info('Apaleo webhook duplicate ignored', {
      eventId: existing.id,
      externalEventId: parsed.externalEventId
    });
    return {
      event: existing,
      duplicate: true
    };
  }

  if (existing) {
    const updated = await updateWebhookEvent(existing.id, {
      status: 'received',
      error: null,
      payload: parsed.payload,
      processed_at: null
    });

    return {
      event: updated || existing,
      duplicate: false
    };
  }

  try {
    const { data, error } = await getSupabase()
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
        payload: parsed.payload
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const existingAfterConflict = await findExistingWebhookEvent(parsed);

        if (shouldIgnoreExistingEvent(existingAfterConflict)) {
          return {
            event: existingAfterConflict,
            duplicate: true
          };
        }

        if (existingAfterConflict) {
          const updated = await updateWebhookEvent(existingAfterConflict.id, {
            status: 'received',
            error: null,
            payload: parsed.payload,
            processed_at: null
          });

          return {
            event: updated || existingAfterConflict,
            duplicate: false
          };
        }

        return {
          event: null,
          duplicate: true
        };
      }

      throw error;
    }

    return {
      event: data,
      duplicate: false
    };
  } catch (error) {
    logger.warn('PMS webhook event persistence failed; continuing processing', {
      error: error.message
    });

    return {
      event: null,
      duplicate: false
    };
  }
};

const markLocalReservationStatus = async ({ reservationId, status, hotelId }) => {
  if (!reservationId) {
    return null;
  }

  let query = getSupabase()
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

  return data;
};

const syncFetchedReservation = async ({ connection, parsed, statusOverride = null }) => {
  if (!parsed.externalResourceId) {
    throw new Error('Apaleo webhook did not include a reservation id');
  }

  const config = connection ? connectionToApaleoConfig(connection) : null;
  const rawReservation = await getReservationById({
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
        hotelId: connection?.hotel_id || null
      });

      return {
        reservation: updatedReservation,
        fetched: false
      };
    }

    throw new Error(`Apaleo reservation not found: ${parsed.externalResourceId}`);
  }

  const normalized = {
    ...normalizeApaleoReservation(rawReservation),
    status: statusOverride || normalizeApaleoReservation(rawReservation)?.status
  };

  if (!normalized?.pms_reservation_id) {
    throw new Error('Apaleo reservation could not be normalized');
  }

  const { reservation } = await createOrUpdateReservation({
    ...normalized,
    hotel_id: connection?.hotel_id || null
  });

  if (!['cancelled', 'canceled', 'deleted'].includes(String(reservation.status || '').toLowerCase())) {
    await scheduleReservationAutomations(reservation);
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

export const handleReservationCreated = async ({ connection, parsed }) => syncFetchedReservation({
  connection,
  parsed
});

export const handleReservationAmended = async ({ connection, parsed }) => syncFetchedReservation({
  connection,
  parsed
});

export const handleReservationCanceled = async ({ connection, parsed }) => syncFetchedReservation({
  connection,
  parsed,
  statusOverride: 'cancelled'
});

export const handleReservationDeleted = async ({ connection, parsed }) => syncFetchedReservation({
  connection,
  parsed,
  statusOverride: 'deleted'
});

const runActionHandler = async ({ connection, parsed }) => {
  if (parsed.eventAction === 'created') {
    return handleReservationCreated({ connection, parsed });
  }

  if (parsed.eventAction === 'amended') {
    return handleReservationAmended({ connection, parsed });
  }

  if (parsed.eventAction === 'canceled') {
    return handleReservationCanceled({ connection, parsed });
  }

  if (parsed.eventAction === 'deleted') {
    return handleReservationDeleted({ connection, parsed });
  }

  return {
    ignored: true,
    reason: `Unsupported Apaleo webhook action: ${parsed.eventAction || parsed.eventType}`
  };
};

export const processApaleoWebhookEvent = async (payload = {}, headers = {}) => {
  const parsed = parseApaleoWebhookEvent(payload, headers);

  logger.info('Apaleo webhook received', {
    eventType: parsed.eventType,
    eventAction: parsed.eventAction,
    externalEventId: parsed.externalEventId,
    externalResourceId: parsed.externalResourceId
  });

  let connection = null;
  let storedEvent = null;

  try {
    connection = await resolveHotelConnectionFromWebhook(payload, headers);
    logger.info('Apaleo webhook connection resolved', {
      connectionId: connection?.id || null,
      hotelId: connection?.hotel_id || null,
      accountCode: connection?.account_code || parsed.accountCode || null
    });

    const { event, duplicate } = await createWebhookEvent({
      parsed,
      connection
    });
    storedEvent = event;

    if (duplicate) {
      return {
        ok: true,
        status: 'ignored',
        duplicate: true,
        event: storedEvent
      };
    }

    if (!parsed.eventAction) {
      await updateWebhookEvent(storedEvent?.id, {
        status: 'ignored',
        error: 'Unsupported or unknown Apaleo event action',
        processed_at: new Date().toISOString()
      });
      return {
        ok: true,
        status: 'ignored',
        reason: 'unsupported_event_action'
      };
    }

    const result = await runActionHandler({
      connection,
      parsed
    });

    if (result.ignored) {
      await updateWebhookEvent(storedEvent?.id, {
        status: 'ignored',
        error: result.reason,
        processed_at: new Date().toISOString()
      });
      return {
        ok: true,
        status: 'ignored',
        reason: result.reason
      };
    }

    await updateWebhookEvent(storedEvent?.id, {
      status: 'processed',
      processed_at: new Date().toISOString()
    });
    await safeUpdateConnection(connection?.id, {
      webhook_enabled: true,
      webhook_status: 'received',
      last_webhook_at: new Date().toISOString(),
      last_webhook_error: null
    });

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

    await updateWebhookEvent(storedEvent?.id, {
      status: 'failed',
      error: error.message,
      processed_at: new Date().toISOString()
    });
    await safeUpdateConnection(connection?.id, {
      webhook_status: 'failed',
      last_webhook_at: new Date().toISOString(),
      last_webhook_error: error.message
    });

    return {
      ok: false,
      status: 'failed',
      error: error.message,
      event: storedEvent
    };
  }
};
