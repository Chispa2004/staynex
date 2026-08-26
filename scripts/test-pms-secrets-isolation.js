import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PMS_CONNECTION_PRODUCTION_COLUMNS,
  pmsConnectionInternalSelectForSurface,
  pmsConnectionSelectForSurface,
  sanitizePmsConnectionMetadata,
  serializePmsConnectionSafe,
  serializePmsConnectionsSafe
} from '../shared/pms/safe-connection.js';

process.env.PMS_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const readSource = (path) => readFileSync(join(root, path), 'utf8');

const assertNoSerializedLeak = (value, forbiddenValues, label) => {
  const serialized = JSON.stringify(value);
  for (const forbidden of forbiddenValues) {
    assert.equal(serialized.includes(forbidden), false, `${label} must not include ${forbidden}`);
  }
};

const withCapturedConsoleLog = async (callback) => {
  const originalLog = console.log;
  const lines = [];
  console.log = (...items) => {
    lines.push(items.map((item) => String(item)).join(' '));
  };

  try {
    const result = await callback();
    return { result, output: lines.join('\n') };
  } finally {
    console.log = originalLog;
  }
};

const sampleConnection = {
  id: 'connection-1',
  hotel_id: 'hotel-1',
  provider: 'apaleo',
  client_id: 'client-id-safe',
  account_code: 'account-safe',
  property_id: 'property-safe',
  base_url: 'https://api.apaleo.example',
  enabled: true,
  status: 'active',
  connection_mode: 'live_api',
  sync_status: 'connected',
  last_sync_at: '2026-08-26T10:00:00.000Z',
  last_sync_error: 'provider returned token=should-not-leak',
  last_test_at: '2026-08-26T10:01:00.000Z',
  webhook_url: 'https://staynex.example/integrations/apaleo/webhook',
  webhook_enabled: true,
  webhook_status: 'healthy',
  last_webhook_at: '2026-08-26T10:02:00.000Z',
  last_webhook_error: 'basic auth should-not-leak',
  encrypted_client_secret: 'cipher-client-secret',
  webhook_secret: 'plain-webhook-secret',
  encrypted_webhook_secret: 'cipher-webhook-secret',
  credentials_encrypted: {
    api_key: 'cipher-top-api-key'
  },
  client_secret: 'plain-client-secret',
  api_key: 'plain-api-key',
  access_token: 'plain-access-token',
  refresh_token: 'plain-refresh-token',
  authorization: 'Bearer plain-authorization',
  password: 'plain-password',
  secret: 'plain-secret',
  metadata: {
    credentials_encrypted: {
      api_key: 'cipher-nested-api-key'
    },
    api_key: 'metadata-api-key',
    secret: 'metadata-secret',
    token: 'metadata-token',
    password: 'metadata-password',
    nested: {
      refresh_token: 'metadata-refresh-token',
      keep: 'safe nested value'
    },
    nested_array: [
      {
        token: 'metadata-array-token',
        keep: 'array safe value'
      }
    ],
    last_sync_summary: {
      synced: 7,
      fetched: 9
    },
    webhook_failed_count: 2
  },
  created_at: '2026-08-26T09:00:00.000Z',
  updated_at: '2026-08-26T10:03:00.000Z'
};

const forbiddenSecrets = [
  'cipher-client-secret',
  'plain-webhook-secret',
  'cipher-webhook-secret',
  'cipher-top-api-key',
  'plain-client-secret',
  'plain-api-key',
  'plain-access-token',
  'plain-refresh-token',
  'plain-authorization',
  'plain-password',
  'plain-secret',
  'cipher-nested-api-key',
  'metadata-api-key',
  'metadata-secret',
  'metadata-token',
  'metadata-password',
  'metadata-refresh-token',
  'metadata-array-token',
  'should-not-leak'
];

const productionSchemaColumns = [
  'id',
  'hotel_id',
  'provider',
  'client_id',
  'encrypted_client_secret',
  'account_code',
  'base_url',
  'enabled',
  'sync_status',
  'last_sync_at',
  'last_sync_error',
  'webhook_enabled',
  'webhook_status',
  'metadata',
  'created_at',
  'updated_at',
  'webhook_url',
  'webhook_secret',
  'last_webhook_at',
  'last_webhook_error',
  'encrypted_webhook_secret'
];
const productionSchemaColumnSet = new Set(productionSchemaColumns);
const unsupportedPmsConnectionColumns = [
  'property_id',
  'status',
  'last_test_at',
  'notes',
  'credentials_encrypted',
  'connection_mode'
];
const secretStateColumns = [
  'encrypted_client_secret',
  'webhook_secret',
  'encrypted_webhook_secret'
];
const safePmsSurfaces = ['tenant_settings', 'platform_summary', 'health', 'audit'];
const parsePmsSelectColumns = (select) => String(select || '')
  .split(',')
  .map((column) => column.trim())
  .filter(Boolean);

const assertPmsSelectUsesOnlyProductionColumns = (select, label) => {
  const columns = parsePmsSelectColumns(select);
  assert.ok(columns.length > 0, `${label} must select explicit columns`);
  assert.equal(new Set(columns).size, columns.length, `${label} must not contain duplicate columns`);

  for (const column of columns) {
    assert.ok(productionSchemaColumnSet.has(column), `${label} must not select unsupported PMS column ${column}`);
  }

  for (const column of unsupportedPmsConnectionColumns) {
    assert.equal(columns.includes(column), false, `${label} must not select ${column}`);
  }
};

const assertSafePmsSelect = (select, label) => {
  assertPmsSelectUsesOnlyProductionColumns(select, label);
  const columns = parsePmsSelectColumns(select);

  for (const column of secretStateColumns) {
    assert.equal(columns.includes(column), false, `${label} must not select ${column}`);
  }
};

const assertInternalPmsSelect = (select, label) => {
  assertPmsSelectUsesOnlyProductionColumns(select, label);
  const columns = parsePmsSelectColumns(select);

  for (const column of secretStateColumns) {
    assert.ok(columns.includes(column), `${label} must include ${column} for internal secret state`);
  }

  assert.equal(columns.includes('credentials_encrypted'), false, `${label} must not select missing top-level credentials_encrypted`);
};

const projectRows = (rows = [], select) => {
  const columns = parsePmsSelectColumns(select);
  return (rows || []).map((row) => columns.reduce((projected, column) => {
    if (Object.prototype.hasOwnProperty.call(row, column)) {
      projected[column] = row[column];
    }

    return projected;
  }, {}));
};

const createProductionPmsReadSupabaseMock = (tableRows) => {
  const queries = [];

  return {
    queries,
    from(table) {
      const query = {
        table,
        columns: null,
        select(columns) {
          query.columns = columns;
          queries.push({ table, columns });

          if (table === 'hotel_pms_connections') {
            assertPmsSelectUsesOnlyProductionColumns(columns, `${table} mock select`);
          }

          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          const rows = projectRows(tableRows[table] || [], query.columns);
          return { data: rows[0] || null, error: null };
        },
        async single() {
          const rows = projectRows(tableRows[table] || [], query.columns);
          return { data: rows[0] || null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: projectRows(tableRows[table] || [], query.columns),
            error: null
          }).then(resolve, reject);
        }
      };

      return query;
    }
  };
};

assert.deepEqual(PMS_CONNECTION_PRODUCTION_COLUMNS, productionSchemaColumns, 'canonical PMS production column list matches deployed schema');
for (const surface of safePmsSurfaces) {
  assertSafePmsSelect(pmsConnectionSelectForSurface(surface), `${surface} safe PMS selector`);
}
assertSafePmsSelect(pmsConnectionSelectForSurface('unknown_surface'), 'unknown surface safe PMS selector');
assertInternalPmsSelect(pmsConnectionInternalSelectForSurface('tenant_settings'), 'tenant settings internal PMS selector');
assertInternalPmsSelect(pmsConnectionInternalSelectForSurface('unknown_surface'), 'unknown surface internal PMS selector');

const productionSchemaConnection = productionSchemaColumns.reduce((row, column) => {
  row[column] = sampleConnection[column] ?? null;
  return row;
}, {});
productionSchemaConnection.metadata = {
  credentials_encrypted: {
    api_key: 'production-metadata-api-key'
  },
  property_id: 'metadata-property-id',
  notes: 'metadata notes are allowed in jsonb',
  last_test_at: '2026-08-26T10:01:00.000Z',
  visible: 'safe metadata value'
};
const productionMockSecrets = [
  'cipher-client-secret',
  'plain-webhook-secret',
  'cipher-webhook-secret',
  'production-metadata-api-key'
];

const pmsSettingsSupabase = createProductionPmsReadSupabaseMock({
  hotel_pms_connections: [productionSchemaConnection]
});
const pmsSettingsRows = await pmsSettingsSupabase
  .from('hotel_pms_connections')
  .select(pmsConnectionInternalSelectForSurface('tenant_settings'))
  .eq('hotel_id', 'hotel-1')
  .order('created_at', { ascending: false });
const pmsSettingsDtos = serializePmsConnectionsSafe(pmsSettingsRows.data, { surface: 'tenant_settings' });
assert.equal(pmsSettingsRows.error, null, 'PMS Settings mock loads without schema errors');
assert.equal(pmsSettingsDtos.length, 1, 'PMS Settings mock returns PMS connection DTOs');
assert.equal(pmsSettingsDtos[0].id, 'connection-1', 'PMS Settings DTO includes connection id');
assert.equal(pmsSettingsDtos[0].credential_configured, true, 'PMS Settings DTO keeps internal credential flag');
assert.equal(pmsSettingsDtos[0].webhook_secret_configured, true, 'PMS Settings DTO keeps internal webhook flag');
assert.equal(Object.prototype.hasOwnProperty.call(pmsSettingsDtos[0], 'encrypted_client_secret'), false, 'PMS Settings DTO strips encrypted_client_secret');
assert.equal(Object.prototype.hasOwnProperty.call(pmsSettingsDtos[0], 'webhook_secret'), false, 'PMS Settings DTO strips webhook_secret');
assert.equal(Object.prototype.hasOwnProperty.call(pmsSettingsDtos[0], 'encrypted_webhook_secret'), false, 'PMS Settings DTO strips encrypted_webhook_secret');
assertNoSerializedLeak(pmsSettingsDtos, productionMockSecrets, 'PMS Settings mock DTOs');

const platformSupabase = createProductionPmsReadSupabaseMock({
  hotel_pms_connections: [productionSchemaConnection]
});
const platformRows = await platformSupabase
  .from('hotel_pms_connections')
  .select(pmsConnectionSelectForSurface('platform_summary'));
const platformDtos = serializePmsConnectionsSafe(platformRows.data, { surface: 'platform_summary' });
assert.equal(platformRows.error, null, 'Platform mock loads without schema errors');
assert.equal(platformDtos[0].provider, 'apaleo', 'Platform safe DTO loads provider');
assert.equal(platformDtos[0].credential_configured, false, 'Platform safe DTO does not depend on secret columns');
assertNoSerializedLeak(platformDtos, productionMockSecrets, 'Platform mock DTOs');

const healthSupabase = createProductionPmsReadSupabaseMock({
  hotel_pms_connections: [productionSchemaConnection]
});
const healthRows = await healthSupabase
  .from('hotel_pms_connections')
  .select(pmsConnectionSelectForSurface('health'));
const healthDtos = serializePmsConnectionsSafe(healthRows.data, { surface: 'health' });
assert.equal(healthRows.error, null, 'Health mock loads without schema errors');
assert.equal(healthDtos[0].metadata.visible, 'safe metadata value', 'Health safe DTO keeps non-secret metadata');
assert.equal(healthDtos[0].metadata.credentials_encrypted, undefined, 'Health safe DTO strips nested credentials_encrypted');
assertNoSerializedLeak(healthDtos, productionMockSecrets, 'Health mock DTOs');

const readinessSupabase = createProductionPmsReadSupabaseMock({
  hotel_pms_connections: [productionSchemaConnection]
});
const readinessRows = await readinessSupabase
  .from('hotel_pms_connections')
  .select(pmsConnectionSelectForSurface('health'))
  .eq('hotel_id', 'hotel-1');
const readinessDtos = serializePmsConnectionsSafe(readinessRows.data, { surface: 'health' });
assert.equal(readinessRows.error, null, 'Readiness mock loads without schema errors');
assert.equal(readinessDtos[0].enabled, true, 'Readiness safe DTO loads enabled connection');

const tenantDto = serializePmsConnectionSafe(sampleConnection, { surface: 'tenant_settings' });

assert.equal(Object.prototype.hasOwnProperty.call(tenantDto, 'encrypted_client_secret'), false, 'serializer removes encrypted_client_secret');
assert.equal(Object.prototype.hasOwnProperty.call(tenantDto, 'webhook_secret'), false, 'serializer removes webhook_secret');
assert.equal(Object.prototype.hasOwnProperty.call(tenantDto, 'encrypted_webhook_secret'), false, 'serializer removes encrypted_webhook_secret');
assert.equal(Object.prototype.hasOwnProperty.call(tenantDto, 'credentials_encrypted'), false, 'serializer removes top-level credentials_encrypted');
assert.equal(tenantDto.metadata?.nested?.keep, 'safe nested value', 'serializer keeps non-secret nested metadata');
assert.equal(tenantDto.metadata?.nested_array?.[0]?.keep, 'array safe value', 'serializer keeps non-secret array metadata');
assert.equal(tenantDto.metadata?.credentials_encrypted, undefined, 'serializer removes nested credentials_encrypted');
assert.equal(tenantDto.metadata?.api_key, undefined, 'serializer removes nested api_key');
assert.equal(tenantDto.metadata?.nested?.refresh_token, undefined, 'serializer recursively removes nested refresh_token');
assert.equal(tenantDto.metadata?.nested_array?.[0]?.token, undefined, 'serializer recursively removes array token fields');
assert.equal(tenantDto.credential_configured, true, 'serializer reports credentials configured');
assert.equal(tenantDto.has_client_secret, true, 'serializer reports client secret configured');
assert.equal(tenantDto.api_key_configured, true, 'serializer reports API key configured');
assert.equal(tenantDto.webhook_secret_configured, true, 'serializer reports webhook secret configured');
assert.equal(tenantDto.last_sync_error, 'redacted_sensitive_error', 'serializer sanitizes secret-like sync errors');
assert.equal(tenantDto.last_webhook_error, 'redacted_sensitive_error', 'serializer sanitizes secret-like webhook errors');
assertNoSerializedLeak(tenantDto, forbiddenSecrets, 'tenant PMS DTO');

const strictDto = serializePmsConnectionSafe(sampleConnection, { surface: 'unexpected_surface' });
assert.equal(strictDto.metadata, undefined, 'unknown surface uses strict output without metadata');
assert.equal(strictDto.client_id, undefined, 'unknown surface does not expose client id');
assert.equal(strictDto.account_code, undefined, 'unknown surface does not expose account code');
assert.equal(strictDto.provider, 'apaleo', 'strict output keeps operational provider');
assertNoSerializedLeak(strictDto, forbiddenSecrets, 'strict PMS DTO');

const cleanedMetadata = sanitizePmsConnectionMetadata({
  public_note: 'keep',
  webhook_secret: 'metadata-webhook-secret',
  nested: {
    password: 'metadata-password',
    visible: 'yes'
  }
});
assert.deepEqual(cleanedMetadata, {
  public_note: 'keep',
  nested: {
    visible: 'yes'
  }
}, 'PMS metadata sanitizer strips nested secret-shaped fields before storage');

const { encryptSecret, decryptSecret } = await import('../src/utils/encryption.js');
const {
  resolvePmsWebhookSecret,
  saveHotelPmsConnection,
  updateHotelPmsConnection
} = await import('../src/services/pms-connections.service.js');
const { writeEnterpriseAuditLog } = await import('../dashboard/lib/enterprise-audit.js');
const {
  buildPlatformSheetsRows,
  loadPlatformSheetsData
} = await import('../src/services/platform-sheets-sync.service.js');

const backfillImportLogs = [];
const originalConsoleLog = console.log;
console.log = (...items) => {
  backfillImportLogs.push(items.map((item) => String(item)).join(' '));
};
const backfillModule = await import('../scripts/backfill-encrypted-webhook-secrets.js');
console.log = originalConsoleLog;

assert.deepEqual(backfillImportLogs, [], 'importing backfill module must not run main or print output');

const { parseBackfillOptions, runBackfillEncryptedWebhookSecrets } = backfillModule;

const syntheticWebhookSecret = 'synthetic-webhook-secret';
const encryptedWebhookSecret = encryptSecret(syntheticWebhookSecret);
assert.match(encryptedWebhookSecret, /^v1:/, 'encrypted webhook secret uses PMS encryption format');
assert.notEqual(encryptedWebhookSecret, syntheticWebhookSecret, 'encrypted webhook secret is ciphertext');
assert.equal(decryptSecret(encryptedWebhookSecret), syntheticWebhookSecret, 'PMS encryption primitive decrypts back to original secret');

assert.equal(
  resolvePmsWebhookSecret({
    encrypted_webhook_secret: encryptedWebhookSecret,
    webhook_secret: 'legacy-webhook-secret'
  }),
  syntheticWebhookSecret,
  'encrypted read wins over legacy plaintext fallback'
);
assert.equal(
  resolvePmsWebhookSecret({ encrypted_webhook_secret: encryptedWebhookSecret }),
  syntheticWebhookSecret,
  'encrypted-only read decrypts encrypted webhook secret'
);
assert.equal(
  resolvePmsWebhookSecret({ webhook_secret: 'legacy-webhook-secret' }),
  'legacy-webhook-secret',
  'legacy plaintext fallback remains internal for Stage A'
);
assert.equal(resolvePmsWebhookSecret({}), null, 'missing webhook secret resolves to null');
assert.equal(resolvePmsWebhookSecret(null), null, 'missing connection resolves to null');

const createPmsWriteSupabaseMock = () => {
  const calls = [];

  return {
    calls,
    from(table) {
      assert.equal(table, 'hotel_pms_connections', 'PMS write tests only touch PMS connections table');

      return {
        upsert(record, options) {
          const call = { action: 'upsert', table, record, options };
          calls.push(call);

          return {
            select(columns) {
              call.select = columns;

              return {
                async single() {
                  return {
                    data: {
                      id: 'connection-new',
                      created_at: '2026-08-26T10:00:00.000Z',
                      ...record
                    },
                    error: null
                  };
                }
              };
            }
          };
        },
        update(record) {
          const call = { action: 'update', table, record, filters: [] };
          calls.push(call);
          const query = {
            eq(key, value) {
              call.filters.push({ key, value });
              return query;
            },
            select(columns) {
              call.select = columns;

              return {
                async single() {
                  return {
                    data: {
                      id: 'connection-existing',
                      hotel_id: 'hotel-1',
                      provider: 'apaleo',
                      enabled: true,
                      status: 'active',
                      sync_status: 'configured',
                      created_at: '2026-08-26T10:00:00.000Z',
                      ...record
                    },
                    error: null
                  };
                }
              };
            }
          };

          return query;
        }
      };
    }
  };
};

const saveSupabase = createPmsWriteSupabaseMock();
const { result: savedConnection, output: saveOutput } = await withCapturedConsoleLog(() => saveHotelPmsConnection({
  supabase: saveSupabase,
  hotelId: 'hotel-1',
  provider: 'apaleo',
  clientId: 'client-id-safe',
  clientSecret: 'synthetic-client-secret',
  accountCode: 'account-safe',
  webhookSecret: 'synthetic-save-webhook-secret',
  metadata: {
    webhook_secret: 'metadata-save-webhook-secret',
    credentials_encrypted: {
      api_key: 'metadata-save-api-key'
    },
    visible: 'kept'
  }
}));
const saveRecord = saveSupabase.calls.find((call) => call.action === 'upsert').record;
assert.match(saveRecord.encrypted_webhook_secret, /^v1:/, 'save path persists encrypted webhook secret');
assert.equal(Object.prototype.hasOwnProperty.call(saveRecord, 'webhook_secret'), false, 'save path never writes plaintext webhook_secret');
assert.equal(saveRecord.metadata.webhook_secret, undefined, 'save path strips webhook_secret from metadata before storage');
assert.equal(saveRecord.metadata.credentials_encrypted, undefined, 'save path strips secret-bearing metadata before storage');
assert.equal(savedConnection.webhook_secret_configured, true, 'save response reports safe webhook flag');
assertNoSerializedLeak(savedConnection, [
  'synthetic-save-webhook-secret',
  'metadata-save-webhook-secret',
  'metadata-save-api-key',
  saveRecord.encrypted_webhook_secret
], 'save response');
assertNoSerializedLeak(saveOutput, ['synthetic-save-webhook-secret', 'synthetic-client-secret'], 'save logs');

const updateSupabase = createPmsWriteSupabaseMock();
const updatedConnection = await updateHotelPmsConnection({
  supabase: updateSupabase,
  hotelId: 'hotel-1',
  connectionId: 'connection-existing',
  updates: {
    webhook_secret: 'synthetic-update-webhook-secret',
    clientSecret: 'synthetic-update-client-secret',
    metadata: {
      public_note: 'safe'
    }
  }
});
const updateRecord = updateSupabase.calls.find((call) => call.action === 'update').record;
assert.match(updateRecord.encrypted_webhook_secret, /^v1:/, 'update path persists encrypted webhook secret');
assert.equal(Object.prototype.hasOwnProperty.call(updateRecord, 'webhook_secret'), false, 'update path never writes plaintext webhook_secret');
assert.equal(updatedConnection.webhook_secret_configured, true, 'update response reports safe webhook flag');
assertNoSerializedLeak(updatedConnection, [
  'synthetic-update-webhook-secret',
  'synthetic-update-client-secret',
  updateRecord.encrypted_webhook_secret
], 'update response');

const apiDto = serializePmsConnectionSafe(sampleConnection, { surface: 'tenant_settings' });
assert.equal(apiDto.credential_configured, true, 'API DTO reports credentials configured');
assert.equal(apiDto.webhook_secret_configured, true, 'API DTO reports webhook secret configured');
assertNoSerializedLeak(apiDto, forbiddenSecrets, 'API DTO');

const platformPmsSummaries = serializePmsConnectionsSafe([sampleConnection], { surface: 'platform_summary' });
const platformPayload = {
  raw: {
    pmsConnectionSummaries: platformPmsSummaries
  }
};
assert.equal(Object.prototype.hasOwnProperty.call(platformPayload.raw, 'pmsConnections'), false, 'platform payload does not expose raw pmsConnections');
assertNoSerializedLeak(platformPayload, forbiddenSecrets, 'platform output');

const auditRows = [];
const auditSupabase = {
  from(table) {
    assert.equal(table, 'enterprise_audit_logs', 'audit test only writes enterprise audit rows');

    return {
      async insert(record) {
        auditRows.push(record);
        return { data: null, error: null };
      }
    };
  }
};
await writeEnterpriseAuditLog({
  supabase: auditSupabase,
  actor: { id: 'user-1', email: 'auditor@example.com' },
  actorRole: 'admin',
  actorPlatformRole: 'platform_admin',
  hotelId: 'hotel-1',
  action: 'pms_settings_changed',
  entityType: 'hotel_pms_connection',
  entityId: sampleConnection.id,
  oldValues: serializePmsConnectionSafe(sampleConnection, { surface: 'audit' }),
  newValues: serializePmsConnectionSafe({
    ...sampleConnection,
    enabled: false,
    webhook_secret: 'changed-plain-webhook-secret',
    encrypted_webhook_secret: 'changed-cipher-webhook-secret',
    credentials_encrypted: {
      api_key: 'changed-cipher-api-key'
    }
  }, { surface: 'audit' }),
  metadata: { provider: 'apaleo', source: 'dashboard_pms_connections' }
});
assert.equal(auditRows.length, 1, 'audit write is executed');
assert.equal(auditRows[0].old_values_summary.webhook_secret_configured, true, 'audit old values keep safe boolean flags');
assert.equal(auditRows[0].new_values_summary.webhook_secret_configured, true, 'audit new values keep safe boolean flags');
assertNoSerializedLeak(auditRows[0], [
  ...forbiddenSecrets,
  'changed-plain-webhook-secret',
  'changed-cipher-webhook-secret',
  'changed-cipher-api-key'
], 'audit payload');

const createReadSupabaseMock = (tableRows) => {
  const queries = [];

  return {
    queries,
    from(table) {
      const query = {
        table,
        columns: null,
        select(columns) {
          query.columns = columns;
          queries.push({ table, columns });
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        eq() {
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: tableRows[table] || [],
            error: null
          }).then(resolve, reject);
        }
      };

      return query;
    }
  };
};

const sheetsSupabase = createReadSupabaseMock({
  hotels: [{
    id: 'hotel-1',
    name: 'Hotel Safe',
    whatsapp_number: '+100000000',
    created_at: '2026-08-26T10:00:00.000Z',
    updated_at: '2026-08-26T10:00:00.000Z'
  }],
  hotel_pms_connections: [sampleConnection]
});
const sheetsData = await loadPlatformSheetsData(sheetsSupabase);
assert.equal(sheetsData.pmsConnections[0].webhook_secret_configured, true, 'Sheets data keeps PMS configured flag');
assertNoSerializedLeak(sheetsData.pmsConnections, forbiddenSecrets, 'Sheets loaded PMS connections');
const sheetsRows = buildPlatformSheetsRows(sheetsData);
assertNoSerializedLeak(sheetsRows, forbiddenSecrets, 'Sheets rows');

assert.equal(parseBackfillOptions({ args: [], env: {} }).dryRun, true, 'backfill defaults to dry-run');
assert.equal(
  parseBackfillOptions({
    args: [],
    env: { BACKFILL_ENCRYPTED_WEBHOOK_SECRETS: 'true' }
  }).dryRun,
  true,
  'backfill env alone remains dry-run'
);
assert.throws(
  () => parseBackfillOptions({ args: ['--mutate'], env: {} }),
  /Mutating mode requires BACKFILL_ENCRYPTED_WEBHOOK_SECRETS=true and --mutate/,
  'backfill mutate flag without env is rejected'
);
assert.equal(
  parseBackfillOptions({
    args: ['--mutate'],
    env: { BACKFILL_ENCRYPTED_WEBHOOK_SECRETS: 'true' }
  }).dryRun,
  false,
  'backfill mutation requires env plus flag'
);

const createBackfillSupabaseMock = ({
  rows,
  updateFailures = new Set(),
  selectError = null
}) => {
  const updates = [];

  return {
    updates,
    from(table) {
      assert.equal(table, 'hotel_pms_connections', 'backfill only touches PMS connections table');
      const state = {
        filters: []
      };
      const query = {
        select(columns) {
          state.select = columns;
          return query;
        },
        order(column, options) {
          state.order = { column, options };
          return query;
        },
        async limit(limit) {
          state.limit = limit;
          return {
            data: selectError ? null : rows,
            error: selectError
          };
        },
        update(record) {
          state.update = record;
          return query;
        },
        eq(key, value) {
          state.filters.push({ key, value });
          return query;
        },
        is(key, value) {
          state.filters.push({ key, value });
          return query;
        },
        async maybeSingle() {
          const id = state.filters.find((filter) => filter.key === 'id')?.value;
          const row = rows.find((item) => item.id === id);

          if (updateFailures.has(id)) {
            return { data: null, error: { message: 'safe update failure' } };
          }

          if (!row || row.encrypted_webhook_secret) {
            return { data: null, error: null };
          }

          row.encrypted_webhook_secret = state.update.encrypted_webhook_secret;
          updates.push({ id, record: state.update });

          return { data: { id }, error: null };
        }
      };

      return query;
    }
  };
};

const backfillRows = [
  { id: 'conn-a', webhook_secret: 'alpha-plain-secret', encrypted_webhook_secret: null },
  { id: 'conn-b', webhook_secret: 'bravo-plain-secret', encrypted_webhook_secret: 'v1:existing-bravo' },
  { id: 'conn-c', webhook_secret: null, encrypted_webhook_secret: 'v1:existing-charlie' },
  { id: 'conn-d', webhook_secret: 'delta-plain-secret', encrypted_webhook_secret: null },
  { id: 'conn-e', webhook_secret: 'echo-plain-secret', encrypted_webhook_secret: null }
];
const backfillDryRun = await runBackfillEncryptedWebhookSecrets({
  supabase: createBackfillSupabaseMock({ rows: backfillRows.map((row) => ({ ...row })) }),
  encrypt: () => {
    throw new Error('dry-run must not encrypt');
  },
  options: parseBackfillOptions({ args: ['--show-ids'], env: {} })
});
assert.deepEqual(backfillDryRun.candidateIds, ['conn-a', 'conn-d', 'conn-e'], 'dry-run reports only plaintext-only candidate IDs');
assert.equal(backfillDryRun.updated, 0, 'dry-run does not update rows');
assert.equal(backfillDryRun.skippedAlreadyEncrypted, 1, 'plaintext plus encrypted row is skipped');
assert.equal(backfillDryRun.skippedMissingPlaintext, 1, 'encrypted-only row is skipped as missing plaintext');
assertNoSerializedLeak(backfillDryRun, ['alpha-plain-secret', 'bravo-plain-secret', 'delta-plain-secret', 'echo-plain-secret'], 'backfill dry-run summary');

let encryptedSequence = 0;
const encryptedBySecret = new Map();
const encryptCounts = new Map();
const deterministicEncrypt = (secret) => {
  encryptCounts.set(secret, (encryptCounts.get(secret) || 0) + 1);

  if (secret === 'delta-plain-secret') {
    throw new Error('synthetic encryption failure');
  }

  if (!encryptedBySecret.has(secret)) {
    encryptedSequence += 1;
    encryptedBySecret.set(secret, `v1:test-cipher-${encryptedSequence}`);
  }

  return encryptedBySecret.get(secret);
};

const mutatingSupabase = createBackfillSupabaseMock({
  rows: backfillRows,
  updateFailures: new Set(['conn-e'])
});
const firstMutation = await runBackfillEncryptedWebhookSecrets({
  supabase: mutatingSupabase,
  encrypt: deterministicEncrypt,
  options: parseBackfillOptions({
    args: ['--mutate'],
    env: { BACKFILL_ENCRYPTED_WEBHOOK_SECRETS: 'true' }
  })
});
assert.equal(firstMutation.candidates, 3, 'mutating backfill finds plaintext-only candidates');
assert.equal(firstMutation.updated, 1, 'mutating backfill updates successful candidate');
assert.equal(firstMutation.failed, 2, 'mutating backfill counts encryption and update failures safely');
assert.equal(firstMutation.skippedAlreadyEncrypted, 1, 'mutating backfill skips row that already has encrypted value');
assert.equal(firstMutation.skippedMissingPlaintext, 1, 'mutating backfill skips encrypted-only row');
assert.equal(backfillRows.find((row) => row.id === 'conn-a').encrypted_webhook_secret, 'v1:test-cipher-1', 'successful candidate is marked encrypted');
assert.equal(backfillRows.find((row) => row.id === 'conn-e').encrypted_webhook_secret, null, 'update failure remains rerunnable');
assertNoSerializedLeak(firstMutation, ['alpha-plain-secret', 'delta-plain-secret', 'echo-plain-secret'], 'first backfill mutation summary');

const retrySupabase = createBackfillSupabaseMock({ rows: backfillRows });
const secondMutation = await runBackfillEncryptedWebhookSecrets({
  supabase: retrySupabase,
  encrypt: deterministicEncrypt,
  options: parseBackfillOptions({
    args: ['--mutate'],
    env: { BACKFILL_ENCRYPTED_WEBHOOK_SECRETS: 'true' }
  })
});
assert.equal(secondMutation.candidates, 2, 'retry only sees rows that still need encrypted values');
assert.equal(secondMutation.updated, 1, 'retry can update the previous update failure');
assert.equal(secondMutation.failed, 1, 'retry still reports encryption failure safely');
assert.equal(encryptCounts.get('alpha-plain-secret'), 1, 'second run does not re-encrypt row already migrated');
assert.equal(backfillRows.find((row) => row.id === 'conn-e').encrypted_webhook_secret, 'v1:test-cipher-2', 'rerun can complete previous update failure');
assertNoSerializedLeak(secondMutation, ['delta-plain-secret', 'echo-plain-secret'], 'second backfill mutation summary');

let selectFailure;
try {
  await runBackfillEncryptedWebhookSecrets({
    supabase: createBackfillSupabaseMock({
      rows: [],
      selectError: { message: 'alpha-plain-secret should never be exposed' }
    }),
    options: parseBackfillOptions({ args: [], env: {} })
  });
} catch (error) {
  selectFailure = error;
}
assert.ok(selectFailure, 'backfill select failure is reported');
assert.equal(selectFailure.message.includes('alpha-plain-secret'), false, 'backfill select errors are sanitized');

const platformSource = readSource('dashboard/lib/platform.js');
const platformRawStart = platformSource.indexOf('raw: {');
const platformRawEnd = platformSource.indexOf('\n  };\n};', platformRawStart);
assert.notEqual(platformRawStart, -1, 'platform overview raw block should exist');
assert.notEqual(platformRawEnd, -1, 'platform overview raw block should be bounded');
const platformRawBlock = platformSource.slice(platformRawStart, platformRawEnd);
assert.ok(platformSource.includes('pmsConnectionSummaries: scopedPmsConnections'), 'platform overview exposes safe PMS summaries');
assert.equal(platformRawBlock.includes('pmsConnections:'), false, 'platform overview must not return raw.pmsConnections');
assert.equal(/hotel_pms_connections'\)\.select\('\*'\)/.test(platformSource), false, 'platform PMS paths should not select all columns');
assert.ok(platformSource.includes('serializePmsConnectionsSafe'), 'platform uses canonical PMS serializer');

const executiveSource = readSource('dashboard/app/api/executive-dashboard/route.js');
assert.ok(executiveSource.includes('serializePmsConnectionsSafe(rawPmsConnections'), 'executive dashboard serializes PMS rows before output');
assert.equal(/hotel_pms_connections'\)\.select\('\*'\)/.test(executiveSource), false, 'executive dashboard should not select all PMS columns');

const systemHealthSource = readSource('dashboard/lib/system-health.js');
assert.ok(systemHealthSource.includes('serializePmsConnectionsSafe(pmsConnections'), 'system health serializes PMS rows');
assert.equal(/hotel_pms_connections'\)\.select\('\*'\)/.test(systemHealthSource), false, 'system health should not select all PMS columns');

const pmsRouteSource = readSource('dashboard/app/api/pms-connections/route.js');
assert.ok(pmsRouteSource.includes('safePmsConnectionDto'), 'PMS settings API uses safe DTOs');
assert.ok(pmsRouteSource.includes('.select(PMS_CONNECTION_SELECT)'), 'PMS settings GET/DELETE use explicit PMS select');
assert.equal(pmsRouteSource.includes('redactConnection'), false, 'PMS settings API should not import partial redactor');
assert.ok(pmsRouteSource.includes("newValues: safePmsConnectionDto(connection, { surface: 'audit' })"), 'PMS audit newValues are safe');
assert.ok(pmsRouteSource.includes("oldValues: existing ? safePmsConnectionDto(existing, { surface: 'audit' }) : {}"), 'PMS audit oldValues are safe');

const dashboardPmsSource = readSource('dashboard/lib/pms-connections.js');
assert.ok(dashboardPmsSource.includes("PMS_CONNECTION_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings')"), 'PMS Settings uses internal production-safe secret-state select');
assert.equal(dashboardPmsSource.includes('redactConnection'), false, 'dashboard PMS lib should not keep a partial redactor alias');
assert.ok(dashboardPmsSource.includes('record.encrypted_webhook_secret = encryptSecret(webhookSecret)'), 'new dashboard webhook secret writes encrypted field');
assert.equal(/record\.webhook_secret\s*=/.test(dashboardPmsSource), false, 'dashboard writes must not populate plaintext webhook_secret');
assert.ok(dashboardPmsSource.includes('sanitizePmsConnectionMetadata(payload.metadata'), 'dashboard metadata is sanitized before storage');
assert.ok(dashboardPmsSource.includes('return safePmsConnectionDto(data)'), 'dashboard update response returns safe DTO');

const backendPmsSource = readSource('src/services/pms-connections.service.js');
assert.ok(backendPmsSource.includes("PMS_TENANT_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings')"), 'backend PMS service uses internal production-safe secret-state select');
assert.ok(backendPmsSource.includes('encrypted_webhook_secret: encryptSecret(webhookSecret)'), 'backend save writes encrypted webhook secret');
assert.ok(backendPmsSource.includes('updateRecord.encrypted_webhook_secret = encryptSecret(webhookSecret)'), 'backend update writes encrypted webhook secret');
assert.ok(backendPmsSource.includes('Stage A legacy fallback only'), 'legacy fallback is clearly marked');
const updateAllowListStart = backendPmsSource.indexOf("  [\n    'client_id'");
const updateAllowListEnd = backendPmsSource.indexOf('].forEach', updateAllowListStart);
assert.equal(
  backendPmsSource.slice(updateAllowListStart, updateAllowListEnd).includes("'webhook_secret'"),
  false,
  'backend update allowlist must not write plaintext webhook_secret'
);
assert.ok(backendPmsSource.includes('return serializeTenantConnection(data)'), 'backend save/update responses are serialized');

const auditSource = readSource('dashboard/lib/enterprise-audit.js');
assert.ok(auditSource.includes('old_values_summary: summarize(oldValues)'), 'audit summarizes old values');
assert.ok(auditSource.includes('new_values_summary: summarize(newValues)'), 'audit summarizes new values');

const docsSource = readSource('docs/badar-p0-2a-pms-secrets-isolation-stage-a.md');
assert.ok(docsSource.includes('Stage A must be rolled out migration-first'), 'docs explicitly require migration-first');
assert.ok(docsSource.includes('Do not use a code-first rollout for P0-2A'), 'docs prohibit code-first rollout');
assert.ok(
  docsSource.indexOf('Apply `supabase/sql/p0_2a_pms_secrets_isolation_stage_a.sql`')
    < docsSource.indexOf('Deploy application code'),
  'docs order migration before code deployment'
);
assert.ok(docsSource.includes('Do not run the DB rollback first while new code is deployed'), 'docs warn against DB rollback before code rollback');

const migrationSource = readSource('supabase/sql/p0_2a_pms_secrets_isolation_stage_a.sql');
assert.ok(/add column if not exists encrypted_webhook_secret text null/i.test(migrationSource), 'Stage A migration adds nullable encrypted_webhook_secret');
assert.ok(/alter table public\.hotel_pms_connections enable row level security/i.test(migrationSource), 'hotel_pms_connections RLS is enabled');
assert.ok(/alter table public\.pms_webhook_events enable row level security/i.test(migrationSource), 'pms_webhook_events RLS is enabled');
assert.ok(/revoke all privileges on table public\.hotel_pms_connections from public/i.test(migrationSource), 'public grants revoked for PMS connections');
assert.ok(/revoke all privileges on table public\.hotel_pms_connections from anon/i.test(migrationSource), 'anon grants revoked for PMS connections');
assert.ok(/revoke all privileges on table public\.hotel_pms_connections from authenticated/i.test(migrationSource), 'authenticated grants revoked for PMS connections');
assert.ok(/revoke all privileges on table public\.pms_webhook_events from public/i.test(migrationSource), 'public grants revoked for PMS webhook events');
assert.ok(/revoke all privileges on table public\.pms_webhook_events from anon/i.test(migrationSource), 'anon grants revoked for PMS webhook events');
assert.ok(/revoke all privileges on table public\.pms_webhook_events from authenticated/i.test(migrationSource), 'authenticated grants revoked for PMS webhook events');
assert.ok(/grant select, insert, update, delete on table public\.hotel_pms_connections to service_role/i.test(migrationSource), 'service-role path remains expected for PMS connections');
assert.ok(/grant select, insert, update, delete on table public\.pms_webhook_events to service_role/i.test(migrationSource), 'service-role path remains expected for PMS webhook events');
assert.ok(migrationSource.includes('manual review if dangerous browser policies are reported'), 'migration documents policy drift handling');
assert.equal(/create\s+policy/i.test(migrationSource), false, 'Stage A migration must not create browser RLS policies');
assert.equal(/drop\s+policy/i.test(migrationSource), false, 'Stage A migration must not drop unknown production policies');
assert.equal(/alter\s+column\s+hotel_id\s+set\s+not\s+null/i.test(migrationSource), false, 'Stage A must not make PMS webhook event hotel_id NOT NULL');
assert.equal(/drop\s+column\s+(if\s+exists\s+)?webhook_secret/i.test(migrationSource), false, 'Stage A must not drop legacy plaintext webhook_secret');

const preflightSource = readSource('supabase/sql/preflight_p0_2a_pms_secrets_isolation_stage_a.sql');
for (const requiredMetric of [
  'total_connections',
  'null_hotel_id',
  'plaintext_webhook_secret_count',
  'encrypted_client_secret_count',
  'hotel_id_null_count',
  'encrypted_client_secret_non_null_count',
  'webhook_secret_null_count',
  'webhook_secret_non_null_count',
  'encrypted_webhook_secret_column_exists',
  'credentials_encrypted_non_empty_count',
  'metadata_credentials_encrypted_count',
  'payload_presence_count',
  'external_event_id_null_count',
  'total_events',
  'null_connection_id',
  'rls_enabled',
  'dangerous_browser_policy_count',
  'dangerous_browser_grant_count',
  'grant_count_public',
  'grant_count_anon',
  'grant_count_authenticated',
  'grant_count_service_role',
  'ready_for_stage_a',
  'readiness',
  'plaintext_webhook_secret_blocks_stage_a'
]) {
  assert.ok(preflightSource.includes(requiredMetric), `preflight includes ${requiredMetric}`);
}
assert.equal(/select\s+webhook_secret\b/i.test(preflightSource), false, 'preflight must not select webhook secret values');
assert.equal(/select\s+payload\b/i.test(preflightSource), false, 'preflight must not select webhook payload values');
assert.ok(preflightSource.includes('pg_policies'), 'preflight reports policies');
assert.ok(preflightSource.includes('role_table_grants'), 'preflight reports grants');
assert.ok(preflightSource.includes('dangerous browser policies on public.hotel_pms_connections require manual review'), 'preflight blocks dangerous PMS connection browser policies');
assert.ok(preflightSource.includes('dangerous_browser_grants_are_remediated_by_stage_a_migration'), 'preflight documents grant remediation contract');
assert.ok(preflightSource.includes("'plaintext_webhook_secret_blocks_stage_a'"), 'preflight says legacy plaintext does not block Stage A');
assert.equal(/plaintext_webhook_secret_count[\s\S]{0,300}blockers\s*:=/i.test(preflightSource), false, 'plaintext count does not feed readiness blockers');

const rollbackSource = readSource('supabase/sql/rollback_p0_2a_pms_secrets_isolation_stage_a.sql');
assert.ok(rollbackSource.includes('badar.stage_a_code_rollback_confirmed'), 'rollback requires code rollback confirmation');
assert.ok(rollbackSource.includes('Do not run this DB rollback first while Stage A application code is deployed'), 'rollback documents correct order');
assert.equal(/disable\s+row\s+level\s+security/i.test(rollbackSource), false, 'rollback must never disable RLS');
assert.equal(/delete\s+from\s+public\.hotel_pms_connections/i.test(rollbackSource), false, 'rollback must not delete PMS rows');

const backfillSource = readSource('scripts/backfill-encrypted-webhook-secrets.js');
assert.ok(backfillSource.includes('export const main'), 'backfill exports main for CLI execution');
assert.ok(backfillSource.includes('isDirectCliRun'), 'backfill has a direct CLI guard');
assert.ok(backfillSource.includes(".select('id, webhook_secret, encrypted_webhook_secret')"), 'backfill selects only id and webhook secret columns');
assert.ok(backfillSource.includes("BACKFILL_ENCRYPTED_WEBHOOK_SECRETS === 'true'"), 'backfill requires env opt-in for mutation');
assert.ok(backfillSource.includes("args.includes(flag)"), 'backfill parses mutate flag from CLI args');
assert.ok(backfillSource.includes("mode: options.dryRun ? 'dry_run' : 'mutating'"), 'backfill is dry-run by default');
assert.ok(backfillSource.includes('skippedAlreadyEncrypted'), 'backfill reports already encrypted skips');
assert.ok(backfillSource.includes('!row.encrypted_webhook_secret'), 'backfill only candidates missing encrypted value');
assert.ok(backfillSource.includes(".is('encrypted_webhook_secret', null)"), 'backfill avoids overwriting concurrently encrypted rows');
assert.equal(/console\.log\([^)]*row/i.test(backfillSource), false, 'backfill must not log row objects');
assert.equal(/JSON\.stringify\(rows/i.test(backfillSource), false, 'backfill must not print rows');
assert.equal(/JSON\.stringify\(result/i.test(backfillSource), false, 'backfill must not print select results');

const apaleoWebhookSource = readSource('src/integrations/apaleo/apaleo-webhooks.service.js');
assert.ok(apaleoWebhookSource.includes('hotel_id: connection?.hotel_id || null'), 'new webhook events assign hotel_id when connection is resolved');
assert.ok(apaleoWebhookSource.includes('connection_id: connection?.id || null'), 'new webhook events assign connection_id when connection is resolved');
assert.ok(apaleoWebhookSource.includes("PMS_WEBHOOK_CONNECTION_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings')"), 'Apaleo webhook resolver keeps internal secret-state select for provider operations');

const testSource = readSource('scripts/test-pms-secrets-isolation.js');
const forbiddenRuntimeCalls = ['get' + 'Supabase(', 'create' + 'Client(', 'fetch' + '('];
assert.equal(testSource.includes(forbiddenRuntimeCalls[0]), false, 'test must not instantiate Supabase');
assert.equal(testSource.includes(forbiddenRuntimeCalls[1]), false, 'test must not create a Supabase client');
assert.equal(testSource.includes(forbiddenRuntimeCalls[2]), false, 'test must not contact providers or network');

console.log('PMS secrets isolation tests passed');
