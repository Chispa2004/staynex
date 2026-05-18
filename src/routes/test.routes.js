import { Router } from 'express';
import { handleTestMessage } from '../controllers/test.controller.js';
import { createLuxuryHotelDemoData } from '../services/demo-data.service.js';
import { sendProviderEmailTest } from '../services/provider-lead-email.service.js';

const router = Router();

router.post('/test-message', handleTestMessage);

router.post('/api/platform/test-provider-email', async (req, res, next) => {
  try {
    const result = await sendProviderEmailTest({
      to: req.body?.to,
      subject: req.body?.subject,
      message: req.body?.message
    });

    res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    next(error);
  }
});

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
