import { Router } from 'express';
import { ApaleoConfigurationError } from '../integrations/apaleo/apaleo-auth.service.js';
import { syncReservationsFromApaleo } from '../integrations/apaleo/apaleo-sync.service.js';
import { getDefaultHotel } from '../services/hotel.service.js';
import {
  deleteHotelPmsConnection,
  getAvailablePmsProviders,
  getHotelPmsConnections,
  saveHotelPmsConnection,
  syncHotelReservations,
  testPmsConnection,
  updateHotelPmsConnection
} from '../services/pms-connections.service.js';
import { EncryptionConfigurationError } from '../utils/encryption.js';

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

  return null;
};

const normalizeDate = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value.slice(0, 10);
};

router.post('/apaleo/sync', async (req, res, next) => {
  try {
    const hotel = await getDefaultHotel();
    const summary = await syncReservationsFromApaleo({
      hotelId: hotel?.id || null,
      from: normalizeDate(req.body?.from),
      to: normalizeDate(req.body?.to),
      status: req.body?.status || undefined,
      pageSize: Number(req.body?.pageSize || 25),
      maxReservations: Number(req.body?.maxReservations || 50)
    });

    res.status(200).json({
      ok: true,
      hotel,
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

router.get('/pms-connections/providers', (req, res) => {
  res.status(200).json({
    ok: true,
    providers: getAvailablePmsProviders()
  });
});

router.get('/pms-connections', async (req, res, next) => {
  try {
    const hotel = req.query.hotelId ? { id: req.query.hotelId } : await getDefaultHotel();
    const connections = await getHotelPmsConnections({
      hotelId: hotel?.id || null
    });

    res.status(200).json({
      ok: true,
      hotel,
      connections,
      providers: getAvailablePmsProviders()
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/pms-connections', async (req, res, next) => {
  try {
    const hotel = req.body?.hotelId ? { id: req.body.hotelId } : await getDefaultHotel();
    const connection = await saveHotelPmsConnection({
      hotelId: hotel?.id || null,
      provider: req.body?.provider || 'apaleo',
      clientId: req.body?.client_id || req.body?.clientId,
      clientSecret: req.body?.client_secret || req.body?.clientSecret,
      accountCode: req.body?.account_code || req.body?.accountCode,
      baseUrl: req.body?.base_url || req.body?.baseUrl,
      enabled: req.body?.enabled !== false,
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

router.patch('/pms-connections/:id', async (req, res, next) => {
  try {
    const connection = await updateHotelPmsConnection({
      connectionId: req.params.id,
      hotelId: req.body?.hotelId,
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

router.delete('/pms-connections/:id', async (req, res, next) => {
  try {
    await deleteHotelPmsConnection({
      connectionId: req.params.id,
      hotelId: req.body?.hotelId || req.query.hotelId
    });

    res.status(200).json({
      ok: true
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/pms-connections/test', async (req, res, next) => {
  try {
    const result = await testPmsConnection({
      hotelId: req.body?.hotelId,
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

router.post('/pms-connections/sync', async (req, res, next) => {
  try {
    const summary = await syncHotelReservations({
      hotelId: req.body?.hotelId,
      provider: req.body?.provider || 'apaleo',
      from: normalizeDate(req.body?.from),
      to: normalizeDate(req.body?.to),
      status: req.body?.status,
      pageSize: Number(req.body?.pageSize || 25),
      maxReservations: Number(req.body?.maxReservations || 50)
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
