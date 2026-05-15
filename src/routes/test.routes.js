import { Router } from 'express';
import { handleTestMessage } from '../controllers/test.controller.js';
import { createLuxuryHotelDemoData } from '../services/demo-data.service.js';

const router = Router();

router.post('/test-message', handleTestMessage);

router.post('/demo-data/luxury', async (req, res, next) => {
  try {
    const summary = await createLuxuryHotelDemoData({
      hotelId: req.body?.hotelId || req.body?.hotel_id || null,
      clean: req.body?.clean !== false,
      applyHotelBranding: req.body?.applyHotelBranding !== false
    });

    res.status(200).json({
      ok: true,
      summary
    });
  } catch (error) {
    next(error);
  }
});

export default router;
