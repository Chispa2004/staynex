import { createHash } from 'node:crypto';
import {
  AUTOMATION_RUNTIME_VERSION,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES
} from '../../shared/automations/catalog.js';
import {
  buildRuntimeAutomationPreview,
  evaluateAutomationDecision
} from '../../shared/automations/runtime.js';
import { writeAutomationDecisionToQueue } from '../../shared/automations/queue-writer.js';
import {
  CANCELLABLE_AUTOMATION_MESSAGE_STATUSES,
  buildReconciliationEventKey,
  buildSafeReconciliationMetadata,
  evaluateMessageScheduleStaleness,
  evaluateReservationLifecyclePolicy,
  getDateChangeReason,
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
  changedFields: policy.changedFields || [],
  statusChanged: Boolean(policy.statusChanged),
  becameTerminal: Boolean(policy.becameTerminal),
  sourceEventId: policy.sourceEventId || null,
  eventKey: null,
  reconciliationEventId: null,
  runtimeVersion: AUTOMATION_RUNTIME_VERSION,
  rowsInspected: 0,
  staleRows: 0,
  replacementsDesired: 0,
  replacementsCreated: 0,
  replacementsDuplicated: 0,
  rowsCancelled: 0,
  rowsAlreadyTerminal: 0,
  rowsLegacyIgnored: 0,
  legacyRowsIgnored: 0,
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

const mergeReconciliationMetadata = ({
  existingMetadata = {},
  policy,
  source,
  sourceEventId,
  eventKey,
  reconciliationEventId,
  reconciledAt,
  changedFields = [],
  supersededMessageId = null,
  replacementMessageId = null,
  previousScheduleFingerprint = null,
  currentScheduleFingerprint = null,
  ruleVersion = null
}) => ({
  ...existingMetadata,
  ...buildSafeReconciliationMetadata({
    reason: policy.reason,
    source,
    sourceEventId,
    eventKey,
    previousStatus: policy.previousStatus,
    currentStatus: policy.currentStatus,
    action: policy.action,
    reconciledAt,
    reconciliationEventId,
    changedFields,
    supersededMessageId,
    replacementMessageId,
    previousScheduleFingerprint,
    currentScheduleFingerprint,
    ruleVersion
  })
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
  const metadata = mergeReconciliationMetadata({
    existingMetadata: message.metadata || {},
    policy,
    source,
    sourceEventId: policy.sourceEventId,
    eventKey,
    reconciliationEventId: policy.reconciliationEventId || null,
    reconciledAt,
    changedFields: policy.changedFields || [],
    ruleVersion: message.metadata?.rule_version || null
  });

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
      reconciledAt,
      reconciliationEventId: policy.reconciliationEventId || null,
      changedFields: policy.changedFields || [],
      ruleVersion: message.metadata?.rule_version || null
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

const fetchCurrentReservationState = async ({ supabase, hotelId, reservationId, fallbackReservation = null }) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || fallbackReservation;
};

const fetchHotelContext = async ({ supabase, hotelId }) => {
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('id', hotelId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || { id: hotelId };
};

const policyForDateReconciliation = ({
  basePolicy,
  reason,
  changedFields,
  reconciliationEventId
}) => ({
  ...basePolicy,
  action: 'future_reschedule',
  reason,
  changedFields,
  reconciliationEventId
});

const fieldsForStaleMessage = ({ policy, staleness }) => (
  policy.changedFields?.length
    ? policy.changedFields
    : staleness.dependencies || []
);

const buildReplacementDecision = ({
  hotel,
  reservation,
  message,
  source,
  now
}) => evaluateAutomationDecision({
  hotel,
  reservation,
  automationType: message.metadata?.canonical_automation_type || message.automation_type,
  legacyType: message.metadata?.legacy_automation_type || message.automation_type,
  trigger: message.metadata?.trigger || message.automation_type,
  executionMode: message.execution_mode || message.metadata?.execution_mode || EXECUTION_MODES.PREVIEW,
  now,
  metadata: {
    source,
    intent: message.metadata?.trigger || message.metadata?.trigger_reason || message.automation_type,
    pms_data_complete: message.metadata?.pms_data_complete
  },
  source
});

const writeReplacementForStaleMessage = async ({
  supabase,
  hotel,
  reservation,
  message,
  staleness,
  policy,
  eventKey,
  reconciliationEventId,
  source,
  reconciledAt,
  now
}) => {
  const decision = buildReplacementDecision({
    hotel,
    reservation,
    message,
    source,
    now
  });

  if (!decision.eligible || !decision.reservationScheduleFingerprint) {
    return {
      decision,
      writeResult: null,
      replacementMessageId: null,
      duplicate: false
    };
  }

  const messagePreview = buildRuntimeAutomationPreview({
    decision,
    hotel,
    reservation
  });
  const changedFields = fieldsForStaleMessage({ policy, staleness });
  const writeResult = await writeAutomationDecisionToQueue({
    supabase,
    decision,
    messagePreview,
    channel: message.channel || 'whatsapp',
    language: message.language || message.metadata?.language || 'es',
    source: 'automation_reconciliation',
    creationReason: 'reservation_schedule_replacement',
    extraMetadata: {
      ai_provider: message.ai_provider || 'mock',
      ai_model: message.ai_model || decision.templateVersion || 'automation-runtime-template',
      automation_fallback: message.automation_fallback ?? true,
      reconciliation: {
        action: 'future_reschedule',
        reason: policy.reason,
        source,
        source_event_id: policy.sourceEventId,
        event_key: eventKey,
        reconciliation_event_id: reconciliationEventId,
        changed_fields: changedFields,
        superseded_message_id: message.id,
        previous_schedule_fingerprint: staleness.storedFingerprint,
        current_schedule_fingerprint: decision.reservationScheduleFingerprint,
        rule_version: decision.templateVersion,
        runtime_version: AUTOMATION_RUNTIME_VERSION,
        reconciled_at: reconciledAt
      }
    }
  });

  return {
    decision,
    writeResult,
    replacementMessageId: writeResult.scheduledMessage?.id || null,
    duplicate: Boolean(writeResult.duplicate)
  };
};

const updateScheduledMessageAsSuperseded = async ({
  supabase,
  message,
  policy,
  eventKey,
  reconciliationEventId,
  reconciledAt,
  source,
  replacementMessageId,
  staleness,
  changedFields
}) => {
  const metadata = mergeReconciliationMetadata({
    existingMetadata: message.metadata || {},
    policy,
    source,
    sourceEventId: policy.sourceEventId,
    eventKey,
    reconciliationEventId,
    reconciledAt,
    changedFields,
    supersededMessageId: message.id,
    replacementMessageId,
    previousScheduleFingerprint: staleness.storedFingerprint,
    currentScheduleFingerprint: staleness.expectedFingerprint,
    ruleVersion: message.metadata?.rule_version || null
  });

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

const insertSupersededRun = async ({
  supabase,
  message,
  policy,
  eventKey,
  reconciliationEventId,
  reconciledAt,
  source,
  replacementMessageId,
  staleness,
  changedFields
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
    idempotency_key: `${message.idempotency_key}:superseded:${eventKey}`.slice(0, 500),
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
      reconciledAt,
      reconciliationEventId,
      changedFields,
      supersededMessageId: message.id,
      replacementMessageId,
      previousScheduleFingerprint: staleness.storedFingerprint,
      currentScheduleFingerprint: staleness.expectedFingerprint,
      ruleVersion: message.metadata?.rule_version || null
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

  if (policy.action !== 'cancel_pending' && !policy.hotelId && !policy.reservationId) {
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
    reason: policy.action === 'future_reschedule'
      ? getDateChangeReason(policy.changedFields || [])
      : policy.reason,
    sourceEventId
  });
  result.eventKey = eventKey;
  const reconciliationEventId = buildReconciliationEventId(eventKey);
  result.reconciliationEventId = reconciliationEventId;
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

  if (policy.action !== 'cancel_pending') {
    const actualReservation = await fetchCurrentReservationState({
      supabase: client,
      hotelId: policy.hotelId,
      reservationId: policy.reservationId,
      fallbackReservation: currentReservation
    });
    const hotel = await fetchHotelContext({
      supabase: client,
      hotelId: policy.hotelId
    });
    const staleCandidates = [];
    const replacementByKey = new Map();
    const datePolicy = policyForDateReconciliation({
      basePolicy: policy,
      reason: getDateChangeReason(policy.changedFields || []),
      changedFields: policy.changedFields || [],
      reconciliationEventId
    });
    result.reason = policy.action === 'future_reschedule' ? datePolicy.reason : result.reason;

    for (const message of messages) {
      result.rowsInspected += 1;

      if (!isCanonicalAutomationScheduledMessage(message)) {
        result.rowsLegacyIgnored += 1;
        result.legacyRowsIgnored += 1;
        continue;
      }

      const staleness = evaluateMessageScheduleStaleness({
        message,
        reservation: actualReservation
      });

      if (!staleness.dateDependent) {
        continue;
      }

      if (String(message.status || '').toLowerCase() === OPERATIONAL_STATUSES.PROCESSING) {
        if (staleness.stale) {
          result.processingRowsRequireSendTimeGuard += 1;
          result.processingRowsRequiringSendTimeGuard += 1;
        }
        continue;
      }

      if (isTerminalAutomationMessageStatus(message.status)) {
        result.rowsAlreadyTerminal += 1;
        continue;
      }

      if (!staleness.stale || !isCancellableAutomationMessageStatus(message.status)) {
        continue;
      }

      const changedFields = fieldsForStaleMessage({ policy: datePolicy, staleness });
      const reason = getDateChangeReason(changedFields);
      staleCandidates.push({
        message,
        staleness,
        changedFields,
        policy: {
          ...datePolicy,
          reason,
          changedFields
        }
      });
      result.staleRows += 1;
      result.replacementsDesired += 1;
    }

    if (staleCandidates.length > 0 || policy.action === 'future_reschedule') {
      result.action = 'future_reschedule';
      result.reason = staleCandidates[0]?.policy.reason || datePolicy.reason;
      result.changedFields = [...new Set([
        ...result.changedFields,
        ...staleCandidates.flatMap((candidate) => candidate.changedFields)
      ])].sort();
    }

    for (const candidate of staleCandidates) {
      const replacement = await writeReplacementForStaleMessage({
        supabase: client,
        hotel,
        reservation: actualReservation,
        message: candidate.message,
        staleness: candidate.staleness,
        policy: candidate.policy,
        eventKey,
        reconciliationEventId,
        source,
        reconciledAt,
        now: new Date(reconciledAt)
      });
      const replacementKey = replacement.decision?.idempotencyKey || null;

      if (replacementKey && replacementByKey.has(replacementKey)) {
        result.replacementsDuplicated += 1;
        candidate.replacementMessageId = replacementByKey.get(replacementKey);
        continue;
      }

      if (replacementKey && replacement.replacementMessageId) {
        replacementByKey.set(replacementKey, replacement.replacementMessageId);
      }

      if (replacement.duplicate) {
        result.replacementsDuplicated += 1;
      } else if (replacement.replacementMessageId) {
        result.replacementsCreated += 1;
      }

      candidate.replacementMessageId = replacement.replacementMessageId;
    }

    for (const candidate of staleCandidates) {
      const cancelled = await updateScheduledMessageAsSuperseded({
        supabase: client,
        message: candidate.message,
        policy: candidate.policy,
        eventKey,
        reconciliationEventId,
        reconciledAt,
        source,
        replacementMessageId: candidate.replacementMessageId || null,
        staleness: candidate.staleness,
        changedFields: candidate.changedFields
      });

      if (cancelled) {
        result.rowsCancelled += 1;
        await insertSupersededRun({
          supabase: client,
          message: candidate.message,
          policy: candidate.policy,
          eventKey,
          reconciliationEventId,
          reconciledAt,
          source,
          replacementMessageId: candidate.replacementMessageId || null,
          staleness: candidate.staleness,
          changedFields: candidate.changedFields
        });
      }
    }

    logger.info('automation_reconciliation_completed', {
      hotelId: result.hotelId,
      reservationId: result.reservationId,
      action: result.action,
      reason: result.reason,
      canonicalStatus: result.canonicalStatus,
      changedFields: result.changedFields,
      statusChanged: result.statusChanged,
      becameTerminal: result.becameTerminal,
      sourceEventId: result.sourceEventId,
      eventKey: result.eventKey,
      reconciliationEventId,
      runtimeVersion: result.runtimeVersion,
      rowsInspected: result.rowsInspected,
      staleRows: result.staleRows,
      replacementsDesired: result.replacementsDesired,
      replacementsCreated: result.replacementsCreated,
      replacementsDuplicated: result.replacementsDuplicated,
      rowsCancelled: result.rowsCancelled,
      rowsAlreadyTerminal: result.rowsAlreadyTerminal,
      rowsLegacyIgnored: result.rowsLegacyIgnored,
      legacyRowsIgnored: result.legacyRowsIgnored,
      processingRowsRequireSendTimeGuard: result.processingRowsRequireSendTimeGuard,
      processingRowsRequiringSendTimeGuard: result.processingRowsRequiringSendTimeGuard
    });

    return result;
  }

  const terminalPolicy = {
    ...policy,
    reconciliationEventId
  };

  for (const message of messages) {
    result.rowsInspected += 1;

    if (!isCanonicalAutomationScheduledMessage(message)) {
      result.rowsLegacyIgnored += 1;
      result.legacyRowsIgnored += 1;
      continue;
    }

    if (isCancellableAutomationMessageStatus(message.status)) {
      const cancelled = await updateScheduledMessageAsCancelled({
        supabase: client,
        message,
        policy: terminalPolicy,
        eventKey,
        reconciledAt,
        source
      });

      if (cancelled) {
        result.rowsCancelled += 1;
        await insertCancellationRun({
          supabase: client,
          message,
          policy: terminalPolicy,
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
    legacyRowsIgnored: result.legacyRowsIgnored,
    processingRowsRequireSendTimeGuard: result.processingRowsRequireSendTimeGuard,
    processingRowsRequiringSendTimeGuard: result.processingRowsRequiringSendTimeGuard
  });

  return result;
};
