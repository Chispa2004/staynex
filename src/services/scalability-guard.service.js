import { logger } from '../utils/logger.js';

const DEFAULT_HOTEL_MESSAGE_RATE_LIMIT_PER_MINUTE = 300;
const DEFAULT_GUEST_MESSAGE_RATE_LIMIT_PER_MINUTE = 20;
const DEFAULT_AI_TIMEOUT_MS = 12000;
const DEFAULT_AI_CIRCUIT_BREAKER_FAILURES = 5;
const DEFAULT_AI_CIRCUIT_BREAKER_WINDOW_MS = 60000;
const DEFAULT_AI_CIRCUIT_BREAKER_COOLDOWN_MS = 60000;

const buckets = new Map();
const aiFailures = [];
let aiCircuitOpenUntil = 0;

const toPositiveInt = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

export const getPmsBatchSize = () => toPositiveInt(process.env.PMS_SYNC_BATCH_SIZE, 50);
export const getPmsMaxReservations = () => toPositiveInt(process.env.PMS_SYNC_MAX_RESERVATIONS, 1000);
export const getAiTimeoutMs = () => toPositiveInt(process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS);

const getWindowLimit = ({ type }) => {
  if (type === 'hotel') {
    return toPositiveInt(
      process.env.HOTEL_MESSAGE_RATE_LIMIT_PER_MINUTE,
      DEFAULT_HOTEL_MESSAGE_RATE_LIMIT_PER_MINUTE
    );
  }

  return toPositiveInt(
    process.env.GUEST_MESSAGE_RATE_LIMIT_PER_MINUTE,
    DEFAULT_GUEST_MESSAGE_RATE_LIMIT_PER_MINUTE
  );
};

const pruneBucket = (bucket, now, windowMs) => {
  while (bucket.length && bucket[0] <= now - windowMs) {
    bucket.shift();
  }
};

const checkRateLimit = ({ type, id, context = {} }) => {
  const key = `${type}:${id || 'unknown'}`;
  const now = Date.now();
  const windowMs = 60000;
  const limit = getWindowLimit({ type });
  const bucket = buckets.get(key) || [];

  pruneBucket(bucket, now, windowMs);

  if (bucket.length >= limit) {
    const logName = type === 'hotel' ? 'hotel_message_rate_limited' : 'guest_message_rate_limited';
    logger.warn(logName, {
      ...context,
      key,
      limit,
      current: bucket.length
    });

    buckets.set(key, bucket);
    return {
      allowed: false,
      limit,
      current: bucket.length,
      reason: logName
    };
  }

  bucket.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    limit,
    current: bucket.length,
    reason: null
  };
};

export const checkInboundMessageRateLimit = ({ hotelId, guestKey, context = {} }) => {
  const hotelLimit = checkRateLimit({
    type: 'hotel',
    id: hotelId,
    context: {
      ...context,
      hotelId
    }
  });

  if (!hotelLimit.allowed) {
    return hotelLimit;
  }

  return checkRateLimit({
    type: 'guest',
    id: `${hotelId}:${guestKey || 'unknown'}`,
    context: {
      ...context,
      hotelId,
      guestKey
    }
  });
};

const getCircuitBreakerConfig = () => ({
  failureLimit: toPositiveInt(
    process.env.AI_CIRCUIT_BREAKER_FAILURES,
    DEFAULT_AI_CIRCUIT_BREAKER_FAILURES
  ),
  windowMs: toPositiveInt(
    process.env.AI_CIRCUIT_BREAKER_WINDOW_MS,
    DEFAULT_AI_CIRCUIT_BREAKER_WINDOW_MS
  ),
  cooldownMs: toPositiveInt(
    process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS,
    DEFAULT_AI_CIRCUIT_BREAKER_COOLDOWN_MS
  )
});

const pruneAiFailures = (now, windowMs) => {
  while (aiFailures.length && aiFailures[0] <= now - windowMs) {
    aiFailures.shift();
  }
};

export const isAiCircuitBreakerOpen = (context = {}) => {
  const now = Date.now();

  if (aiCircuitOpenUntil > now) {
    logger.warn('ai_circuit_breaker_open', {
      ...context,
      openUntil: new Date(aiCircuitOpenUntil).toISOString()
    });
    return true;
  }

  return false;
};

export const recordAiSuccess = () => {
  aiFailures.length = 0;
  aiCircuitOpenUntil = 0;
};

export const recordAiFailure = (error, context = {}) => {
  const now = Date.now();
  const { failureLimit, windowMs, cooldownMs } = getCircuitBreakerConfig();

  pruneAiFailures(now, windowMs);
  aiFailures.push(now);

  const isTimeout = (
    error?.name === 'TimeoutError'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNABORTED'
    || /timeout/i.test(error?.message || '')
  );

  if (isTimeout) {
    logger.warn('ai_timeout_fallback', {
      ...context,
      timeoutMs: getAiTimeoutMs(),
      message: error?.message || null,
      code: error?.code || null
    });
  }

  if (aiFailures.length >= failureLimit) {
    aiCircuitOpenUntil = now + cooldownMs;
    logger.warn('ai_circuit_breaker_open', {
      ...context,
      failures: aiFailures.length,
      failureLimit,
      windowMs,
      cooldownMs,
      openUntil: new Date(aiCircuitOpenUntil).toISOString()
    });
  }
};
