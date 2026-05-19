import { Router } from 'express';
import { handleTestMessage } from '../controllers/test.controller.js';
import { createLuxuryHotelDemoData } from '../services/demo-data.service.js';
import { sendProviderEmailTest } from '../services/provider-lead-email.service.js';
import { syncPlatformGoogleSheets } from '../services/platform-sheets-sync.service.js';
import { getSupabase } from '../services/supabase.service.js';

const router = Router();

const verifyPlatformAdminRequest = async (req) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    const error = new Error('Platform admin authorization required');
    error.status = 401;
    throw error;
  }

  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user?.id) {
    const error = new Error('Invalid platform admin session');
    error.status = 401;
    throw error;
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from('hotel_users')
    .select('id, platform_role, status')
    .eq('user_id', userData.user.id)
    .eq('platform_role', 'platform_admin')
    .limit(1);

  if (assignmentError) {
    throw assignmentError;
  }

  if (!assignments?.length) {
    const error = new Error('Platform admin access required');
    error.status = 403;
    throw error;
  }

  return {
    supabase,
    user: userData.user
  };
};

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

router.post('/api/platform/sync-google-sheets', async (req, res, next) => {
  try {
    const { supabase } = await verifyPlatformAdminRequest(req);
    const result = await syncPlatformGoogleSheets({ supabase });

    res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      res.status(error.status).json({
        ok: false,
        error: error.message
      });
      return;
    }

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
