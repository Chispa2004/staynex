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

const backendProviderKeys = listPmsConnectors().map((provider) => provider.key);
assert.ok(backendProviderKeys.includes('pluriel'), 'Pluriel should be registered in backend PMS registry');
assert.ok(backendProviderKeys.includes('ubikos'), 'Ubikos should be registered in backend PMS registry');
assert.equal(getPmsConnectorDefinition('pluriel').status, 'beta');
assert.equal(getPmsConnectorDefinition('ubikos').status, 'coming_soon');

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
assert.equal(isArchivedHotel(fallbackUpdate), true);

const scopedOps = getScopedArchiveOperations('hotel-a', '2026-05-20T12:00:00.000Z');
assert.ok(scopedOps.length >= 5);
assert.ok(scopedOps.every((operation) => operation.matchColumn === 'hotel_id'));
assert.ok(scopedOps.every((operation) => operation.matchValue === 'hotel-a'));

console.log('Platform management, Academy and PMS connector tests passed');
