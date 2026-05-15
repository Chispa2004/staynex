import { Router } from 'express';
import { ApaleoConfigurationError } from '../integrations/apaleo/apaleo-auth.service.js';
import { syncReservationsFromApaleo } from '../integrations/apaleo/apaleo-sync.service.js';
import { getDefaultHotel } from '../services/hotel.service.js';

const router = Router();

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
      status: req.body?.status || undefined
    });

    res.status(200).json({
      ok: true,
      hotel,
      summary
    });
  } catch (error) {
    if (error instanceof ApaleoConfigurationError) {
      return res.status(400).json({
        ok: false,
        error: error.message,
        missing_env: error.missingEnv
      });
    }

    return next(error);
  }
});

export default router;
