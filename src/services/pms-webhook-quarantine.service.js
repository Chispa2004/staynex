import { createHash } from 'node:crypto';
import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

export const PMS_WEBHOOK_QUARANTINE_REASON_CODES = Object.freeze([
  'INVALID_SIGNATURE',
  'MISSING_SIGNATURE',
  'UNKNOWN_CONNECTION',
  'AMBIGUOUS_CONNECTION',
  'CONNECTION_DISABLED',
  'TENANT_MISMATCH',
  'MISSING_EVENT_ID',
  'MALFORMED_EVENT',
  'UNSUPPORTED_PROVIDER',
  'VALIDATION_NOT_CONFIGURED',
  'LEGACY_GLOBAL_EVENT_COLLISION',
  'LEGACY_GLOBAL_RESERVATION_COLLISION'
]);

const ALLOWED_SAFE_FLAG_KEYS = new Set([
  'account_code_present',
  'candidate_connection_id_present',
  'candidate_connection_id_valid_uuid',
  'connection_id_present',
  'connection_lookup',
  'event_action',
  'event_type',
  'external_event_id_present',
  'external_resource_id_present',
  'hotel_id_present',
  'provider',
  'quarantine_source',
  'reservation_identity_present',
  'tenant_context_present',
  'validation_configured',
  'validation_result'
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeString = (value, maxLength = 80) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const stableSafeStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSafeStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSafeStringify(value[key])}`
    )).join(',')}}`;
  }

  return JSON.stringify(value);
};

export const hashSafeWebhookValue = (value) => createHash('sha256')
  .update(stableSafeStringify(value))
  .digest('hex');

export const normalizePmsWebhookReasonCode = (reasonCode) => {
  const normalized = safeString(reasonCode, 80)?.toUpperCase() || 'MALFORMED_EVENT';
  return PMS_WEBHOOK_QUARANTINE_REASON_CODES.includes(normalized)
    ? normalized
    : 'MALFORMED_EVENT';
};

export const sanitizeWebhookErrorCode = (error) => {
  if (error?.reasonCode) {
    return normalizePmsWebhookReasonCode(error.reasonCode);
  }

  if (error?.code === '23505') {
    return 'unique_violation';
  }

  if (error?.status) {
    return `provider_http_${String(error.status).replace(/[^\d]/g, '').slice(0, 3)}`;
  }

  return 'runtime_error';
};

const safeFlagValue = (value) => {
  if (typeof value === 'boolean' || typeof value === 'number' || value === null) {
    return value;
  }

  if (typeof value === 'string') {
    return safeString(value, 80);
  }

  return null;
};

export const buildSafeQuarantineFlags = (safeFlags = {}) => (
  Object.entries(safeFlags).reduce((flags, [key, value]) => {
    if (!ALLOWED_SAFE_FLAG_KEYS.has(key)) {
      return flags;
    }

    const safeValue = safeFlagValue(value);

    if (safeValue !== undefined) {
      flags[key] = safeValue;
    }

    return flags;
  }, {})
);

export const uuidOrNull = (value) => {
  const candidate = safeString(value, 80);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
};

export const writePmsWebhookQuarantine = async ({
  provider = 'unknown',
  reasonCode,
  status = 'pending',
  requestHash = null,
  eventHash = null,
  candidateConnectionId = null,
  safeFlags = {},
  supabase = getSupabase()
} = {}) => {
  const normalizedReasonCode = normalizePmsWebhookReasonCode(reasonCode);
  const safeCandidateConnectionId = uuidOrNull(candidateConnectionId);
  const record = {
    provider: safeString(provider, 40) || 'unknown',
    reason_code: normalizedReasonCode,
    status: safeString(status, 40) || 'pending',
    request_hash: safeString(requestHash, 128),
    event_hash: safeString(eventHash, 128),
    candidate_connection_id: safeCandidateConnectionId,
    safe_flags: buildSafeQuarantineFlags({
      ...safeFlags,
      candidate_connection_id_valid_uuid: candidateConnectionId
        ? Boolean(safeCandidateConnectionId)
        : null
    })
  };

  try {
    const { data, error } = await supabase
      .from('pms_webhook_quarantine')
      .insert(record)
      .select('id, provider, reason_code, status, created_at')
      .single();

    if (error) {
      logger.warn('PMS webhook quarantine write failed', {
        provider: record.provider,
        reasonCode: normalizedReasonCode,
        errorCode: sanitizeWebhookErrorCode(error)
      });

      return {
        ok: false,
        reasonCode: normalizedReasonCode,
        errorCode: sanitizeWebhookErrorCode(error)
      };
    }

    return {
      ok: true,
      reasonCode: normalizedReasonCode,
      quarantine: data
    };
  } catch (error) {
    logger.warn('PMS webhook quarantine write failed', {
      provider: record.provider,
      reasonCode: normalizedReasonCode,
      errorCode: sanitizeWebhookErrorCode(error)
    });

    return {
      ok: false,
      reasonCode: normalizedReasonCode,
      errorCode: sanitizeWebhookErrorCode(error)
    };
  }
};
