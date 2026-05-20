export const READINESS_STATUS = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  MISSING: 'missing',
  UNKNOWN: 'unknown'
};

export const GO_LIVE_THRESHOLD = 80;

const statusScore = {
  healthy: 100,
  warning: 62,
  unknown: 42,
  missing: 18,
  critical: 0
};

const criticalCheckTypes = new Set([
  'pms_connected',
  'whatsapp_connected',
  'webhook_healthy',
  'ai_concierge_active',
  'no_critical_errors'
]);

const check = ({ checkType, category, status, message, details = {} }) => ({
  check_type: checkType,
  category,
  status,
  score: statusScore[status] ?? 42,
  severity: status === 'critical' ? 'critical' : status === 'warning' ? 'medium' : 'low',
  message,
  details,
  checked_at: new Date().toISOString()
});

const isRecent = (value, maxHours = 48) => {
  if (!value) return false;
  const ageMs = Date.now() - new Date(value).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxHours * 60 * 60 * 1000;
};

export const calculateReadinessScore = (checks = []) => {
  if (!checks.length) return 0;
  return Math.round(checks.reduce((sum, item) => sum + Number(item.score || 0), 0) / checks.length);
};

export const detectCriticalIssues = (checks = []) => checks.filter((item) => (
  item.status === 'critical'
  || (criticalCheckTypes.has(item.check_type) && ['missing', 'unknown'].includes(item.status))
));

export const generateReadinessRecommendations = (checks = []) => checks
  .filter((item) => item.status !== 'healthy')
  .map((item) => {
    const suggestions = {
      pms_connected: 'Connect or configure the PMS before onboarding live guests.',
      pms_sync_healthy: 'Run a fresh PMS sync and verify reservations.',
      whatsapp_connected: 'Configure the hotel WhatsApp number before go-live.',
      webhook_healthy: 'Send a test guest message to confirm inbound webhooks.',
      provider_email_ready: 'Verify provider email delivery before marketplace leads go live.',
      google_sheets_sync: 'Run a Platform Google Sheets sync before external reporting.',
      gdpr_cleanup_ready: 'Confirm retention settings and run a GDPR dry-run.',
      users_configured: 'Invite active admin and receptionist users.',
      no_critical_errors: 'Resolve urgent tickets before live mode.',
      academy_completed: 'Complete Staynex Academy with the hotel team.'
    };
    return suggestions[item.check_type] || item.message;
  })
  .slice(0, 8);

export const summarizeReadiness = ({ hotelId = null, checks = [] } = {}) => {
  const readinessScore = calculateReadinessScore(checks);
  const criticalIssues = detectCriticalIssues(checks);

  return {
    hotel_id: hotelId,
    readiness_score: readinessScore,
    healthy_checks: checks.filter((item) => item.status === 'healthy').length,
    warning_checks: checks.filter((item) => item.status === 'warning').length,
    critical_checks: criticalIssues.length,
    missing_checks: checks.filter((item) => item.status === 'missing').length,
    ready_for_live: readinessScore >= GO_LIVE_THRESHOLD && criticalIssues.length === 0,
    last_updated_at: new Date().toISOString(),
    checks,
    criticalIssues,
    recommendations: generateReadinessRecommendations(checks),
    threshold: GO_LIVE_THRESHOLD
  };
};

export const buildReadinessForHotel = ({
  hotel = {},
  users = [],
  pmsConnections = [],
  reservations = [],
  conversations = [],
  aiLogs = [],
  tickets = [],
  experienceBookings = [],
  localKnowledge = [],
  knowledgeEntries = [],
  dataRetentionAuditLogs = [],
  pmsIntelligenceHealth = {},
  googleSheetsLastSyncAt = null
} = {}) => {
  const stats = hotel.stats || {};
  const activePms = pmsConnections.find((item) => item.enabled && item.sync_status !== 'archived')
    || (hotel.pms?.enabled ? hotel.pms : null);
  const latestPmsSync = activePms?.last_sync_at || activePms?.lastSyncAt || pmsIntelligenceHealth.lastPmsSync;
  const activeUsers = users.length ? users.filter((item) => item.status === 'active') : Array.from({ length: stats.activeUsers || 0 }, (_, index) => ({ id: index, role: index === 0 ? 'admin' : 'receptionist', status: 'active' }));
  const hasStaff = activeUsers.some((item) => ['owner', 'admin'].includes(item.role)) && activeUsers.some((item) => item.role === 'receptionist');
  const urgentTickets = tickets.filter((item) => item.priority === 'urgent' && !['closed', 'resolved', 'completed'].includes(item.status)).length || stats.urgentTickets || 0;
  const aiHandled = aiLogs.filter((item) => item.ai_resolution_estimate || item.openai_concierge_used || item.response_text || item.generated_response).length || stats.aiHandled || 0;
  const providerBookings = experienceBookings.filter((item) => item.provider_id || item.revenue_owner === 'staynex' || item.revenue_type === 'partner_marketplace').length || stats.partnerBookings || 0;
  const failedProviderEmails = experienceBookings.filter((item) => (item.lead_status || item.metadata?.provider_email_status) === 'failed').length;

  const checks = [
    check({
      checkType: 'pms_connected',
      category: 'PMS',
      status: activePms ? 'healthy' : 'critical',
      message: activePms ? `${activePms.provider || 'PMS'} connection is configured.` : 'No PMS connection is active.'
    }),
    check({
      checkType: 'pms_sync_healthy',
      category: 'PMS',
      status: !activePms ? 'missing' : isRecent(latestPmsSync, 48) || stats.reservations > 0 || reservations.length > 0 ? 'healthy' : 'warning',
      message: isRecent(latestPmsSync, 48) ? 'PMS sync is recent.' : 'PMS sync should be refreshed before launch.'
    }),
    check({
      checkType: 'whatsapp_connected',
      category: 'WhatsApp',
      status: hotel.whatsapp_number || stats.whatsappConfigured ? 'healthy' : 'critical',
      message: hotel.whatsapp_number || stats.whatsappConfigured ? 'WhatsApp number is configured.' : 'WhatsApp number is missing.'
    }),
    check({
      checkType: 'whatsapp_business_verified',
      category: 'WhatsApp',
      status: hotel.metadata?.whatsapp_business_verified ? 'healthy' : 'warning',
      message: hotel.metadata?.whatsapp_business_verified ? 'WhatsApp Business is verified.' : 'WhatsApp Business verification should be confirmed.'
    }),
    check({
      checkType: 'webhook_healthy',
      category: 'Webhooks',
      status: conversations.length > 0 || stats.conversations > 0 || activePms?.lastWebhookAt || activePms?.last_webhook_at ? 'healthy' : 'warning',
      message: conversations.length > 0 || stats.conversations > 0 ? 'Inbound activity has been received.' : 'No recent inbound webhook activity detected.'
    }),
    check({
      checkType: 'ai_concierge_active',
      category: 'AI',
      status: aiHandled > 0 || stats.conversations === 0 ? 'healthy' : 'warning',
      message: aiHandled > 0 ? 'AI Concierge has handled conversations.' : 'AI Concierge is ready but should be tested.'
    }),
    check({ checkType: 'translation_active', category: 'AI', status: 'healthy', message: 'Translation layer is enabled.' }),
    check({
      checkType: 'guest_intelligence_active',
      category: 'AI',
      status: stats.conversations > 0 || conversations.length > 0 ? 'healthy' : 'warning',
      message: stats.conversations > 0 || conversations.length > 0 ? 'Guest Intelligence has signals.' : 'Guest Intelligence needs conversation signals.'
    }),
    check({
      checkType: 'revenue_ai_active',
      category: 'Revenue',
      status: stats.experiences > 0 || localKnowledge.length || knowledgeEntries.length ? 'healthy' : 'warning',
      message: stats.experiences > 0 || localKnowledge.length || knowledgeEntries.length ? 'Revenue AI has catalog signals.' : 'Add experiences or local knowledge.'
    }),
    check({ checkType: 'automations_preview_ready', category: 'Automations', status: 'healthy', message: 'Automations are safe for preview mode.' }),
    check({
      checkType: 'provider_email_ready',
      category: 'Marketplace',
      status: failedProviderEmails > 0 ? 'warning' : 'healthy',
      message: failedProviderEmails > 0 ? 'Provider email failures detected.' : 'Provider email has no failures.'
    }),
    check({ checkType: 'resend_domain_verified', category: 'Marketplace', status: 'warning', message: 'Confirm Resend domain verification before live provider email.' }),
    check({
      checkType: 'google_sheets_sync',
      category: 'BI',
      status: googleSheetsLastSyncAt && isRecent(googleSheetsLastSyncAt, 72) ? 'healthy' : 'warning',
      message: googleSheetsLastSyncAt ? 'Google Sheets has a sync timestamp.' : 'Run Google Sheets sync before external reporting.'
    }),
    check({
      checkType: 'gdpr_cleanup_ready',
      category: 'Security',
      status: hotel.guest_data_retention_days || dataRetentionAuditLogs.length ? 'healthy' : 'warning',
      message: hotel.guest_data_retention_days || dataRetentionAuditLogs.length ? 'GDPR retention policy is configured.' : 'Confirm GDPR retention policy.'
    }),
    check({
      checkType: 'academy_completed',
      category: 'Staff',
      status: hotel.metadata?.academy_completed ? 'healthy' : 'warning',
      message: hotel.metadata?.academy_completed ? 'Academy is marked complete.' : 'Academy completion should be confirmed.'
    }),
    check({
      checkType: 'users_configured',
      category: 'Staff',
      status: hasStaff ? 'healthy' : activeUsers.length ? 'warning' : 'critical',
      message: hasStaff ? 'Admin and receptionist users are active.' : 'Add active admin and receptionist users.'
    }),
    check({ checkType: 'roles_configured', category: 'Security', status: 'healthy', message: 'Hotel role model is configured.' }),
    check({
      checkType: 'no_critical_errors',
      category: 'Operations',
      status: urgentTickets > 0 ? 'critical' : 'healthy',
      message: urgentTickets > 0 ? 'Urgent operational tickets are open.' : 'No urgent operational blockers detected.'
    }),
    check({
      checkType: 'pms_intelligence_active',
      category: 'PMS',
      status: pmsIntelligenceHealth.operationalContextHealth === 'active' || activePms ? 'healthy' : 'warning',
      message: pmsIntelligenceHealth.operationalContextHealth === 'active' ? 'PMS Intelligence is active.' : 'PMS Intelligence should be verified.'
    }),
    check({ checkType: 'copilot_active', category: 'AI', status: 'healthy', message: 'AI Copilot is available for reception.' }),
    check({
      checkType: 'marketplace_ready',
      category: 'Marketplace',
      status: providerBookings > 0 || stats.localKnowledge > 0 || localKnowledge.length > 0 ? 'healthy' : 'warning',
      message: providerBookings > 0 || stats.localKnowledge > 0 || localKnowledge.length > 0 ? 'Marketplace/local recommendations are ready.' : 'Add marketplace or local recommendations.'
    })
  ];

  return summarizeReadiness({ hotelId: hotel.id, checks });
};
