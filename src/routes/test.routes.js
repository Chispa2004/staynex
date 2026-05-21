import { Router } from 'express';
import { handleTestMessage } from '../controllers/test.controller.js';
import { createLuxuryHotelDemoData } from '../services/demo-data.service.js';
import { sendProviderEmailTest } from '../services/provider-lead-email.service.js';
import { syncPlatformGoogleSheets } from '../services/platform-sheets-sync.service.js';
import {
  runStaynexSimulation,
  SIMULATION_HOTEL_TYPES,
  SIMULATION_SCENARIOS
} from '../services/simulation-mode.service.js';
import {
  analyzeSimulationFailures,
  getFailureIntelligenceHistory
} from '../services/failure-intelligence.service.js';
import { getSupabase } from '../services/supabase.service.js';

const router = Router();
const INTERNAL_PLATFORM_ROLES = ['platform_admin', 'super_admin', 'internal_only'];

const isMissingFailureIntelligenceTable = (error) => (
  error?.message?.includes('ai_quality_simulation_runs')
  || error?.message?.includes('failure_intelligence_events')
  || error?.details?.includes('ai_quality_simulation_runs')
  || error?.details?.includes('failure_intelligence_events')
);

const persistFailureIntelligenceRun = async ({ supabase, userId, result }) => {
  try {
    const { data: runRow, error: runError } = await supabase
      .from('ai_quality_simulation_runs')
      .insert({
        run_at: result.snapshot.runAt,
        ai_version: result.snapshot.aiVersion,
        filters: result.snapshot.filters,
        metrics: {
          qualityMetrics: result.snapshot.qualityMetrics,
          simulationMetrics: result.snapshot.simulationMetrics
        },
        success_rate: result.snapshot.simulationMetrics?.successRate || null,
        unsafe_count: result.snapshot.unsafeCount || 0,
        repeated_responses: result.snapshot.repeatedResponses || 0,
        top_failures: result.snapshot.topFailures || [],
        created_by: userId || null,
        metadata: {
          snapshot_id: result.snapshot.id,
          internal_only: true,
          mode: result.mode
        }
      })
      .select('id')
      .single();

    if (runError) {
      throw runError;
    }

    const reviewEvents = (result.classifications || [])
      .filter((item) => item.categories?.length || item.requiresManualReview)
      .map((item) => ({
        run_id: runRow.id,
        result_id: item.resultId,
        scenario: item.scenario,
        language: item.language,
        guest_type: item.guestType,
        hotel_type: item.hotelType,
        intent: item.intent,
        categories: item.categories || [],
        severity: item.severity,
        unsafe_reason: item.unsafeReason,
        requires_manual_review: Boolean(item.requiresManualReview),
        confidence: item.confidence,
        details: {
          pass: item.pass
        }
      }));

    if (reviewEvents.length) {
      const { error: eventsError } = await supabase
        .from('failure_intelligence_events')
        .insert(reviewEvents);

      if (eventsError) {
        throw eventsError;
      }
    }

    return {
      persisted: true,
      runId: runRow.id,
      events: reviewEvents.length
    };
  } catch (error) {
    if (!isMissingFailureIntelligenceTable(error)) {
      console.warn('failure_intelligence_history_persist_failed', {
        message: error.message
      });
    }

    return {
      persisted: false,
      error: error.message
    };
  }
};

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
    .in('platform_role', INTERNAL_PLATFORM_ROLES)
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

router.get('/api/simulation/catalog', (req, res) => {
  res.status(200).json({
    ok: true,
    hotelTypes: SIMULATION_HOTEL_TYPES,
    scenarios: SIMULATION_SCENARIOS.map(({ id, label }) => ({ id, label }))
  });
});

router.post('/api/simulation/run', (req, res, next) => {
  try {
    const result = runStaynexSimulation({
      count: req.body?.count,
      hotelType: req.body?.hotelType || req.body?.hotel_type || 'all',
      scenario: req.body?.scenario || 'all'
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

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

router.post('/api/platform/ai-quality/run', async (req, res, next) => {
  try {
    const { supabase, user } = await verifyPlatformAdminRequest(req);
    const result = analyzeSimulationFailures({
      count: req.body?.count,
      hotelType: req.body?.hotelType || req.body?.hotel_type || 'all',
      scenario: req.body?.scenario || 'all',
      aiVersion: req.body?.aiVersion || req.body?.ai_version
    });
    result.persistence = await persistFailureIntelligenceRun({
      supabase,
      userId: user.id,
      result
    });

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

router.get('/api/platform/ai-quality/history', async (req, res, next) => {
  try {
    await verifyPlatformAdminRequest(req);
    res.status(200).json(getFailureIntelligenceHistory());
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
