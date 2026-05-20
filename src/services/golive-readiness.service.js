import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

export const READINESS_STATUS = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  MISSING: 'missing',
  UNKNOWN: 'unknown'
};

export const GO_LIVE_THRESHOLD = 80;

const statusScore = {
  [READINESS_STATUS.HEALTHY]: 1,
  [READINESS_STATUS.WARNING]: 0.62,
  [READINESS_STATUS.UNKNOWN]: 0.42,
  [READINESS_STATUS.MISSING]: 0.18,
  [READINESS_STATUS.CRITICAL]: 0
};

const criticalCheckTypes = new Set([
  'pms_connected',
  'whatsapp_connected',
  'webhook_healthy',
  'ai_concierge_active',
  'no_critical_errors'
]);

const nowIso = () => new Date().toISOString();

const isRecent = (value, maxHours = 48) => {
  if (!value) return false;
  const ageMs = Date.now() - new Date(value).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxHours * 60 * 60 * 1000;
};

const check = ({
  checkType,
  category,
  status,
  score = Math.round((statusScore[status] ?? 0.4) * 100),
  severity = status === READINESS_STATUS.CRITICAL ? 'critical' : status === READINESS_STATUS.WARNING ? 'medium' : 'low',
  message,
  details = {}
}) => ({
  check_type: checkType,
  category,
  status,
  score,
  severity,
  message,
  details,
  checked_at: nowIso()
});

export const calculateReadinessScore = (checks = []) => {
  if (!checks.length) return 0;
  const total = checks.reduce((sum, item) => sum + Number(item.score ?? (statusScore[item.status] || 0) * 100), 0);
  return Math.max(0, Math.min(100, Math.round(total / checks.length)));
};

export const detectCriticalIssues = (checks = []) => checks.filter((item) => (
  item.status === READINESS_STATUS.CRITICAL
  || (criticalCheckTypes.has(item.check_type) && ['missing', 'unknown'].includes(item.status))
));

export const generateReadinessRecommendations = (checks = []) => checks
  .filter((item) => item.status !== READINESS_STATUS.HEALTHY)
  .map((item) => {
    const suggestions = {
      pms_connected: 'Connect a PMS or save a pending setup before onboarding live guests.',
      pms_sync_healthy: 'Run a fresh PMS sync and confirm reservations appear in Staynex.',
      whatsapp_connected: 'Configure the hotel WhatsApp number before go-live.',
      whatsapp_business_verified: 'Verify WhatsApp Business profile and branding.',
      webhook_healthy: 'Send a test guest message to confirm inbound webhooks are healthy.',
      provider_email_ready: 'Verify provider email delivery and Resend configuration before marketplace leads go live.',
      resend_domain_verified: 'Verify the Resend sending domain before activating live provider email.',
      google_sheets_sync: 'Run Google Sheets sync from Platform before reporting to external dashboards.',
      gdpr_cleanup_ready: 'Confirm retention settings and run GDPR cleanup dry-run.',
      academy_completed: 'Ask the team to complete Staynex Academy before pilot launch.',
      users_configured: 'Invite at least one admin and receptionist for operations.',
      no_critical_errors: 'Resolve urgent tickets and critical operational alerts before live mode.'
    };

    return suggestions[item.check_type] || item.message;
  })
  .slice(0, 8);

export const isHotelReadyForLive = ({ readinessScore = 0, checks = [] } = {}) => (
  readinessScore >= GO_LIVE_THRESHOLD && detectCriticalIssues(checks).length === 0
);

export const buildReadinessSnapshot = ({ hotelId, checks = [] } = {}) => {
  const readinessScore = calculateReadinessScore(checks);
  const healthyChecks = checks.filter((item) => item.status === READINESS_STATUS.HEALTHY).length;
  const warningChecks = checks.filter((item) => item.status === READINESS_STATUS.WARNING).length;
  const criticalChecks = detectCriticalIssues(checks).length;
  const missingChecks = checks.filter((item) => item.status === READINESS_STATUS.MISSING).length;

  return {
    hotel_id: hotelId || null,
    readiness_score: readinessScore,
    healthy_checks: healthyChecks,
    warning_checks: warningChecks,
    critical_checks: criticalChecks,
    missing_checks: missingChecks,
    ready_for_live: isHotelReadyForLive({ readinessScore, checks }),
    last_updated_at: nowIso()
  };
};

export const buildReadinessChecksFromContext = ({
  hotel = {},
  pmsConnections = [],
  reservations = [],
  conversations = [],
  aiLogs = [],
  tickets = [],
  users = [],
  experienceBookings = [],
  localKnowledge = [],
  knowledgeEntries = [],
  dataRetentionAuditLogs = [],
  pmsIntelligenceHealth = {},
  googleSheetsLastSyncAt = null,
  env = process.env
} = {}) => {
  const activePms = pmsConnections.find((item) => item.enabled && item.sync_status !== 'archived');
  const apaleoLive = activePms?.provider === 'apaleo';
  const latestPmsSync = activePms?.last_sync_at || pmsIntelligenceHealth.lastPmsSync;
  const urgentTickets = tickets.filter((ticket) => ticket.priority === 'urgent' && !['closed', 'resolved', 'completed'].includes(ticket.status));
  const aiHandled = aiLogs.filter((log) => log.ai_resolution_estimate || log.openai_concierge_used || log.response_text || log.generated_response);
  const failedProviderEmails = experienceBookings.filter((booking) => (booking.lead_status || booking.metadata?.provider_email_status) === 'failed');
  const providerBookings = experienceBookings.filter((booking) => booking.provider_id || booking.revenue_type === 'partner_marketplace' || booking.revenue_owner === 'staynex');
  const activeUsers = users.filter((user) => user.status === 'active');
  const validRoles = activeUsers.every((user) => ['owner', 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'analyst'].includes(user.role));
  const hasStaff = activeUsers.some((user) => ['owner', 'admin'].includes(user.role)) && activeUsers.some((user) => user.role === 'receptionist');
  const resendConfigured = Boolean(env.RESEND_API_KEY && (env.RESEND_FROM || env.EMAIL_FROM));
  const sheetsConfigured = Boolean(env.GOOGLE_SHEETS_CLIENT_EMAIL && env.GOOGLE_SHEETS_PRIVATE_KEY && env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const automationsPreview = env.SEND_AUTOMATIONS !== 'true';

  return [
    check({
      checkType: 'pms_connected',
      category: 'PMS',
      status: activePms ? READINESS_STATUS.HEALTHY : READINESS_STATUS.CRITICAL,
      message: activePms ? `${activePms.provider} PMS connection is configured.` : 'No PMS connection is active.'
    }),
    check({
      checkType: 'pms_sync_healthy',
      category: 'PMS',
      status: !activePms ? READINESS_STATUS.MISSING : isRecent(latestPmsSync, 48) || reservations.length > 0 ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: !activePms ? 'PMS sync cannot run until a connector is configured.' : isRecent(latestPmsSync, 48) ? 'PMS sync is recent.' : 'PMS sync is stale or has no recent run.',
      details: { latestPmsSync, reservations: reservations.length }
    }),
    check({
      checkType: 'whatsapp_connected',
      category: 'WhatsApp',
      status: hotel.whatsapp_number ? READINESS_STATUS.HEALTHY : READINESS_STATUS.CRITICAL,
      message: hotel.whatsapp_number ? 'WhatsApp number is configured.' : 'WhatsApp number is missing.'
    }),
    check({
      checkType: 'whatsapp_business_verified',
      category: 'WhatsApp',
      status: hotel.metadata?.whatsapp_business_verified ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: hotel.metadata?.whatsapp_business_verified ? 'WhatsApp Business profile is marked verified.' : 'WhatsApp Business verification is not marked complete.'
    }),
    check({
      checkType: 'webhook_healthy',
      category: 'Webhooks',
      status: conversations.length > 0 || activePms?.last_webhook_at ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: conversations.length > 0 || activePms?.last_webhook_at ? 'Inbound activity has been received.' : 'No recent inbound webhook activity detected.'
    }),
    check({
      checkType: 'ai_concierge_active',
      category: 'AI',
      status: env.OPENAI_API_KEY || aiHandled.length > 0 ? READINESS_STATUS.HEALTHY : READINESS_STATUS.CRITICAL,
      message: env.OPENAI_API_KEY || aiHandled.length > 0 ? 'AI Concierge is available.' : 'AI Concierge is not configured.'
    }),
    check({
      checkType: 'translation_active',
      category: 'AI',
      status: READINESS_STATUS.HEALTHY,
      message: 'Translation layer is enabled in Staynex.'
    }),
    check({
      checkType: 'guest_intelligence_active',
      category: 'AI',
      status: conversations.length > 0 || aiLogs.length > 0 ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: conversations.length > 0 || aiLogs.length > 0 ? 'Guest Intelligence has conversation signals.' : 'Guest Intelligence is ready but has no live signals yet.'
    }),
    check({
      checkType: 'revenue_ai_active',
      category: 'Revenue',
      status: localKnowledge.length || knowledgeEntries.length || providerBookings.length ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: localKnowledge.length || knowledgeEntries.length || providerBookings.length ? 'Revenue AI has catalog or knowledge signals.' : 'Revenue AI needs experiences, local knowledge or provider catalog.'
    }),
    check({
      checkType: 'automations_preview_ready',
      category: 'Automations',
      status: automationsPreview ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: automationsPreview ? 'Automations are in safe preview mode.' : 'SEND_AUTOMATIONS is live; confirm cooldowns before go-live.'
    }),
    check({
      checkType: 'provider_email_ready',
      category: 'Marketplace',
      status: failedProviderEmails.length ? READINESS_STATUS.WARNING : resendConfigured || providerBookings.length === 0 ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: failedProviderEmails.length ? 'Provider email failures detected.' : resendConfigured ? 'Provider email delivery is configured.' : 'Provider email is not configured yet.'
    }),
    check({
      checkType: 'resend_domain_verified',
      category: 'Marketplace',
      status: env.RESEND_DOMAIN_VERIFIED === 'true' || env.EMAIL_PROVIDER === 'smtp' ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: env.RESEND_DOMAIN_VERIFIED === 'true' ? 'Resend domain is marked verified.' : 'Resend domain verification is not marked complete.'
    }),
    check({
      checkType: 'google_sheets_sync',
      category: 'BI',
      status: sheetsConfigured ? (isRecent(googleSheetsLastSyncAt, 72) ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING) : READINESS_STATUS.WARNING,
      message: sheetsConfigured ? 'Google Sheets integration is configured.' : 'Google Sheets service account is not configured.'
    }),
    check({
      checkType: 'gdpr_cleanup_ready',
      category: 'Security',
      status: hotel.guest_data_retention_days || dataRetentionAuditLogs.length ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: hotel.guest_data_retention_days || dataRetentionAuditLogs.length ? 'GDPR retention policy is available.' : 'GDPR retention settings should be confirmed.'
    }),
    check({
      checkType: 'academy_completed',
      category: 'Staff',
      status: hotel.metadata?.academy_completed ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: hotel.metadata?.academy_completed ? 'Academy is marked complete.' : 'Staff Academy completion is not marked yet.'
    }),
    check({
      checkType: 'users_configured',
      category: 'Staff',
      status: hasStaff ? READINESS_STATUS.HEALTHY : activeUsers.length ? READINESS_STATUS.WARNING : READINESS_STATUS.CRITICAL,
      message: hasStaff ? 'Admin and receptionist users are active.' : 'Add active admin and receptionist users before launch.'
    }),
    check({
      checkType: 'roles_configured',
      category: 'Security',
      status: validRoles ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: validRoles ? 'User roles are valid.' : 'Some users have unexpected roles.'
    }),
    check({
      checkType: 'no_critical_errors',
      category: 'Operations',
      status: urgentTickets.length ? READINESS_STATUS.CRITICAL : READINESS_STATUS.HEALTHY,
      message: urgentTickets.length ? 'Critical or urgent operational tickets are open.' : 'No urgent operational blockers detected.'
    }),
    check({
      checkType: 'pms_intelligence_active',
      category: 'PMS',
      status: pmsIntelligenceHealth.operationalContextHealth === 'active' || apaleoLive ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: pmsIntelligenceHealth.operationalContextHealth === 'active' ? 'PMS Intelligence is active.' : 'PMS Intelligence is in fallback mode.'
    }),
    check({
      checkType: 'copilot_active',
      category: 'AI',
      status: READINESS_STATUS.HEALTHY,
      message: 'AI Copilot is available for reception.'
    }),
    check({
      checkType: 'marketplace_ready',
      category: 'Marketplace',
      status: providerBookings.length || localKnowledge.length ? READINESS_STATUS.HEALTHY : READINESS_STATUS.WARNING,
      message: providerBookings.length || localKnowledge.length ? 'Marketplace or local recommendations are ready.' : 'Add provider experiences or local recommendations.'
    })
  ];
};

export const summarizeReadiness = ({ hotelId, checks }) => {
  const snapshot = buildReadinessSnapshot({ hotelId, checks });
  const criticalIssues = detectCriticalIssues(checks);

  return {
    ...snapshot,
    checks,
    criticalIssues,
    recommendations: generateReadinessRecommendations(checks),
    threshold: GO_LIVE_THRESHOLD
  };
};

export const runHotelReadinessChecks = async (hotelId, { persist = true } = {}) => {
  const supabase = getSupabase();
  const [
    hotelResult,
    pmsConnections,
    reservations,
    conversations,
    aiLogs,
    tickets,
    users,
    experienceBookings,
    localKnowledge,
    knowledgeEntries,
    dataRetentionAuditLogs,
    roomStatusRows,
    occupancyRows,
    guestStayContexts
  ] = await Promise.all([
    supabase.from('hotels').select('*').eq('id', hotelId).single(),
    supabase.from('hotel_pms_connections').select('*').eq('hotel_id', hotelId),
    supabase.from('reservations').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('conversations').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('ai_logs').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('tickets').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('hotel_users').select('*').eq('hotel_id', hotelId),
    supabase.from('experience_booking_requests').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('local_knowledge_items').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('hotel_knowledge').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('data_retention_audit_logs').select('*').eq('hotel_id', hotelId).order('run_at', { ascending: false }).limit(5),
    supabase.from('room_status_snapshots').select('*').eq('hotel_id', hotelId).limit(100),
    supabase.from('hotel_occupancy_snapshots').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(1),
    supabase.from('guest_stay_context').select('*').eq('hotel_id', hotelId).limit(100)
  ]);

  if (hotelResult.error) throw hotelResult.error;

  const latestOccupancy = occupancyRows.data?.[0] || null;
  const checks = buildReadinessChecksFromContext({
    hotel: hotelResult.data,
    pmsConnections: pmsConnections.data || [],
    reservations: reservations.data || [],
    conversations: conversations.data || [],
    aiLogs: aiLogs.data || [],
    tickets: tickets.data || [],
    users: users.data || [],
    experienceBookings: experienceBookings.data || [],
    localKnowledge: localKnowledge.data || [],
    knowledgeEntries: knowledgeEntries.data || [],
    dataRetentionAuditLogs: dataRetentionAuditLogs.data || [],
    pmsIntelligenceHealth: {
      lastPmsSync: (pmsConnections.data || [])[0]?.last_sync_at || null,
      roomStatusAvailable: Boolean(roomStatusRows.data?.length),
      occupancyAvailable: Boolean(latestOccupancy),
      operationalContextHealth: roomStatusRows.data?.length || latestOccupancy || guestStayContexts.data?.length ? 'active' : 'fallback'
    }
  });
  const readiness = summarizeReadiness({ hotelId, checks });

  if (persist) {
    await persistReadinessResult({ supabase, hotelId, readiness });
  }

  return readiness;
};

export const persistReadinessResult = async ({ supabase, hotelId, readiness }) => {
  try {
    await supabase.from('hotel_readiness_checks').delete().eq('hotel_id', hotelId);
    await supabase.from('hotel_readiness_checks').insert(readiness.checks.map((item) => ({
      hotel_id: hotelId,
      ...item
    })));
    await supabase.from('hotel_readiness_snapshots').upsert({
      hotel_id: hotelId,
      readiness_score: readiness.readiness_score,
      healthy_checks: readiness.healthy_checks,
      warning_checks: readiness.warning_checks,
      critical_checks: readiness.critical_checks,
      missing_checks: readiness.missing_checks,
      ready_for_live: readiness.ready_for_live,
      last_updated_at: readiness.last_updated_at
    }, { onConflict: 'hotel_id' });
    await supabase.from('hotel_readiness_logs').insert({
      hotel_id: hotelId,
      event_type: 'readiness_recalculated',
      message: `Readiness recalculated: ${readiness.readiness_score}%`,
      metadata: {
        ready_for_live: readiness.ready_for_live,
        critical_issues: readiness.criticalIssues.map((item) => item.check_type)
      }
    });
  } catch (error) {
    logger.warn('golive_readiness_persist_failed', {
      hotelId,
      error: error.message
    });
  }
};
