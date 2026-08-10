import { createHash } from 'node:crypto';
import {
  AUTOMATION_RUNTIME_VERSION,
  OPERATIONAL_STATUSES
} from '../../shared/automations/catalog.js';
import {
  CANCELLABLE_AUTOMATION_MESSAGE_STATUSES,
  buildReconciliationEventKey,
  buildSafeReconciliationMetadata,
  evaluateReservationLifecyclePolicy,
  isCancellableAutomationMessageStatus,
  isCanonicalAutomationScheduledMessage,
  isTerminalAutomationMessageStatus
} from '../../shared/automations/reservation-lifecycle.js';
import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const RUNTIME_OPTIONAL_COLUMNS = [
  'execution_mode',
  'idempotency_key',
  'runtime_version',
  'source',
  'skip_reason'
];

const isMissingAutomationTable = (error) => (
  error?.message?.includes('scheduled_messages')
  || error?.message?.includes('automation_runs')
  || error?.details?.includes('scheduled_messages')
  || error?.details?.includes('automation_runs')
  || error?.hint?.includes('scheduled_messages')
  || error?.hint?.includes('automation_runs')
);

const isMissingColumn = (error) => (
  error?.code === '42703'
  || error?.message?.includes('column')
  || error?.details?.includes('column')
  || error?.hint?.includes('column')
);

const stripOptionalColumns = (record = {}) => {
  const fallback = { ...record };
  RUNTIME_OPTIONAL_COLUMNS.forEach((column) => {
    delete fallback[column];
  });
  return fallback;
};

const buildReconciliationEventId = (eventKey) => createHash('sha256')
  .update(String(eventKey || ''))
  .digest('hex')
  .slice(0, 24);

const baseResult = (policy) => ({
  action: policy.action,
  reason: policy.reason,
  hotelId: policy.hotelId,
  reservationId: policy.reservationId,
  canonicalStatus: policy.canonicalStatus,
  previousStatus: policy.previousStatus,
  currentStatus: policy.currentStatus,
  statusChanged: Boolean(policy.statusChanged),
  becameTerminal: Boolean(policy.becameTerminal),
  sourceEventId: policy.sourceEventId || null,
  eventKey: null,
  runtimeVersion: AUTOMATION_RUNTIME_VERSION,
  rowsInspected: 0,
  rowsCancelled: 0,
  rowsAlreadyTerminal: 0,
  rowsLegacyIgnored: 0,
  processingRowsRequireSendTimeGuard: 0,
  processingRowsRequiringSendTimeGuard: 0,
  futureReschedule: policy.action === 'future_reschedule'
    ? {
      previousArrivalDate: policy.previousArrivalDate || null,
      currentArrivalDate: policy.currentArrivalDate || null,
      previousDepartureDate: policy.previousDepartureDate || null,
      currentDepartureDate: policy.currentDepartureDate || null
    }
    : null
});

const fetchReservationScheduledMessages = async ({ supabase, hotelId, reservationId }) => {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('reservation_id', reservationId)
    .in('status', [
      ...CANCELLABLE_AUTOMATION_MESSAGE_STATUSES,
      OPERATIONAL_STATUSES.PROCESSING,
      OPERATIONAL_STATUSES.SENT,
      OPERATIONAL_STATUSES.CANCELLED,
      OPERATIONAL_STATUSES.FAILED
    ]);

  if (error) {
    throw error;
  }

  return data || [];
};

const updateScheduledMessageAsCancelled = async ({
  supabase,
  message,
  policy,
  eventKey,
  reconciledAt,
  source
}) => {
  const metadata = {
    ...(message.metadata || {}),
    ...buildSafeReconciliationMetadata({
      reason: policy.reason,
      source,
      sourceEventId: policy.sourceEventId,
      eventKey,
      previousStatus: policy.previousStatus,
      currentStatus: policy.currentStatus,
      action: policy.action,
      reconciledAt
    })
  };

  const { data, error } = await supabase
    .from('scheduled_messages')
    .update({
      status: OPERATIONAL_STATUSES.CANCELLED,
      error_message: policy.reason,
      metadata,
      updated_at: reconciledAt
    })
    .eq('id', message.id)
    .eq('hotel_id', policy.hotelId)
    .eq('reservation_id', policy.reservationId)
    .in('status', CANCELLABLE_AUTOMATION_MESSAGE_STATUSES)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const insertCancellationRun = async ({
  supabase,
  message,
  policy,
  eventKey,
  reconciledAt,
  source
}) => {
  const record = {
    automation_id: null,
    hotel_id: policy.hotelId,
    guest_id: message.guest_id || null,
    reservation_id: policy.reservationId,
    conversation_id: message.conversation_id || null,
    trigger_type: message.metadata?.trigger || message.automation_type || 'reservation_lifecycle',
    automation_type: message.automation_type || 'reservation_lifecycle',
    message_sent: false,
    translated_language: message.metadata?.language || null,
    converted: false,
    revenue_generated: 0,
    revenue_owner: 'hotel',
    scheduled_message_id: message.id,
    status: OPERATIONAL_STATUSES.CANCELLED,
    cooldown_applied: false,
    fatigue_score: 0,
    execution_mode: message.execution_mode,
    idempotency_key: `${message.idempotency_key}:cancel:${eventKey}`.slice(0, 500),
    runtime_version: AUTOMATION_RUNTIME_VERSION,
    source: 'automation_reconciliation',
    skip_reason: policy.reason,
    metadata: buildSafeReconciliationMetadata({
      reason: policy.reason,
      source,
      sourceEventId: policy.sourceEventId,
      eventKey,
      previousStatus: policy.previousStatus,
      currentStatus: policy.currentStatus,
      action: policy.action,
      reconciledAt
    }),
    updated_at: reconciledAt
  };

  const insert = async (insertRecord) => supabase
    .from('automation_runs')
    .insert(insertRecord)
    .select('*')
    .single();

  const { data, error } = await insert(record);

  if (!error) {
    return data;
  }

  if (isMissingColumn(error)) {
    const { data: fallbackData, error: fallbackError } = await insert(stripOptionalColumns(record));

    if (!fallbackError) {
      return fallbackData;
    }

    if (isMissingAutomationTable(fallbackError) || isMissingColumn(fallbackError)) {
      return null;
    }

    throw fallbackError;
  }

  if (isMissingAutomationTable(error)) {
    return null;
  }

  throw error;
};

export const reconcileReservationAutomationLifecycle = async ({
  previousReservation = null,
  currentReservation = null,
  sourceEventId = null,
  source = 'reservation_mutation',
  supabase = null
} = {}) => {
  const policy = evaluateReservationLifecyclePolicy({
    previousReservation,
    currentReservation,
    sourceEventId
  });
  const result = baseResult(policy);

  if (policy.action !== 'cancel_pending') {
    return result;
  }

  if (!policy.hotelId || !policy.reservationId) {
    return {
      ...result,
      reason: 'reservation_identity_missing'
    };
  }

  const eventKey = buildReconciliationEventKey({
    hotelId: policy.hotelId,
    reservationId: policy.reservationId,
    reason: policy.reason,
    sourceEventId
  });
  result.eventKey = eventKey;
  const reconciliationEventId = buildReconciliationEventId(eventKey);
  const reconciledAt = new Date().toISOString();
  const client = supabase || getSupabase();
  let messages = [];

  try {
    messages = await fetchReservationScheduledMessages({
      supabase: client,
      hotelId: policy.hotelId,
      reservationId: policy.reservationId
    });
  } catch (error) {
    if (isMissingAutomationTable(error) || isMissingColumn(error)) {
      logger.warn('automation_reconciliation_queue_unavailable', {
        hotelId: result.hotelId,
        reservationId: result.reservationId,
        action: result.action,
        reason: result.reason,
        canonicalStatus: result.canonicalStatus,
        statusChanged: result.statusChanged,
        becameTerminal: result.becameTerminal,
        sourceEventId: result.sourceEventId,
        eventKey: result.eventKey,
        reconciliationEventId,
        runtimeVersion: result.runtimeVersion,
        rowsInspected: result.rowsInspected,
        rowsCancelled: result.rowsCancelled,
        rowsAlreadyTerminal: result.rowsAlreadyTerminal,
        rowsLegacyIgnored: result.rowsLegacyIgnored,
        processingRowsRequireSendTimeGuard: result.processingRowsRequireSendTimeGuard,
        message: error.message
      });
      return result;
    }

    throw error;
  }

  for (const message of messages) {
    result.rowsInspected += 1;

    if (!isCanonicalAutomationScheduledMessage(message)) {
      result.rowsLegacyIgnored += 1;
      continue;
    }

    if (isCancellableAutomationMessageStatus(message.status)) {
      const cancelled = await updateScheduledMessageAsCancelled({
        supabase: client,
        message,
        policy,
        eventKey,
        reconciledAt,
        source
      });

      if (cancelled) {
        result.rowsCancelled += 1;
        await insertCancellationRun({
          supabase: client,
          message,
          policy,
          eventKey,
          reconciledAt,
          source
        });
      }

      continue;
    }

    if (String(message.status || '').toLowerCase() === OPERATIONAL_STATUSES.PROCESSING) {
      result.processingRowsRequireSendTimeGuard += 1;
      result.processingRowsRequiringSendTimeGuard += 1;
      continue;
    }

    if (isTerminalAutomationMessageStatus(message.status)) {
      result.rowsAlreadyTerminal += 1;
    }
  }

  logger.info('automation_reconciliation_completed', {
    hotelId: result.hotelId,
    reservationId: result.reservationId,
    action: result.action,
    reason: result.reason,
    canonicalStatus: result.canonicalStatus,
    statusChanged: result.statusChanged,
    becameTerminal: result.becameTerminal,
    sourceEventId: result.sourceEventId,
    eventKey: result.eventKey,
    reconciliationEventId,
    runtimeVersion: result.runtimeVersion,
    rowsInspected: result.rowsInspected,
    rowsCancelled: result.rowsCancelled,
    rowsAlreadyTerminal: result.rowsAlreadyTerminal,
    rowsLegacyIgnored: result.rowsLegacyIgnored,
    processingRowsRequireSendTimeGuard: result.processingRowsRequireSendTimeGuard,
    processingRowsRequiringSendTimeGuard: result.processingRowsRequiringSendTimeGuard
  });

  return result;
};
