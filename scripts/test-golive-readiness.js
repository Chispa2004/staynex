import assert from 'node:assert/strict';
import {
  buildReadinessChecksFromContext,
  calculateReadinessScore,
  detectCriticalIssues,
  isHotelReadyForLive,
  summarizeReadiness
} from '../src/services/golive-readiness.service.js';

const baseEnv = {
  OPENAI_API_KEY: 'test-openai',
  SEND_AUTOMATIONS: 'false',
  RESEND_API_KEY: 'test-resend',
  RESEND_FROM: 'Staynex <noreply@example.com>',
  RESEND_DOMAIN_VERIFIED: 'true',
  GOOGLE_SHEETS_CLIENT_EMAIL: 'sheets@example.com',
  GOOGLE_SHEETS_PRIVATE_KEY: 'private',
  GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet'
};

const healthyContext = {
  hotel: {
    id: 'hotel-ready',
    name: 'Ready Hotel',
    whatsapp_number: '+212600000000',
    guest_data_retention_days: 30,
    metadata: {
      whatsapp_business_verified: true,
      academy_completed: true
    }
  },
  pmsConnections: [{
    provider: 'apaleo',
    enabled: true,
    sync_status: 'connected',
    last_sync_at: new Date().toISOString(),
    last_webhook_at: new Date().toISOString()
  }],
  reservations: [{ id: 'reservation-1' }],
  conversations: [{ id: 'conversation-1' }],
  aiLogs: [{ id: 'ai-1', openai_concierge_used: true }],
  tickets: [],
  users: [
    { id: 'admin', role: 'admin', status: 'active' },
    { id: 'reception', role: 'receptionist', status: 'active' }
  ],
  experienceBookings: [{ id: 'booking-1', provider_id: 'provider-1', lead_status: 'sent' }],
  localKnowledge: [{ id: 'knowledge-1' }],
  knowledgeEntries: [{ id: 'kb-1' }],
  dataRetentionAuditLogs: [{ id: 'retention-1' }],
  pmsIntelligenceHealth: { operationalContextHealth: 'active', lastPmsSync: new Date().toISOString() },
  googleSheetsLastSyncAt: new Date().toISOString(),
  env: baseEnv
};

const healthyChecks = buildReadinessChecksFromContext(healthyContext);
const healthySummary = summarizeReadiness({ hotelId: 'hotel-ready', checks: healthyChecks });
assert.equal(healthyChecks.find((item) => item.check_type === 'pms_connected').status, 'healthy');
assert.equal(healthyChecks.find((item) => item.check_type === 'ai_concierge_active').status, 'healthy');
assert.equal(healthySummary.ready_for_live, true);
assert.ok(calculateReadinessScore(healthyChecks) >= 80);
assert.equal(isHotelReadyForLive({ readinessScore: healthySummary.readiness_score, checks: healthyChecks }), true);

const missingWhatsappChecks = buildReadinessChecksFromContext({
  ...healthyContext,
  hotel: { ...healthyContext.hotel, whatsapp_number: null }
});
assert.equal(missingWhatsappChecks.find((item) => item.check_type === 'whatsapp_connected').status, 'critical');
assert.equal(detectCriticalIssues(missingWhatsappChecks).some((item) => item.check_type === 'whatsapp_connected'), true);
assert.equal(summarizeReadiness({ hotelId: 'hotel-blocked', checks: missingWhatsappChecks }).ready_for_live, false);

const providerEmailWarning = buildReadinessChecksFromContext({
  ...healthyContext,
  experienceBookings: [{ id: 'booking-failed', provider_id: 'provider-1', lead_status: 'failed' }]
});
assert.equal(providerEmailWarning.find((item) => item.check_type === 'provider_email_ready').status, 'warning');

const staleSyncWarning = buildReadinessChecksFromContext({
  ...healthyContext,
  pmsConnections: [{
    provider: 'apaleo',
    enabled: true,
    sync_status: 'connected',
    last_sync_at: '2024-01-01T00:00:00.000Z'
  }],
  reservations: [],
  pmsIntelligenceHealth: { operationalContextHealth: 'fallback', lastPmsSync: '2024-01-01T00:00:00.000Z' }
});
assert.equal(staleSyncWarning.find((item) => item.check_type === 'pms_sync_healthy').status, 'warning');

const sheetsWarning = buildReadinessChecksFromContext({
  ...healthyContext,
  googleSheetsLastSyncAt: null,
  env: {
    ...baseEnv,
    GOOGLE_SHEETS_CLIENT_EMAIL: '',
    GOOGLE_SHEETS_PRIVATE_KEY: '',
    GOOGLE_SHEETS_SPREADSHEET_ID: ''
  }
});
assert.equal(sheetsWarning.find((item) => item.check_type === 'google_sheets_sync').status, 'warning');

const liveModeBlocked = summarizeReadiness({ hotelId: 'hotel-blocked', checks: missingWhatsappChecks });
assert.equal(liveModeBlocked.ready_for_live, false);
assert.ok(liveModeBlocked.recommendations.some((item) => item.toLowerCase().includes('whatsapp')));

console.log('Go-live readiness tests passed');
