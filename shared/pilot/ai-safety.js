export const HOTEL_AI_AUTO_REPLY_COLUMN = 'ai_auto_reply_enabled';
export const HOTEL_AI_AUTO_REPLY_SOURCE = `hotels.${HOTEL_AI_AUTO_REPLY_COLUMN}`;

export const GLOBAL_AI_AUTO_REPLY_STATE_ENV_KEYS = Object.freeze([
  'STAYNEX_GLOBAL_AI_AUTO_REPLY',
  'STAYNEX_AI_AUTO_REPLY_GLOBAL_STATE',
  'PILOT_GLOBAL_AI_AUTO_REPLY',
  'PILOT_AI_AUTO_REPLY_GLOBAL_STATE'
]);

export const GLOBAL_AI_KILL_SWITCH_ENV_KEYS = Object.freeze([
  'STAYNEX_GLOBAL_AI_KILL_SWITCH',
  'STAYNEX_AI_AUTO_REPLY_KILL_SWITCH',
  'PILOT_GLOBAL_AI_KILL_SWITCH',
  'PILOT_AI_AUTO_REPLY_KILL_SWITCH'
]);

export const PILOT_AI_GATE_REASONS = Object.freeze({
  ALLOWED: 'ai_auto_reply_allowed',
  GLOBAL_KILL_SWITCH_OFF: 'global_kill_switch_off',
  HOTEL_AI_AUTO_REPLY_OFF: 'hotel_ai_auto_reply_off',
  HOTEL_AI_AUTO_REPLY_NOT_CONFIGURED: 'hotel_ai_auto_reply_not_configured',
  HUMAN_TAKEOVER_ACTIVE: 'human_takeover_active',
  STATE_LOOKUP_FAILED: 'state_lookup_failed',
  AI_PROVIDER_FAILURE: 'ai_provider_failure',
  HOTEL_CONTEXT_MISSING: 'hotel_context_missing'
});

export const PILOT_AI_SAFETY_RUNTIME = Object.freeze({
  centralGate: 'shouldAiAutoRespond',
  humanTakeoverSource: 'conversation_ai_state',
  hotelKillSwitchSource: HOTEL_AI_AUTO_REPLY_SOURCE,
  globalOverrideSource: GLOBAL_AI_AUTO_REPLY_STATE_ENV_KEYS.join(','),
  failClosedOnStateLookup: true,
  resumeReprocessesHistory: false,
  manualRepliesBypassAutoReplyGate: true
});

export const PILOT_AI_SAFETY_BLOCKING_MODES = Object.freeze([
  'human_takeover',
  'ai_paused',
  'escalation_lock',
  'human'
]);

const offValues = new Set(['0', 'false', 'off', 'disabled', 'disable', 'paused', 'pause', 'kill', 'killed', 'no']);
const onValues = new Set(['1', 'true', 'on', 'enabled', 'enable', 'active', 'yes']);

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const safePilotMetadata = (metadata = {}) => {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isPlainObject(metadata) ? metadata : {};
};

const firstConfiguredFlag = (sources = []) => {
  for (const source of sources) {
    if (source?.value !== undefined && source.value !== null && source.value !== '') {
      return source;
    }
  }

  return null;
};

const normalizeBooleanState = (value) => {
  if (value === true || value === false) {
    return {
      configured: true,
      enabled: value,
      valid: true,
      normalized: value ? 'on' : 'off'
    };
  }

  const normalized = String(value || '').trim().toLowerCase();

  if (onValues.has(normalized)) {
    return {
      configured: true,
      enabled: true,
      valid: true,
      normalized: 'on'
    };
  }

  if (offValues.has(normalized)) {
    return {
      configured: true,
      enabled: false,
      valid: true,
      normalized: 'off'
    };
  }

  return {
    configured: Boolean(normalized),
    enabled: false,
    valid: false,
    normalized: normalized || null
  };
};

export const getGlobalAiAutoReplyStatus = (env = process.env) => {
  const killSwitch = firstConfiguredFlag(
    GLOBAL_AI_KILL_SWITCH_ENV_KEYS.map((key) => ({ key, value: env?.[key], source: 'env_kill_switch' }))
  );

  if (killSwitch) {
    const parsed = normalizeBooleanState(killSwitch.value);

    if (parsed.valid && parsed.enabled) {
      return {
        configured: true,
        enabled: false,
        allowed: false,
        reason: PILOT_AI_GATE_REASONS.GLOBAL_KILL_SWITCH_OFF,
        source: killSwitch.key,
        label: 'GLOBAL OFF'
      };
    }
  }

  const state = firstConfiguredFlag(
    GLOBAL_AI_AUTO_REPLY_STATE_ENV_KEYS.map((key) => ({ key, value: env?.[key], source: 'env_state' }))
  );

  if (!state) {
    return {
      configured: false,
      enabled: true,
      allowed: true,
      reason: null,
      source: 'default_allow_unless_global_off',
      label: 'GLOBAL ON'
    };
  }

  const parsed = normalizeBooleanState(state.value);

  return {
    configured: parsed.configured,
    valid: parsed.valid,
    enabled: parsed.valid ? parsed.enabled : false,
    allowed: parsed.valid ? parsed.enabled : false,
    reason: parsed.valid && parsed.enabled ? null : PILOT_AI_GATE_REASONS.GLOBAL_KILL_SWITCH_OFF,
    source: state.key,
    label: parsed.valid && parsed.enabled ? 'GLOBAL ON' : 'GLOBAL OFF'
  };
};

export const getHotelAiAutoReplyStatus = (hotel = {}) => {
  const configured = firstConfiguredFlag([
    {
      key: HOTEL_AI_AUTO_REPLY_COLUMN,
      value: hotel?.[HOTEL_AI_AUTO_REPLY_COLUMN],
      source: HOTEL_AI_AUTO_REPLY_SOURCE
    }
  ]);

  if (!configured) {
    return {
      configured: false,
      enabled: false,
      allowed: false,
      reason: PILOT_AI_GATE_REASONS.HOTEL_AI_AUTO_REPLY_NOT_CONFIGURED,
      source: HOTEL_AI_AUTO_REPLY_SOURCE,
      label: 'HOTEL AUTO-REPLY NO CONFIGURADO'
    };
  }

  const parsed = normalizeBooleanState(configured.value);

  return {
    configured: parsed.configured,
    valid: parsed.valid,
    enabled: parsed.valid ? parsed.enabled : false,
    allowed: parsed.valid ? parsed.enabled : false,
    reason: parsed.valid && parsed.enabled ? null : PILOT_AI_GATE_REASONS.HOTEL_AI_AUTO_REPLY_OFF,
    source: HOTEL_AI_AUTO_REPLY_SOURCE,
    label: parsed.valid && parsed.enabled ? 'HOTEL AUTO-REPLY ON' : 'HOTEL AUTO-REPLY OFF'
  };
};

export const getConversationAiModeForGate = (conversationState = null) => (
  conversationState?.state_metadata?.conversation_ai_mode
  || conversationState?.conversation_ai_mode
  || conversationState?.ai_mode
  || 'ai_active'
);

export const isHumanControlledConversationForGate = (conversationState = null) => {
  const metadata = safePilotMetadata(conversationState?.state_metadata);
  const mode = String(
    metadata.conversation_ai_mode
    || conversationState?.conversation_ai_mode
    || conversationState?.ai_mode
    || ''
  ).toLowerCase();

  return (
    (Boolean(metadata.human_takeover) && PILOT_AI_SAFETY_BLOCKING_MODES.includes(mode))
    || PILOT_AI_SAFETY_BLOCKING_MODES.includes(mode)
    || Boolean(conversationState?.human_takeover)
  );
};

export const shouldAiAutoRespond = ({
  hotel = null,
  conversationState = null,
  stateLookupFailed = false,
  env = process.env
} = {}) => {
  const globalStatus = getGlobalAiAutoReplyStatus(env);
  if (!globalStatus.allowed) {
    return {
      allowed: false,
      reason: globalStatus.reason,
      humanAttentionRequired: true,
      globalStatus
    };
  }

  if (!hotel?.id) {
    return {
      allowed: false,
      reason: PILOT_AI_GATE_REASONS.HOTEL_CONTEXT_MISSING,
      humanAttentionRequired: true,
      globalStatus
    };
  }

  const hotelStatus = getHotelAiAutoReplyStatus(hotel);
  if (!hotelStatus.allowed) {
    return {
      allowed: false,
      reason: hotelStatus.reason,
      humanAttentionRequired: true,
      hotelStatus,
      globalStatus
    };
  }

  if (stateLookupFailed) {
    return {
      allowed: false,
      reason: PILOT_AI_GATE_REASONS.STATE_LOOKUP_FAILED,
      humanAttentionRequired: true,
      hotelStatus,
      globalStatus
    };
  }

  if (isHumanControlledConversationForGate(conversationState)) {
    return {
      allowed: false,
      reason: PILOT_AI_GATE_REASONS.HUMAN_TAKEOVER_ACTIVE,
      humanAttentionRequired: true,
      hotelStatus,
      globalStatus
    };
  }

  return {
    allowed: true,
    reason: PILOT_AI_GATE_REASONS.ALLOWED,
    humanAttentionRequired: false,
    hotelStatus,
    globalStatus
  };
};

export const buildSuppressedAiResponse = ({
  reason = PILOT_AI_GATE_REASONS.HUMAN_TAKEOVER_ACTIVE,
  model = 'pilot-ai-safety-gate'
} = {}) => ({
  intent: 'human_attention_required',
  sentiment: 'neutral',
  urgency: 'normal',
  language: 'es',
  reply: null,
  personalized_response: null,
  suggestions: [],
  topics: ['human_attention_required'],
  revenue_opportunities: [],
  escalate_to_human: true,
  provider: 'system',
  model,
  suppressed: true,
  suppression_reason: reason
});

export const getSkippedStaffTranslation = ({
  sourceLanguage = 'es',
  targetLanguage = 'es',
  reason = null
} = {}) => ({
  originalText: null,
  translatedText: null,
  sourceLanguage,
  targetLanguage,
  provider: 'skipped_ai_auto_response_gate',
  confidence: 0,
  skipped: true,
  reason
});

export const getPilotAiSafetyReadiness = ({ hotel = {}, env = process.env } = {}) => {
  const hotelStatus = getHotelAiAutoReplyStatus(hotel);
  const globalStatus = getGlobalAiAutoReplyStatus(env);
  const humanFallbackReady = Boolean(
    PILOT_AI_SAFETY_RUNTIME.centralGate === 'shouldAiAutoRespond'
    && PILOT_AI_SAFETY_RUNTIME.humanTakeoverSource === 'conversation_ai_state'
    && PILOT_AI_SAFETY_RUNTIME.failClosedOnStateLookup
    && PILOT_AI_SAFETY_RUNTIME.resumeReprocessesHistory === false
    && PILOT_AI_SAFETY_RUNTIME.manualRepliesBypassAutoReplyGate
  );

  return {
    humanFallback: {
      ready: humanFallbackReady,
      source: PILOT_AI_SAFETY_RUNTIME.humanTakeoverSource,
      details: [
        'conversation_ai_state',
        PILOT_AI_SAFETY_RUNTIME.centralGate,
        'Inbox takeover controls'
      ]
    },
    killSwitch: {
      ready: hotelStatus.configured && hotelStatus.valid !== false,
      source: hotelStatus.source,
      enabled: hotelStatus.enabled,
      globalEnabled: globalStatus.enabled,
      details: [
        hotelStatus.label,
        globalStatus.label,
        PILOT_AI_SAFETY_RUNTIME.centralGate
      ]
    },
    runtime: PILOT_AI_SAFETY_RUNTIME,
    hotelStatus,
    globalStatus
  };
};
