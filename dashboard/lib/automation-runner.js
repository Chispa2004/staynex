import {
  getCanonicalAutomationDefinitions,
  getLegacyRuleAutomationTypes,
  OPERATIONAL_STATUSES,
  getRuntimeCandidatesForDefinition,
  normalizeAutomationType
} from './automation-catalog.js';
import {
  DEFAULT_INTELLIGENT_AUTOMATIONS,
  isMissingAutomationColumn,
  isMissingAutomationEngineTables,
  mergeAutomationDefaults
} from './automation-engine.js';
import {
  buildRuntimeAutomationPreview,
  evaluateAutomationDecision
} from './automation-runtime.js';
import { writeAutomationDecisionToQueue } from './automation-queue-writer.js';

const ACTIVE_RESERVATION_STATUSES = ['confirmed', 'checked_in', 'in_house', 'checked_out'];
const LEGACY_RULE_TYPES = getLegacyRuleAutomationTypes();
const CANDIDATE_SELECTION_RANK = {
  engineDefault: 0,
  canonical: 1,
  legacyAlias: 2
};

const isMissingAutomationTables = (error) => (
  error?.message?.includes('automation_rules')
  || error?.message?.includes('scheduled_messages')
  || error?.details?.includes('automation_rules')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('automation_rules')
  || error?.hint?.includes('scheduled_messages')
  || isMissingAutomationEngineTables(error)
);

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (isMissingAutomationTables(error) || isMissingAutomationColumn(error)) {
      return fallback;
    }

    throw error;
  }

  return data || fallback;
};

const getRulesByType = async ({ supabase, hotelId }) => {
  const rows = await safeRows(supabase
    .from('automation_rules')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('automation_type', LEGACY_RULE_TYPES));

  return new Map(rows.map((rule) => [rule.automation_type, rule]));
};

const getEngineAutomationsByType = async ({ supabase, hotelId }) => {
  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('hotel_id', hotelId);

  if (error) {
    if (isMissingAutomationEngineTables(error)) {
      return new Map(DEFAULT_INTELLIGENT_AUTOMATIONS.map((automation) => [automation.type, automation]));
    }

    throw error;
  }

  return new Map(mergeAutomationDefaults(data || []).map((automation) => [automation.type, automation]));
};

const automationConfigForCandidate = ({ candidateType, definition, rulesByType, engineAutomationsByType }) => {
  const rule = rulesByType.get(candidateType);
  const engineAutomation = engineAutomationsByType.get(candidateType);

  if (engineAutomation) {
    return engineAutomation;
  }

  if (rule) {
    return {
      id: rule.id || null,
      type: candidateType,
      name: rule.name || candidateType,
      active: rule.is_active !== false,
      trigger_type: rule.automation_type || definition.trigger,
      audience_type: 'reservation_journey',
      cooldown_minutes: 1440,
      max_per_guest: 1,
      actions: {
        channel: rule.channel || 'whatsapp',
        estimated_revenue: 0
      }
    };
  }

  return {
    id: null,
    type: candidateType,
    name: definition.type,
    active: true,
    trigger_type: definition.trigger,
    audience_type: definition.category,
    cooldown_minutes: 1440,
    max_per_guest: 1,
    actions: {
      channel: 'whatsapp',
      estimated_revenue: 0
    }
  };
};

const loadExistingDecisionContext = async ({ supabase, hotelId }) => {
  const [recentScheduledMessages, recentRuns] = await Promise.all([
    safeRows(supabase
      .from('scheduled_messages')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(500)),
    safeRows(supabase
      .from('automation_runs')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(500))
  ]);

  return {
    recentScheduledMessages,
    recentRuns
  };
};

const incrementReason = (target, reason) => {
  const key = reason || 'unknown';
  target[key] = (target[key] || 0) + 1;
};

const rankRuntimeCandidate = ({ candidateType, definition }) => {
  if (candidateType === definition.engineDefaultType) {
    return CANDIDATE_SELECTION_RANK.engineDefault;
  }

  if (candidateType === definition.type) {
    return CANDIDATE_SELECTION_RANK.canonical;
  }

  return CANDIDATE_SELECTION_RANK.legacyAlias;
};

const getDeterministicRuntimeCandidates = (definition) => (
  [...getRuntimeCandidatesForDefinition(definition)].sort((left, right) => (
    rankRuntimeCandidate({ candidateType: left, definition })
    - rankRuntimeCandidate({ candidateType: right, definition })
    || String(left).localeCompare(String(right))
  ))
);

const decisionDedupeKey = (decision) => (
  decision?.hotelId && decision?.idempotencyKey
    ? `${decision.hotelId}:${decision.idempotencyKey}`
    : null
);

export const runDashboardAutomationScheduler = async ({
  supabase,
  hotel,
  now = new Date()
}) => {
  if (!hotel?.id) {
    throw new Error('hotelId is required for dashboard automation preview');
  }

  const reservations = await safeRows(supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotel.id)
    .in('status', ACTIVE_RESERVATION_STATUSES)
    .order('arrival_date', { ascending: true, nullsFirst: false })
    .limit(250));
  const rulesByType = await getRulesByType({ supabase, hotelId: hotel.id });
  const engineAutomationsByType = await getEngineAutomationsByType({ supabase, hotelId: hotel.id });
  const { recentScheduledMessages, recentRuns } = await loadExistingDecisionContext({ supabase, hotelId: hotel.id });
  const summary = {
    mode: 'preview',
    evaluatedReservations: reservations.length,
    eligible: 0,
    skipped: 0,
    preview: 0,
    blocked: 0,
    duplicate: 0,
    duplicateCandidate: 0,
    duplicateExisting: 0,
    failedWrites: 0,
    skipReasons: {}
  };
  const decisions = [];
  const scheduledMessages = [];
  const seenDecisionKeys = new Map();

  for (const reservation of reservations) {
    for (const definition of getCanonicalAutomationDefinitions()) {
      for (const candidateType of getDeterministicRuntimeCandidates(definition)) {
        const normalized = normalizeAutomationType(candidateType);
        const automation = automationConfigForCandidate({
          candidateType,
          definition,
          rulesByType,
          engineAutomationsByType
        });
        const decision = evaluateAutomationDecision({
          hotel,
          reservation,
          guest: null,
          automation,
          automationType: normalized.canonicalType,
          legacyType: normalized.legacyType || candidateType,
          trigger: automation.trigger_type || definition.trigger,
          executionMode: 'preview',
          now,
          recentRuns,
          recentScheduledMessages,
          metadata: {
            source: 'dashboard_runtime_preview',
            recentRuns,
            recentScheduledMessages,
            revenue_owner: automation.type === 'experience_recommendation' ? 'staynex' : 'hotel',
            estimated_revenue: Number(automation.actions?.estimated_revenue || 0)
          },
          templateVersion: definition.ruleVersion,
          source: 'dashboard_runtime_preview'
        });
        const duplicateKey = decisionDedupeKey(decision);
        const duplicateOf = duplicateKey ? seenDecisionKeys.get(duplicateKey) : null;

        if (duplicateOf) {
          summary.duplicate += 1;
          summary.duplicateCandidate += 1;
          summary.blocked += 1;
          incrementReason(summary.skipReasons, 'duplicate_candidate');
          decisions.push({
            ...decision,
            eligible: false,
            skipReason: 'duplicate_candidate',
            triggerReason: null,
            operationalStatus: OPERATIONAL_STATUSES.SKIPPED,
            duplicateCandidate: true,
            duplicateOf,
            messagePreview: null
          });
          continue;
        }

        if (duplicateKey) {
          seenDecisionKeys.set(duplicateKey, {
            automationType: decision.automationType,
            legacyType: decision.legacyType,
            candidateType,
            idempotencyKey: decision.idempotencyKey
          });
        }

        const messagePreview = decision.eligible
          ? buildRuntimeAutomationPreview({
            decision,
            hotel,
            reservation,
            language: hotel.default_language || 'es'
          })
          : null;

        decisions.push({
          ...decision,
          messagePreview: messagePreview || null
        });

        if (decision.eligible) {
          summary.eligible += 1;
        } else {
          summary.skipped += 1;
          incrementReason(summary.skipReasons, decision.skipReason);
        }

        try {
          const writeResult = await writeAutomationDecisionToQueue({
            supabase,
            decision,
            messagePreview,
            language: hotel.default_language || 'es',
            source: 'dashboard_runtime_preview',
            creationReason: decision.eligible ? decision.triggerReason : decision.skipReason,
            extraMetadata: {
              ai_provider: 'mock',
              ai_model: 'automation-runtime-preview',
              estimated_revenue: Number(automation.actions?.estimated_revenue || 0),
              revenue_owner: automation.type === 'experience_recommendation' ? 'staynex' : 'hotel'
            }
          });

          if (writeResult.status === 'preview') {
            summary.preview += writeResult.duplicate ? 0 : 1;
          }

          if (writeResult.duplicate) {
            summary.duplicate += 1;
            summary.duplicateExisting += 1;
            summary.blocked += 1;
            incrementReason(summary.skipReasons, 'duplicate_idempotency_key');
          }

          if (writeResult.scheduledMessage && !writeResult.duplicate) {
            scheduledMessages.push(writeResult.scheduledMessage);
            recentScheduledMessages.push(writeResult.scheduledMessage);
          }

          if (writeResult.automationRun) {
            recentRuns.push(writeResult.automationRun);
          }
        } catch (error) {
          summary.failedWrites += 1;
          summary.blocked += 1;
          incrementReason(summary.skipReasons, error.message);
        }
      }
    }
  }

  return {
    summary,
    decisions,
    scheduledMessages
  };
};
