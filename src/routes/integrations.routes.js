import { Router } from 'express';
import { ApaleoConfigurationError } from '../integrations/apaleo/apaleo-auth.service.js';
import { processApaleoWebhookEvent } from '../integrations/apaleo/apaleo-webhooks.service.js';
import {
  deleteHotelPmsConnection,
  getAvailablePmsProviders,
  getHotelPmsConnections,
  saveHotelPmsConnection,
  syncHotelReservations,
  testPmsConnection,
  updateHotelPmsConnection
} from '../services/pms-connections.service.js';
import {
  getPmsBatchSize,
  getPmsMaxReservations
} from '../services/scalability-guard.service.js';
import { EncryptionConfigurationError } from '../utils/encryption.js';
import {
  requireExplicitHotelId,
  requireInternalApiToken
} from '../middleware/security.middleware.js';

const router = Router();

const handleKnownError = (error, res) => {
  if (error instanceof ApaleoConfigurationError) {
    return res.status(400).json({
      ok: false,
      error: error.message,
      missing_env: error.missingEnv
    });
  }

  if (error instanceof EncryptionConfigurationError) {
    return res.status(400).json({
      ok: false,
      error: error.message,
      missing_env: ['PMS_SECRET_ENCRYPTION_KEY']
    });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      error: error.message
    });
  }

  return null;
};

const normalizeDate = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value.slice(0, 10);
};

const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
};

router.post('/apaleo/sync', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const summary = await syncHotelReservations({
      hotelId: req.explicitHotelId,
      provider: 'apaleo',
      from: normalizeDate(req.body?.from),
      to: normalizeDate(req.body?.to),
      status: req.body?.status || undefined,
      pageSize: clampNumber(req.body?.pageSize, getPmsBatchSize(), 1, 50),
      maxReservations: clampNumber(req.body?.maxReservations, getPmsMaxReservations(), 1, 1000)
    });

    res.status(200).json({
      ok: true,
      hotel: { id: req.explicitHotelId },
      summary
    });
  } catch (error) {
    const handled = handleKnownError(error, res);

    if (handled) {
      return handled;
    }

    return next(error);
  }
});

router.post('/apaleo/webhook', async (req, res) => {
  const result = await processApaleoWebhookEvent(req.body || {}, req.headers || {});
  const statusCode = result.ok === false ? 500 : 200;

  res.status(statusCode).json({
    ok: result.ok !== false,
    received: true,
    processed: result.status === 'processed',
    status: result.status,
    error: result.error || null
  });
});

router.get('/pms-connections/providers', requireInternalApiToken, (req, res) => {
  res.status(200).json({
    ok: true,
    providers: getAvailablePmsProviders()
  });
});

router.get('/pms-connections', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const connections = await getHotelPmsConnections({
      hotelId: req.explicitHotelId
    });

    res.status(200).json({
      ok: true,
      hotel: { id: req.explicitHotelId },
      connections,
      providers: getAvailablePmsProviders()
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/pms-connections', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const connection = await saveHotelPmsConnection({
      hotelId: req.explicitHotelId,
      provider: req.body?.provider || 'apaleo',
      clientId: req.body?.client_id || req.body?.clientId,
      clientSecret: req.body?.client_secret || req.body?.clientSecret,
      accountCode: req.body?.account_code || req.body?.accountCode,
      apiKey: req.body?.api_key || req.body?.apiKey,
      webhookSecret: req.body?.webhook_secret || req.body?.webhookSecret,
      propertyId: req.body?.property_id || req.body?.propertyId,
      baseUrl: req.body?.base_url || req.body?.baseUrl,
      enabled: req.body?.enabled !== false,
      connectionMode: req.body?.connection_mode || req.body?.connectionMode,
      notes: req.body?.notes,
      activationRequested: Boolean(req.body?.activation_requested || req.body?.activationRequested),
      metadata: req.body?.metadata || {}
    });

    res.status(200).json({
      ok: true,
      connection
    });
  } catch (error) {
    const handled = handleKnownError(error, res);

    if (handled) {
      return handled;
    }

    return next(error);
  }
});

router.patch('/pms-connections/:id', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const connection = await updateHotelPmsConnection({
      connectionId: req.params.id,
      hotelId: req.explicitHotelId,
      updates: req.body?.updates || req.body || {}
    });

    res.status(200).json({
      ok: true,
      connection
    });
  } catch (error) {
    const handled = handleKnownError(error, res);

    if (handled) {
      return handled;
    }

    return next(error);
  }
});

router.delete('/pms-connections/:id', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const result = await deleteHotelPmsConnection({
      connectionId: req.params.id,
      hotelId: req.explicitHotelId
    });

    res.status(200).json({
      ok: true,
      connection: result.connection
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/pms-connections/test', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const result = await testPmsConnection({
      hotelId: req.explicitHotelId,
      provider: req.body?.provider || 'apaleo'
    });

    res.status(200).json(result);
  } catch (error) {
    const handled = handleKnownError(error, res);

    if (handled) {
      return handled;
    }

    return next(error);
  }
});

router.post('/pms-connections/sync', requireInternalApiToken, requireExplicitHotelId, async (req, res, next) => {
  try {
    const summary = await syncHotelReservations({
      hotelId: req.explicitHotelId,
      provider: req.body?.provider || 'apaleo',
      from: normalizeDate(req.body?.from),
      to: normalizeDate(req.body?.to),
      status: req.body?.status,
      pageSize: clampNumber(req.body?.pageSize, getPmsBatchSize(), 1, 50),
      maxReservations: clampNumber(req.body?.maxReservations, getPmsMaxReservations(), 1, 1000)
    });

    res.status(200).json({
      ok: true,
      summary
    });
  } catch (error) {
    const handled = handleKnownError(error, res);

    if (handled) {
      return handled;
    }

    return next(error);
  }
});

export default router;
