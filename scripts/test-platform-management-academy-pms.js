import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PMS_PROVIDER_CATALOG } from '../dashboard/lib/pms-providers.js';
import {
  buildHotelArchiveFallbackUpdate,
  buildHotelArchiveUpdate,
  getScopedArchiveOperations,
  isArchivedHotel
} from '../dashboard/lib/platform-delete.js';
import {
  createPmsConnector,
  getPmsConnectorDefinition,
  listPmsConnectors
} from '../src/integrations/pms/registry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const academySource = readFileSync(join(root, 'dashboard/components/StaynexAcademyClient.js'), 'utf8');
for (const forbidden of ['Luxotour', 'Agafay', 'Marrakech Desert Dinner', 'Marrakech Quad', 'Marrakech Hammam']) {
  assert.equal(
    academySource.includes(forbidden),
    false,
    `Academy should not expose internal demo example: ${forbidden}`
  );
}

const dashboardProviderKeys = PMS_PROVIDER_CATALOG.map((provider) => provider.key);
assert.ok(dashboardProviderKeys.includes('pluriel'), 'Pluriel should be visible in dashboard PMS catalog');
assert.ok(dashboardProviderKeys.includes('ubikos'), 'Ubikos should be visible in dashboard PMS catalog');
assert.ok(dashboardProviderKeys.includes('roomraccoon'), 'RoomRaccoon should be visible in dashboard PMS catalog');
assert.ok(PMS_PROVIDER_CATALOG.every((provider) => provider.configurationMode), 'Every PMS card should be clickable into a mode');
assert.ok(PMS_PROVIDER_CATALOG.every((provider) => !/coming soon|available soon|beta connector/i.test(provider.statusLabel)), 'PMS labels should be actionable setup labels');

const backendProviderKeys = listPmsConnectors().map((provider) => provider.key);
assert.ok(backendProviderKeys.includes('pluriel'), 'Pluriel should be registered in backend PMS registry');
assert.ok(backendProviderKeys.includes('ubikos'), 'Ubikos should be registered in backend PMS registry');
assert.equal(getPmsConnectorDefinition('pluriel').status, 'setup_available');
assert.equal(getPmsConnectorDefinition('ubikos').status, 'setup_available');
assert.equal(getPmsConnectorDefinition('apaleo').statusLabel, 'Live API');
assert.equal(getPmsConnectorDefinition('pluriel').configurationMode, 'manual_setup');

const ubikosConnector = createPmsConnector('ubikos');
const ubikosHealth = await ubikosConnector.healthCheck();
assert.equal(ubikosHealth.ok, false);
assert.equal(ubikosHealth.status, 'placeholder');

const archiveUpdate = buildHotelArchiveUpdate({
  hotel: { id: 'hotel-a', name: 'Test Hotel', metadata: { source: 'test' } },
  now: '2026-05-20T12:00:00.000Z',
  actorId: 'platform-admin'
});
assert.equal(archiveUpdate.metadata.archived, true);
assert.equal(isArchivedHotel(archiveUpdate), true);

const fallbackUpdate = buildHotelArchiveFallbackUpdate({
  hotel: { name: 'Pilot Hotel', workspace_slug: 'pilot-hotel' },
  now: '2026-05-20T12:00:00.000Z'
});
assert.ok(fallbackUpdate.name.endsWith('(archived)'));
assert.equal(Object.prototype.hasOwnProperty.call(fallbackUpdate, 'whatsapp_number'), false);
assert.equal(isArchivedHotel(fallbackUpdate), true);

const scopedOps = getScopedArchiveOperations('hotel-a', '2026-05-20T12:00:00.000Z');
assert.ok(scopedOps.length >= 5);
assert.ok(scopedOps.every((operation) => operation.matchColumn === 'hotel_id'));
assert.ok(scopedOps.every((operation) => operation.matchValue === 'hotel-a'));

const providerApiSource = readFileSync(join(root, 'dashboard/app/api/platform/providers/route.js'), 'utf8');
assert.ok(providerApiSource.includes("action === 'create_experience'"), 'Platform providers API should create experiences');
assert.ok(providerApiSource.includes("action === 'update_experience'"), 'Platform providers API should update experiences');
assert.ok(providerApiSource.includes("action === 'set_experience_active'"), 'Platform providers API should activate and deactivate experiences');
assert.ok(providerApiSource.includes('provider_experience_soft_deleted'), 'Provider experience delete should be soft-delete/audit logged');
assert.ok(providerApiSource.includes("action === 'duplicate_experience'"), 'Platform providers API should duplicate experiences');
assert.ok(providerApiSource.includes("action === 'unassign_provider'"), 'Platform providers API should support provider unassignment');

const providerUiSource = readFileSync(join(root, 'dashboard/components/PlatformProvidersClient.js'), 'utf8');
assert.ok(providerUiSource.includes('Add experience'), 'Provider cards should expose Add experience');
assert.ok(providerUiSource.includes('Save changes'), 'Provider experience edit modal should save changes');
assert.ok(providerUiSource.includes('Deactivate'), 'Provider experience UI should expose deactivation');
assert.ok(providerUiSource.includes('Delete'), 'Provider experience UI should expose delete');
assert.ok(providerUiSource.includes('AI aliases / matching keywords'), 'Provider experience edit modal should manage AI aliases');

const platformMonitoringApiSource = readFileSync(join(root, 'dashboard/app/api/platform/monitoring/route.js'), 'utf8');
assert.ok(platformMonitoringApiSource.includes("canAccessPlatform(platformRole, 'platform_monitoring')"), 'Platform monitoring API must require internal observability permission');
assert.ok(platformMonitoringApiSource.includes('getPlatformContext'), 'Platform monitoring API should use platform context');

const platformMonitoringUiSource = readFileSync(join(root, 'dashboard/components/PlatformMonitoringClient.js'), 'utf8');
assert.ok(platformMonitoringUiSource.includes('Platform Monitoring'), 'Platform monitoring should show global system health');
assert.ok(platformMonitoringUiSource.includes('AI Health'), 'Platform monitoring should show AI health');
assert.ok(platformMonitoringUiSource.includes('Failed Events'), 'Platform monitoring should show failed events');
assert.ok(platformMonitoringUiSource.includes('Automation And Queue'), 'Platform monitoring should show automation and queue monitoring');

const hotelHealthApiSource = readFileSync(join(root, 'dashboard/app/api/health/hotel/route.js'), 'utf8');
assert.ok(hotelHealthApiSource.includes("canAccess(role, 'hotel_health')"), 'Hotel health API must require hotel health permission');
assert.equal(/OpenAI retries|schema cache|dead letter queue|repair mode/i.test(hotelHealthApiSource), false, 'Hotel health API should not expose internal technical wording');

console.log('Platform management, Academy and PMS connector tests passed');
