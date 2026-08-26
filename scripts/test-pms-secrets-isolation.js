import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

assert.deepEqual(PMS_CONNECTION_PRODUCTION_COLUMNS, productionSchemaColumns, 'canonical PMS Stage B selectable column list excludes legacy webhook_secret');
for (const surface of safePmsSurfaces) {
  assertSafePmsSelect(pmsConnectionSelectForSurface(surface), `${surface} safe PMS selector`);
}
assertSafePmsSelect(pmsConnectionSelectForSurface('unknown_surface'), 'unknown surface safe PMS selector');
assertInternalPmsSelect(pmsConnectionInternalSelectForSurface('tenant_settings'), 'tenant settings internal PMS selector');
assertInternalPmsSelect(pmsConnectionInternalSelectForSurface('unknown_surface'), 'unknown surface internal PMS selector');
for (const select of [
  ...safePmsSurfaces.map((surface) => pmsConnectionSelectForSurface(surface)),
  pmsConnectionInternalSelectForSurface('tenant_settings'),
  pmsConnectionInternalSelectForSurface('health')
]) {
  assert.equal(parsePmsSelectColumns(select).includes('webhook_secret'), false, 'Stage B production selectors never request webhook_secret');
}

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

const plaintextOnlyDto = serializePmsConnectionSafe({
  id: 'legacy-plaintext-only',
  hotel_id: 'hotel-1',
  provider: 'apaleo',
  enabled: true,
  webhook_secret: 'legacy-webhook-secret'
}, { surface: 'tenant_settings' });
assert.equal(plaintextOnlyDto.webhook_secret_configured, false, 'Stage B serializer does not treat plaintext-only webhook_secret as configured');
assert.equal(Object.prototype.hasOwnProperty.call(plaintextOnlyDto, 'webhook_secret'), false, 'Stage B serializer still strips defensive webhook_secret field');
assertNoSerializedLeak(plaintextOnlyDto, ['legacy-webhook-secret'], 'plaintext-only PMS DTO');

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
  null,
  'Stage B does not consume plaintext-only legacy webhook_secret'
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
const saveCall = saveSupabase.calls.find((call) => call.action === 'upsert');
const saveRecord = saveCall.record;
assert.match(saveRecord.encrypted_webhook_secret, /^v1:/, 'save path persists encrypted webhook secret');
assert.equal(Object.prototype.hasOwnProperty.call(saveRecord, 'webhook_secret'), false, 'save path never writes plaintext webhook_secret');
assert.equal(parsePmsSelectColumns(saveCall.select).includes('webhook_secret'), false, 'save path select does not request legacy webhook_secret');
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
const updateCall = updateSupabase.calls.find((call) => call.action === 'update');
const updateRecord = updateCall.record;
assert.match(updateRecord.encrypted_webhook_secret, /^v1:/, 'update path persists encrypted webhook secret');
assert.equal(Object.prototype.hasOwnProperty.call(updateRecord, 'webhook_secret'), false, 'update path never writes plaintext webhook_secret');
assert.equal(parsePmsSelectColumns(updateCall.select).includes('webhook_secret'), false, 'update path select does not request legacy webhook_secret');
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
assert.equal(backendPmsSource.includes('Stage A legacy fallback only'), false, 'Stage B removes legacy fallback comment');
assert.equal(/return\s+connection\.webhook_secret/.test(backendPmsSource), false, 'Stage B removes plaintext webhook_secret fallback');
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

const stageBDocsSource = readSource('docs/badar-p0-2a-pms-secrets-stage-b.md');
assert.ok(stageBDocsSource.includes('Stage B is CODE FIRST'), 'Stage B docs explicitly require code-first rollout');
assert.ok(
  stageBDocsSource.indexOf('Deploy Stage B application code')
    < stageBDocsSource.indexOf('Run `supabase/sql/preflight_p0_2a_pms_secrets_stage_b.sql`'),
  'Stage B docs order code deploy before DB preflight'
);
assert.ok(stageBDocsSource.includes('Do not use a migration-first rollout for Stage B'), 'Stage B docs prohibit migration-first rollout');
assert.ok(stageBDocsSource.includes('Rollback re-adds `webhook_secret text null` only'), 'Stage B docs document rollback data limits');
assert.ok(stageBDocsSource.includes('PMS webhook event tenant hardening is not part of Stage B'), 'Stage B docs keep event hardening out of scope');
assert.ok(stageBDocsSource.includes('Backfill dry-run inspected 4 rows'), 'Stage B docs keep production dry-run inspected count');
assert.ok(stageBDocsSource.includes('plaintext-only candidates = 0'), 'Stage B docs keep production zero-candidate basis');
assert.ok(stageBDocsSource.includes('mutations = 0'), 'Stage B docs keep production zero-mutation basis');
assert.ok(stageBDocsSource.includes('RETIRED AFTER CLEAN PRODUCTION DRY-RUN'), 'Stage B docs mark Stage A backfill utility retired');

const stageBPreflightSource = readSource('supabase/sql/preflight_p0_2a_pms_secrets_stage_b.sql');
for (const requiredMetric of [
  'table_exists',
  'encrypted_webhook_secret_column_exists',
  'encrypted_webhook_secret_column_type',
  'webhook_secret_column_exists',
  'total_connections',
  'webhook_secret_non_null_count',
  'plaintext_webhook_secret_count',
  'encrypted_webhook_secret_non_null_count',
  'rls_enabled',
  'browser_grant_count',
  'dangerous_browser_policy_count',
  'service_role_expected_privilege_count',
  'schema_compatible',
  'ready_for_stage_b',
  'readiness',
  'blockers'
]) {
  assert.ok(stageBPreflightSource.includes(requiredMetric), `Stage B preflight includes ${requiredMetric}`);
}
assert.equal(/select\s+webhook_secret\b/i.test(stageBPreflightSource), false, 'Stage B preflight must not select webhook_secret values');
assert.equal(/select\s+encrypted_webhook_secret\b/i.test(stageBPreflightSource), false, 'Stage B preflight must not select encrypted_webhook_secret values');
assert.equal(/insert\s+into\s+public\./i.test(stageBPreflightSource), false, 'Stage B preflight must not insert production rows');
assert.equal(/update\s+public\./i.test(stageBPreflightSource), false, 'Stage B preflight must not update production rows');
assert.equal(/delete\s+from\s+public\./i.test(stageBPreflightSource), false, 'Stage B preflight must not delete production rows');
assert.equal(/alter\s+table\s+public\./i.test(stageBPreflightSource), false, 'Stage B preflight must not alter production tables');
assert.equal(/drop\s+column/i.test(stageBPreflightSource), false, 'Stage B preflight must not drop columns');

const stageBMigrationSource = readSource('supabase/sql/p0_2a_pms_secrets_stage_b.sql');
const stageBDropColumns = [...stageBMigrationSource.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([a-z_]+)/gi)].map((match) => match[1]);
assert.deepEqual(stageBDropColumns, ['webhook_secret'], 'Stage B migration drops only webhook_secret');
assert.ok(/where\s+webhook_secret\s+is\s+not\s+null/i.test(stageBMigrationSource), 'Stage B migration guards legacy plaintext count before drop');
assert.ok(/raise\s+exception[\s\S]*legacy plaintext webhook_secret values remain/i.test(stageBMigrationSource), 'Stage B migration aborts if legacy plaintext remains');
assert.ok(stageBMigrationSource.includes('encrypted_webhook_secret'), 'Stage B migration verifies encrypted_webhook_secret before dropping legacy column');
assert.equal(/update\s+public\./i.test(stageBMigrationSource), false, 'Stage B migration must not update PMS rows');
assert.equal(/insert\s+into\s+public\./i.test(stageBMigrationSource), false, 'Stage B migration must not insert PMS rows');
assert.equal(/delete\s+from\s+public\./i.test(stageBMigrationSource), false, 'Stage B migration must not delete PMS rows');
assert.equal(/disable\s+row\s+level\s+security/i.test(stageBMigrationSource), false, 'Stage B migration must never disable RLS');
assert.equal(/pms_webhook_events/i.test(stageBMigrationSource), false, 'Stage B migration must not touch PMS webhook events');
assert.equal(/alter\s+column\s+hotel_id\s+set\s+not\s+null/i.test(stageBMigrationSource), false, 'Stage B migration must not harden event hotel_id');
assert.equal(/drop\s+column\s+(?:if\s+exists\s+)?encrypted_webhook_secret/i.test(stageBMigrationSource), false, 'Stage B migration must not drop encrypted_webhook_secret');

const stageBRollbackSource = readSource('supabase/sql/rollback_p0_2a_pms_secrets_stage_b.sql');
assert.ok(/add\s+column\s+if\s+not\s+exists\s+webhook_secret\s+text\s+null/i.test(stageBRollbackSource), 'Stage B rollback re-adds nullable webhook_secret');
assert.ok(stageBRollbackSource.includes('badar.stage_b_db_rollback_confirmed'), 'Stage B rollback requires explicit DB rollback confirmation');
assert.ok(stageBRollbackSource.includes('cannot reconstruct historical plaintext values'), 'Stage B rollback documents unrecoverable plaintext values');
assert.equal(/pms_webhook_events/i.test(stageBRollbackSource), false, 'Stage B rollback must not touch PMS webhook events');
assert.equal(/disable\s+row\s+level\s+security/i.test(stageBRollbackSource), false, 'Stage B rollback must never disable RLS');
assert.equal(/update\s+public\./i.test(stageBRollbackSource), false, 'Stage B rollback must not update PMS rows');
assert.equal(/delete\s+from\s+public\./i.test(stageBRollbackSource), false, 'Stage B rollback must not delete PMS rows');
assert.equal(/drop\s+column/i.test(stageBRollbackSource), false, 'Stage B rollback must not drop columns');

const backfillPath = join(root, 'scripts/backfill-encrypted-webhook-secrets.js');
assert.equal(existsSync(backfillPath), false, 'Stage A backfill executable is retired before Stage B cutover');

const packageJsonSource = readSource('package.json');
assert.equal(packageJsonSource.includes('scripts/backfill-encrypted-webhook-secrets.js'), false, 'package commands must not invoke retired backfill executable');
assert.equal(packageJsonSource.includes('backfill-encrypted-webhook-secrets'), false, 'package commands must not reference retired backfill utility');
assert.equal(packageJsonSource.includes('BACKFILL_ENCRYPTED_WEBHOOK_SECRETS'), false, 'package commands must not expose retired backfill mutation opt-in');

const stageADocsSource = readSource('docs/badar-p0-2a-pms-secrets-isolation-stage-a.md');
assert.ok(stageADocsSource.includes('RETIRED AFTER CLEAN PRODUCTION DRY-RUN'), 'Stage A docs mark backfill tool retired after clean production dry-run');
assert.ok(stageADocsSource.includes('candidates = 0'), 'Stage A docs keep historical backfill candidate count');
assert.ok(stageADocsSource.includes('mutations = 0'), 'Stage A docs keep historical zero-mutation result');
assert.equal(/Run controlled mutating backfill/i.test(stageADocsSource), false, 'Stage A docs no longer instruct running mutating backfill');

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
