import crypto from 'crypto';
import twilio from 'twilio';
import { logger } from '../utils/logger.js';
import { getSupabase } from '../services/supabase.service.js';

const INTERNAL_TOKEN_HEADER = 'x-staynex-internal-token';
const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const INTERNAL_PLATFORM_ROLES = ['platform_admin', 'super_admin', 'internal_only'];

const isProduction = () => process.env.NODE_ENV === 'production';
export const areTestRoutesEnabled = () => !isProduction() && process.env.ENABLE_TEST_ROUTES === 'true';

const maskRoute = (req) => `${req.method || 'UNKNOWN'} ${req.originalUrl || req.url || 'unknown'}`;

const normalizeRequestId = (value) => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const requestId = typeof candidate === 'string' ? candidate.trim() : '';

  return REQUEST_ID_PATTERN.test(requestId) ? requestId : crypto.randomUUID();
};

export const requestIdMiddleware = (req, res, next) => {
  const incomingRequestId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  req.requestId = normalizeRequestId(incomingRequestId);
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

export const safeCompare = (actual, expected) => {
  const actualValue = String(actual || '');
  const expectedValue = String(expected || '');
  const actualDigest = crypto.createHash('sha256').update(actualValue, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expectedValue, 'utf8').digest();

  return crypto.timingSafeEqual(actualDigest, expectedDigest);
};

const getBearerToken = (req) => String(req.headers.authorization || '')
  .match(/^Bearer\s+(.+)$/i)?.[1]
  ?.trim() || '';

export const requireInternalApiToken = (req, res, next) => {
  const expectedToken = process.env.STAYNEX_INTERNAL_API_TOKEN;

  if (!expectedToken) {
    logger.warn('internal_api_token_missing', {
      requestId: req.requestId,
      route: maskRoute(req)
    });

    return res.status(503).json({
      ok: false,
      error: 'Internal API authentication is not configured'
    });
  }

  const providedToken = req.headers[INTERNAL_TOKEN_HEADER];

  if (!providedToken) {
    logger.warn('internal_api_token_missing_on_request', {
      requestId: req.requestId,
      route: maskRoute(req)
    });

    return res.status(401).json({
      ok: false,
      error: 'Internal API authorization required'
    });
  }

  if (!safeCompare(providedToken, expectedToken)) {
    logger.warn('internal_api_token_invalid', {
      requestId: req.requestId,
      route: maskRoute(req)
    });

    return res.status(403).json({
      ok: false,
      error: 'Invalid internal API authorization'
    });
  }

  return next();
};

export const createRequirePlatformAdmin = ({ getSupabaseClient = getSupabase } = {}) => async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      logger.warn('platform_admin_auth_missing', {
        requestId: req.requestId,
        route: maskRoute(req)
      });

      return res.status(401).json({
        ok: false,
        error: 'Platform admin authorization required'
      });
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      logger.warn('platform_admin_auth_invalid', {
        requestId: req.requestId,
        route: maskRoute(req)
      });

      return res.status(401).json({
        ok: false,
        error: 'Invalid platform admin session'
      });
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from('hotel_users')
      .select('id, platform_role, status')
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .in('platform_role', INTERNAL_PLATFORM_ROLES)
      .limit(1);

    if (assignmentError) {
      throw assignmentError;
    }

    if (!assignments?.length) {
      logger.warn('platform_admin_access_denied', {
        requestId: req.requestId,
        route: maskRoute(req),
        userId: userData.user.id
      });

      return res.status(403).json({
        ok: false,
        error: 'Platform admin access required'
      });
    }

    req.platformAdminUser = userData.user;
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requirePlatformAdmin = createRequirePlatformAdmin();

const getForwardedUrl = (req) => {
  const configuredUrl = process.env.TWILIO_WEBHOOK_PUBLIC_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  const publicBaseUrl = process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL;

  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, '')}${req.originalUrl || req.url || ''}`;
  }

  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();

  return `${protocol}://${host}${req.originalUrl || req.url || ''}`;
};

const canBypassTwilioValidation = () => (
  !isProduction() && process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS === 'true'
);

export const validateTwilioWebhook = (req, res, next) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers[TWILIO_SIGNATURE_HEADER];

  if (!authToken) {
    if (canBypassTwilioValidation()) {
      logger.warn('twilio_webhook_validation_bypassed_non_production', {
        requestId: req.requestId
      });

      return next();
    }

    logger.warn('twilio_webhook_auth_token_missing', {
      requestId: req.requestId,
      route: maskRoute(req)
    });

    return res.status(503).json({
      ok: false,
      error: 'Twilio webhook validation is not configured'
    });
  }

  if (!signature) {
    logger.warn('twilio_webhook_signature_missing', {
      requestId: req.requestId,
      route: maskRoute(req)
    });

    return res.status(403).json({
      ok: false,
      error: 'Twilio webhook signature required'
    });
  }

  const requestUrl = getForwardedUrl(req);
  const isValid = twilio.validateRequest(authToken, signature, requestUrl, req.body || {});

  if (!isValid) {
    logger.warn('twilio_webhook_signature_invalid', {
      requestId: req.requestId,
      route: maskRoute(req),
      urlSource: process.env.TWILIO_WEBHOOK_PUBLIC_URL ? 'configured' : 'derived'
    });

    return res.status(403).json({
      ok: false,
      error: 'Invalid Twilio webhook signature'
    });
  }

  logger.info('twilio_webhook_signature_valid', {
    requestId: req.requestId,
    route: maskRoute(req)
  });

  return next();
};

export const blockUnverifiedApaleoWebhookInProduction = (req, res, next) => {
  if (!isProduction()) {
    return next();
  }

  logger.warn('apaleo_webhook_live_blocked_missing_official_validation', {
    requestId: req.requestId,
    route: maskRoute(req)
  });

  return res.status(503).json({
    ok: false,
    error: 'Apaleo webhook live validation is not configured'
  });
};

export const blockProductionTestRoute = (req, res, next) => {
  if (!isProduction()) {
    return next();
  }

  logger.warn('production_test_route_blocked', {
    requestId: req.requestId,
    route: maskRoute(req)
  });

  return res.status(404).json({
    ok: false,
    error: 'Not found'
  });
};

export const requireTestRoutesEnabled = (req, res, next) => {
  if (areTestRoutesEnabled()) {
    return next();
  }

  logger.warn('test_route_disabled', {
    requestId: req.requestId,
    route: maskRoute(req),
    production: isProduction()
  });

  return res.status(404).json({
    ok: false,
    error: 'Not found'
  });
};

export const requireExplicitHotelId = (req, res, next) => {
  const hotelId = req.body?.hotelId || req.body?.hotel_id || req.query?.hotelId || req.query?.hotel_id;

  if (!hotelId) {
    logger.warn('hotel_context_missing_no_default_fallback', {
      requestId: req.requestId,
      route: maskRoute(req)
    });

    return res.status(400).json({
      ok: false,
      error: 'hotelId is required for this operation'
    });
  }

  req.explicitHotelId = hotelId;
  return next();
};
