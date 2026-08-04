import {
  AUTOMATION_RUNTIME_VERSION,
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES,
  getAutomationTypeFamily
} from './catalog.js';

const SENDABLE_MODES = new Set([
  EXECUTION_MODES.LIVE_LIMITED,
  EXECUTION_MODES.LIVE
]);

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

export const isUniqueViolation = (error) => (
  error?.code === '23505'
  || /duplicate key value violates unique constraint/i.test(error?.message || '')
);

const optionalColumnNames = [
  'execution_mode',
  'idempotency_key',
  'runtime_version',
  'source',
  'creation_reason',
  'skip_reason'
];

const stripOptionalColumns = (record = {}) => {
  const fallback = { ...record };
  optionalColumnNames.forEach((column) => {
    delete fallback[column];
  });
  return fallback;
};

export const isDecisionSendable = (decision) => (
  decision?.eligible
  && SENDABLE_MODES.has(decision.executionMode)
  && decision.certificationStatus === CERTIFICATION_STATUSES.CERTIFIED
  && process.env.SEND_AUTOMATIONS === 'true'
  && decision.sendable === true
);

export const statusForAutomationDecision = (decision) => {
  if (!decision?.eligible) {
    return null;
  }

  if (decision.executionMode === EXECUTION_MODES.APPROVAL_REQUIRED) {
    return OPERATIONAL_STATUSES.AWAITING_APPROVAL;
  }

  if (isDecisionSendable(decision)) {
    return OPERATIONAL_STATUSES.SCHEDULED;
  }

  return OPERATIONAL_STATUSES.PREVIEW;
};

const buildBaseMetadata = ({ decision, source, creationReason, extraMetadata = {} }) => ({
  ...(decision.metadata || {}),
  ...extraMetadata,
  source,
  creation_reason: creationReason,
  execution_mode: decision.executionMode,
  operational_status: decision.operationalStatus,
  runtime_version: decision.runtimeVersion || AUTOMATION_RUNTIME_VERSION,
  idempotency_key: decision.idempotencyKey,
  canonical_automation_type: decision.automationType,
  legacy_automation_type: decision.legacyType,
  trigger: decision.trigger,
  trigger_reason: decision.triggerReason,
  skip_reason: decision.skipReason,
  certification_status: decision.certificationStatus,
  live_sending_disabled: true,
  send_automations: process.env.SEND_AUTOMATIONS === 'true'
});

const maybeSingleOrNull = async (query) => {
  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

export const findExistingScheduledMessageByIdempotencyKey = async ({ supabase, decision }) => {
  try {
    const byColumn = await maybeSingleOrNull(supabase
      .from('scheduled_messages')
      .select('*')
      .eq('hotel_id', decision.hotelId)
      .eq('idempotency_key', decision.idempotencyKey));

    if (byColumn) return byColumn;
  } catch (error) {
    if (!isMissingAutomationTable(error) && !isMissingColumn(error)) {
      throw error;
    }
  }

  try {
    const byMetadata = await maybeSingleOrNull(supabase
      .from('scheduled_messages')
      .select('*')
      .eq('hotel_id', decision.hotelId)
      .contains('metadata', { idempotency_key: decision.idempotencyKey }));

    if (byMetadata) return byMetadata;
  } catch (error) {
    if (!isMissingAutomationTable(error) && !isMissingColumn(error)) {
      throw error;
    }
  }

  return null;
};

export const findExistingScheduledMessage = async ({ supabase, decision }) => {
  const byIdempotencyKey = await findExistingScheduledMessageByIdempotencyKey({ supabase, decision });
  if (byIdempotencyKey) return byIdempotencyKey;

  const typeFamily = getAutomationTypeFamily(decision.automationType);

  try {
    return await maybeSingleOrNull(supabase
      .from('scheduled_messages')
      .select('*')
      .eq('hotel_id', decision.hotelId)
      .eq('reservation_id', decision.reservationId)
      .in('automation_type', typeFamily));
  } catch (error) {
    if (isMissingAutomationTable(error) || isMissingColumn(error)) {
      return null;
    }

    throw error;
  }
};

const insertScheduledMessage = async ({ supabase, decision, record }) => {
  const tryInsert = async (insertRecord) => {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert(insertRecord)
      .select('*')
      .single();

    return { data, error };
  };

  const { data, error } = await tryInsert(record);

  if (!error) {
    return { scheduledMessage: data, duplicate: false };
  }

  if (isUniqueViolation(error)) {
    return {
      scheduledMessage: await findExistingScheduledMessage({ supabase, decision }),
      duplicate: true
    };
  }

  if (!isMissingColumn(error)) {
    throw error;
  }

  const { data: fallbackData, error: fallbackError } = await tryInsert(stripOptionalColumns(record));

  if (!fallbackError) {
    return { scheduledMessage: fallbackData, duplicate: false };
  }

  if (isUniqueViolation(fallbackError)) {
    return {
      scheduledMessage: await findExistingScheduledMessage({ supabase, decision }),
      duplicate: true
    };
  }

  throw fallbackError;
};

const insertAutomationRun = async ({
  supabase,
  decision,
  scheduledMessage = null,
  status,
  source,
  creationReason,
  extraMetadata
}) => {
  const record = {
    automation_id: null,
    hotel_id: decision.hotelId,
    guest_id: decision.guestId || null,
    reservation_id: decision.reservationId || null,
    conversation_id: decision.conversationId || null,
    trigger_type: decision.trigger,
    automation_type: decision.automationType,
    message_sent: false,
    translated_language: decision.metadata?.language || extraMetadata?.language || null,
    converted: false,
    revenue_generated: 0,
    revenue_owner: decision.metadata?.revenue_owner || extraMetadata?.revenue_owner || 'hotel',
    scheduled_message_id: scheduledMessage?.id || null,
    status,
    cooldown_applied: false,
    fatigue_score: Number(decision.metadata?.fatigue_score || 0),
    execution_mode: decision.executionMode,
    idempotency_key: decision.idempotencyKey,
    runtime_version: decision.runtimeVersion || AUTOMATION_RUNTIME_VERSION,
    source,
    skip_reason: decision.skipReason,
    metadata: buildBaseMetadata({ decision, source, creationReason, extraMetadata }),
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('automation_runs')
      .insert(record)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    if (isMissingColumn(error)) {
      const { data, error: fallbackError } = await supabase
        .from('automation_runs')
        .insert(stripOptionalColumns(record))
        .select('*')
        .single();

      if (fallbackError) {
        if (isMissingAutomationTable(fallbackError) || isMissingColumn(fallbackError)) {
          return null;
        }

        throw fallbackError;
      }

      return data;
    }

    if (isMissingAutomationTable(error)) {
      return null;
    }

    throw error;
  }
};

export const writeAutomationDecisionToQueue = async ({
  supabase,
  decision,
  messagePreview = null,
  channel = 'whatsapp',
  language = 'es',
  source = 'automation_runtime',
  creationReason = 'decision_evaluated',
  extraMetadata = {},
  auditOnlyStatus = null
}) => {
  if (!supabase) {
    throw new Error('supabase client is required to write automation decisions');
  }

  if (!decision?.hotelId) {
    throw new Error('hotelId is required to write automation decisions');
  }

  if (!decision?.automationType) {
    throw new Error('canonical automationType is required to write automation decisions');
  }

  if (!decision?.idempotencyKey) {
    throw new Error('idempotencyKey is required to write automation decisions');
  }

  if (auditOnlyStatus) {
    const automationRun = await insertAutomationRun({
      supabase,
      decision,
      status: auditOnlyStatus,
      source,
      creationReason,
      extraMetadata
    });

    return {
      status: auditOnlyStatus,
      scheduledMessage: null,
      automationRun,
      duplicate: false
    };
  }

  const status = statusForAutomationDecision(decision);
  const runStatus = decision.eligible ? status : OPERATIONAL_STATUSES.SKIPPED;

  if (!status) {
    const automationRun = await insertAutomationRun({
      supabase,
      decision,
      status: runStatus,
      source,
      creationReason,
      extraMetadata
    });

    return {
      status: runStatus,
      scheduledMessage: null,
      automationRun,
      duplicate: false
    };
  }

  const record = {
    hotel_id: decision.hotelId,
    reservation_id: decision.reservationId,
    guest_id: decision.guestId || null,
    conversation_id: decision.conversationId || null,
    automation_rule_id: null,
    automation_type: decision.automationType,
    channel,
    scheduled_for: decision.scheduledFor || decision.evaluatedAt || new Date().toISOString(),
    send_to: isDecisionSendable(decision) ? extraMetadata.send_to || null : null,
    language,
    message_preview: messagePreview || '',
    status,
    ai_provider: extraMetadata.ai_provider || 'mock',
    ai_model: extraMetadata.ai_model || decision.templateVersion || 'automation-runtime-template',
    automation_fallback: extraMetadata.automation_fallback ?? true,
    execution_mode: decision.executionMode,
    idempotency_key: decision.idempotencyKey,
    runtime_version: decision.runtimeVersion || AUTOMATION_RUNTIME_VERSION,
    source,
    creation_reason: creationReason,
    metadata: buildBaseMetadata({
      decision,
      source,
      creationReason,
      extraMetadata: {
        ...extraMetadata,
        language
      }
    }),
    updated_at: new Date().toISOString()
  };

  const existingScheduledMessage = await findExistingScheduledMessageByIdempotencyKey({ supabase, decision });
  if (existingScheduledMessage) {
    return {
      status: existingScheduledMessage.status || status,
      scheduledMessage: existingScheduledMessage,
      automationRun: null,
      duplicate: true
    };
  }

  const { scheduledMessage, duplicate } = await insertScheduledMessage({ supabase, decision, record });

  if (duplicate) {
    return {
      status: scheduledMessage?.status || status,
      scheduledMessage,
      automationRun: null,
      duplicate: true
    };
  }

  const automationRun = await insertAutomationRun({
    supabase,
    decision,
    scheduledMessage,
    status,
    source,
    creationReason,
    extraMetadata
  });

  return {
    status,
    scheduledMessage,
    automationRun,
    duplicate: false
  };
};
