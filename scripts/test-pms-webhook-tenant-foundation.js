import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--.*$/gm, ' ');

const normalizeSql = (sql) => stripSqlComments(sql)
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const normalizeRaw = (text) => text
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const migration = source('supabase/sql/p0_2b1_webhook_tenant_foundation.sql');
const migrationSql = normalizeSql(migration);
const preflight = source('supabase/sql/preflight_p0_2b1_webhook_tenant_foundation.sql');
const preflightSql = normalizeSql(preflight);
const rollback = source('supabase/sql/rollback_p0_2b1_webhook_tenant_foundation.sql');
const rollbackSql = normalizeSql(rollback);
const eventSchema = source('supabase/sql/create_pms_webhook_events.sql');
const eventSchemaSql = normalizeSql(eventSchema);
const connectionSchema = source('supabase/sql/create_hotel_pms_connections.sql');
const connectionSchemaSql = normalizeSql(connectionSchema);
const reservationSchema = source('supabase/sql/create_reservations_core.sql');
const reservationSchemaSql = normalizeSql(reservationSchema);
const docs = source('docs/badar-p0-2b1-webhook-tenant-foundation.md');
const docsSql = normalizeRaw(docs);
const packageJson = JSON.parse(source('package.json'));

const OWNERSHIP_MARKER = 'STAYNEX_P0_2B1_OWNED_V1';

const assertIncludes = (text, needle, label) => {
  assert.ok(String(text).toLowerCase().includes(needle.toLowerCase()), label);
};

const assertNotIncludes = (text, needle, label) => {
  assert.equal(String(text).toLowerCase().includes(needle.toLowerCase()), false, label);
};

const assertNoOperationalDml = (sql, table, label) => {
  const tableRef = `public.${table}`;
  assert.doesNotMatch(sql, new RegExp(`\\binsert\\s+into\\s+${tableRef}\\b`, 'i'), `${label} must not insert ${table}`);
  assert.doesNotMatch(sql, new RegExp(`\\bupdate\\s+${tableRef}\\b`, 'i'), `${label} must not update ${table}`);
  assert.doesNotMatch(sql, new RegExp(`\\bdelete\\s+from\\s+${tableRef}\\b`, 'i'), `${label} must not delete ${table}`);
};

const assertReadOnlyPreflight = () => {
  for (const forbidden of [
    /\binsert\s+into\b/i,
    /\bupdate\s+[\w."]+\s+set\b/i,
    /\bdelete\s+from\b/i,
    /\balter\s+(table|publication|index|policy|role|schema|function)\b/i,
    /\bcreate\s+(table|index|unique\s+index|policy|function|schema|role)\b/i,
    /\bdrop\s+(table|index|function|schema|policy)\b/i,
    /\btruncate\s+table\b/i,
    /\bgrant\s+(select|insert|update|delete|all)\b/i,
    /\brevoke\s+(select|insert|update|delete|all)\b/i,
    /\bcomment\s+on\b/i
  ]) {
    assert.doesNotMatch(preflightSql, forbidden, 'preflight SQL must remain non-mutating');
  }

  assertIncludes(preflightSql, 'raise exception', 'preflight has controlled fail-closed exception path');
  assertIncludes(preflightSql, 'missing critical relation', 'preflight reports missing critical source relations');
};

const assertNoNameArrayTextArrayMismatch = (sql, label) => {
  assert.doesNotMatch(
    sql,
    /array\s*\(\s*select\s+att\.attname\b(?!\s*::text)[\s\S]*?\)\s*=\s*array\s*\[[^\]]+\]\s*::\s*text\s*\[\s*\]/i,
    `${label} must not compare name[] from pg_attribute.attname with text[]`
  );
};

const assertAppearsBefore = (text, earlier, later, label) => {
  const earlierIndex = text.indexOf(earlier.toLowerCase());
  const laterIndex = text.indexOf(later.toLowerCase());

  assert.ok(earlierIndex >= 0, `${label} missing earlier fragment: ${earlier}`);
  assert.ok(laterIndex >= 0, `${label} missing later fragment: ${later}`);
  assert.ok(earlierIndex < laterIndex, label);
};

const indexContracts = [
  {
    key: 'connection_composite_index',
    name: 'hotel_pms_connections_id_hotel_id_unique_idx',
    table: 'public.hotel_pms_connections',
    columns: ["'id'", "'hotel_id'"],
    unique: true,
    predicate: "''"
  },
  {
    key: 'event_connection_index',
    name: 'pms_webhook_events_connection_id_idx',
    table: 'public.pms_webhook_events',
    columns: ["'connection_id'"],
    unique: false,
    predicate: "''"
  },
  {
    key: 'event_scoped_unique',
    name: 'pms_webhook_events_provider_connection_event_unique_idx',
    table: 'public.pms_webhook_events',
    columns: ["'provider'", "'connection_id'", "'external_event_id'"],
    unique: true,
    predicate: "'connection_idisnotnullandexternal_event_idisnotnull'"
  },
  {
    key: 'reservation_scoped_unique',
    name: 'reservations_hotel_pms_provider_reservation_id_unique_idx',
    table: 'public.reservations',
    columns: ["'hotel_id'", "'pms_provider'", "'pms_reservation_id'"],
    unique: true,
    predicate: "'hotel_idisnotnullandpms_providerisnotnullandpms_reservation_idisnotnull'"
  }
];

const assertIndexContractEncoded = (sql, contract, label) => {
  assertIncludes(sql, contract.name, `${label} includes ${contract.name}`);
  assertIncludes(sql, contract.table, `${label} includes ${contract.table}`);
  assertIncludes(sql, `array[${contract.columns.join(', ')}]::text[]`, `${label} encodes ordered columns for ${contract.name}`);
  assertIncludes(sql, String(contract.unique), `${label} encodes uniqueness for ${contract.name}`);
  assertIncludes(sql, contract.predicate, `${label} encodes predicate for ${contract.name}`);
};

const decideExistingIndex = ({
  canonicalExists,
  canonicalCompatible,
  equivalentDifferentNameExists,
  b1Owned
}) => {
  if (canonicalExists && !canonicalCompatible) {
    return 'BLOCK_INCOMPATIBLE';
  }

  if (canonicalExists && canonicalCompatible && b1Owned) {
    return 'REUSE_B1_OWNED';
  }

  if (canonicalExists && canonicalCompatible && !b1Owned) {
    return 'REUSE_PREEXISTING_NOT_OWNED';
  }

  if (!canonicalExists && equivalentDifferentNameExists) {
    return 'REUSE_EQUIVALENT_NOT_OWNED';
  }

  return 'CREATE_AND_MARK_OWNED';
};

assert.equal(
  packageJson.scripts['test:pms-webhook-tenant-foundation'],
  'node scripts/test-pms-webhook-tenant-foundation.js',
  'package exposes the P0-2B1 foundation test'
);
assert.ok(
  packageJson.scripts['check:syntax'].includes('node --check scripts/test-pms-webhook-tenant-foundation.js'),
  'syntax check covers the P0-2B1 foundation test'
);

assertIncludes(migrationSql, 'begin', 'migration runs in a transaction');
assertIncludes(migrationSql, 'commit', 'migration commits the transaction');
assertIncludes(migration, OWNERSHIP_MARKER, 'migration defines the B1 ownership marker');
assertIncludes(preflight, OWNERSHIP_MARKER, 'preflight reports B1 ownership marker state');
assertIncludes(rollback, OWNERSHIP_MARKER, 'rollback requires B1 ownership marker');
assertIncludes(docs, OWNERSHIP_MARKER, 'docs document B1 ownership marker');

assertNotIncludes(migrationSql, 'create table if not exists public.pms_webhook_quarantine', 'migration must not blindly trust CREATE TABLE IF NOT EXISTS');
assert.doesNotMatch(migrationSql, /\bcreate\s+(unique\s+)?index\s+if\s+not\s+exists\b/i, 'migration must not blindly trust CREATE INDEX IF NOT EXISTS');
assertIncludes(migrationSql, 'pg_index', 'migration validates indexes through pg_index');
assertIncludes(migrationSql, 'pg_get_expr', 'migration validates partial predicates through pg_get_expr');
assertIncludes(migrationSql, 'pg_get_indexdef', 'migration validates index columns/order through pg_get_indexdef');
assertIncludes(migrationSql, 'obj_description', 'migration reads ownership marker comments');
assertIncludes(migrationSql, 'comment on index', 'migration marks newly-created indexes');
assertIncludes(migrationSql, 'comment on table public.pms_webhook_quarantine', 'migration marks newly-created quarantine table');
assertIncludes(migrationSql, 'same-name index public.% has incompatible table, uniqueness, columns, order, or predicate', 'migration aborts same-name wrong-definition indexes');
assertIncludes(migrationSql, 'reusing compatible preexisting index public.% without claiming ownership', 'migration reuses preexisting compatible canonical indexes without claiming ownership');
assertIncludes(migrationSql, 'reusing equivalent compatible preexisting index public.% for %', 'migration can reuse exactly equivalent different-name indexes without ownership');
assertIncludes(migrationSql, 'created and marked index public.% as b1-owned', 'migration marks B1-created indexes as owned');
assertAppearsBefore(
  migrationSql,
  'event connection/hotel mismatch rows detected',
  'create table public.pms_webhook_quarantine',
  'migration critical guards run before foundation DDL'
);

assertIncludes(migrationSql, 'missing critical source column(s)', 'migration aborts when source columns required by B1 are missing');
for (const sourceColumn of [
  'public.pms_webhook_events.provider',
  'public.pms_webhook_events.connection_id',
  'public.pms_webhook_events.hotel_id',
  'public.pms_webhook_events.external_event_id',
  'public.hotel_pms_connections.id',
  'public.hotel_pms_connections.hotel_id',
  'public.hotel_pms_connections.provider',
  'public.reservations.hotel_id',
  'public.reservations.pms_provider',
  'public.reservations.pms_reservation_id'
]) {
  assertIncludes(migrationSql, sourceColumn, `migration source-column guard covers ${sourceColumn}`);
}

assertIncludes(migrationSql, 'event connection/hotel mismatch rows detected', 'migration guards connection/hotel mismatch');
assertIncludes(migrationSql, 'e.hotel_id <> c.hotel_id', 'migration mismatch guard compares event and connection hotel_id');
assertIncludes(migrationSql, 'orphan event connection_id rows detected', 'migration guards orphan connection_id');
assertIncludes(migrationSql, 'left join public.hotel_pms_connections c on c.id = e.connection_id', 'migration orphan guard uses missing connection lookup');
assertIncludes(migrationSql, 'public.pms_webhook_events rls is not enabled', 'migration guards disabled event RLS');
assertIncludes(migrationSql, 'browser grants exist on public.pms_webhook_events', 'migration guards event browser grants');
assertIncludes(migrationSql, 'browser policies exist on public.pms_webhook_events', 'migration guards event browser policies');
assertIncludes(migrationSql, 'grantee in (\'public\', \'anon\', \'authenticated\')', 'migration grant guard covers browser roles');
assertIncludes(migrationSql, 'policy_role.role_name::text in (\'public\', \'anon\', \'authenticated\')', 'migration policy guard covers browser roles');

assertIncludes(migrationSql, 'legacy event unique index pms_webhook_events_provider_external_event_unique_idx is missing or incompatible', 'migration aborts missing/wrong legacy event unique');
assertIncludes(migrationSql, 'pms_webhook_events_provider_external_event_unique_idx', 'migration checks legacy event unique name');
assertIncludes(migrationSql, "array['provider', 'external_event_id']::text[]", 'migration checks legacy event unique ordered columns');
assertIncludes(migrationSql, 'external_event_idisnotnull', 'migration checks legacy event unique partial predicate');
assertIncludes(migrationSql, 'legacy reservation unique constraint reservations_pms_unique is missing or incompatible', 'migration aborts missing/wrong legacy reservation unique');
assertIncludes(migrationSql, 'select att.attname::text', 'migration casts pg_attribute.attname before text[] comparison');
assertIncludes(migrationSql, "array['pms_provider', 'pms_reservation_id']::text[]", 'migration checks legacy reservation unique ordered columns');
assertIncludes(migrationSql, 'legacy hotel/provider unique index hotel_pms_connections_hotel_provider_idx is missing or incompatible', 'migration aborts missing/wrong hotel/provider unique');
assertIncludes(migrationSql, 'hotel_pms_connections_hotel_provider_idx', 'migration checks legacy hotel/provider unique name');
assertIncludes(migrationSql, "array['hotel_id', 'provider']::text[]", 'migration checks legacy hotel/provider ordered columns');
assertIncludes(migrationSql, "coalesce(regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g'), '') = ''", 'migration checks hotel/provider unique is non-partial');
assert.doesNotMatch(
  migrationSql,
  /raise exception[^;]*(event hotel_id null|event connection_id null|null external_event_id|reservation.*hotel_id null|pms row.*hotel_id null)/i,
  'migration must not promote nullable legacy rows to hard B1 blockers'
);

for (const contract of indexContracts) {
  assertIndexContractEncoded(migrationSql, contract, 'migration');
  assertIndexContractEncoded(preflightSql, contract, 'preflight');
  assertIndexContractEncoded(rollbackSql, contract, 'rollback');
}

assert.equal(
  decideExistingIndex({ canonicalExists: true, canonicalCompatible: true, equivalentDifferentNameExists: false, b1Owned: false }),
  'REUSE_PREEXISTING_NOT_OWNED',
  'same-name correct definition is accepted but not claimed'
);
assert.equal(
  decideExistingIndex({ canonicalExists: true, canonicalCompatible: false, equivalentDifferentNameExists: false, b1Owned: false }),
  'BLOCK_INCOMPATIBLE',
  'same-name incorrect index columns are blocked'
);
assert.equal(
  decideExistingIndex({ canonicalExists: true, canonicalCompatible: false, equivalentDifferentNameExists: false, b1Owned: true }),
  'BLOCK_INCOMPATIBLE',
  'same-name wrong uniqueness is blocked'
);
assert.equal(
  decideExistingIndex({ canonicalExists: true, canonicalCompatible: false, equivalentDifferentNameExists: true, b1Owned: false }),
  'BLOCK_INCOMPATIBLE',
  'same-name wrong partial predicate is blocked even if another equivalent index exists'
);
assert.equal(
  decideExistingIndex({ canonicalExists: false, canonicalCompatible: false, equivalentDifferentNameExists: true, b1Owned: false }),
  'REUSE_EQUIVALENT_NOT_OWNED',
  'different-name equivalent object is reused as preexisting and not owned'
);
assert.equal(
  decideExistingIndex({ canonicalExists: false, canonicalCompatible: false, equivalentDifferentNameExists: false, b1Owned: false }),
  'CREATE_AND_MARK_OWNED',
  'absent object is created and marked owned'
);

assertIncludes(migrationSql, 'create table public.pms_webhook_quarantine', 'migration creates quarantine table only when absent');
for (const column of [
  'id uuid primary key default gen_random_uuid()',
  'provider text not null',
  'reason_code text not null',
  "status text not null default 'pending'",
  'request_hash text null',
  'event_hash text null',
  'candidate_connection_id uuid null',
  "safe_flags jsonb not null default '{}'::jsonb",
  'created_at timestamptz not null default now()',
  'reviewed_at timestamptz null',
  'expires_at timestamptz null'
]) {
  assertIncludes(migrationSql, column, `quarantine table includes ${column}`);
}

for (const forbiddenColumn of [
  'raw_payload',
  'request_body',
  'guest_name',
  'guest_email',
  'guest_phone',
  'email text',
  'phone text',
  'credentials',
  'token',
  'raw_provider_error',
  'provider_error text',
  'error text'
]) {
  assertNotIncludes(normalizeRaw(migration.match(/create table public\.pms_webhook_quarantine[\s\S]*?\);/i)?.[0] || ''), forbiddenColumn, `quarantine schema must not include ${forbiddenColumn}`);
}

for (const reasonCode of [
  'INVALID_SIGNATURE',
  'MISSING_SIGNATURE',
  'UNKNOWN_CONNECTION',
  'AMBIGUOUS_CONNECTION',
  'CONNECTION_DISABLED',
  'TENANT_MISMATCH',
  'MISSING_EVENT_ID',
  'MALFORMED_EVENT',
  'UNSUPPORTED_PROVIDER',
  'VALIDATION_NOT_CONFIGURED',
  'LEGACY_GLOBAL_EVENT_COLLISION',
  'LEGACY_GLOBAL_RESERVATION_COLLISION'
]) {
  assert.ok(migration.includes(`'${reasonCode}'`), `quarantine reason contract includes ${reasonCode}`);
}

assertIncludes(migrationSql, 'unsafe raw-data or secret-like columns', 'migration blocks unsafe quarantine columns');
assertIncludes(preflightSql, 'quarantine_unsafe_column_count', 'preflight reports unsafe quarantine columns');
assertIncludes(migrationSql, 'candidate_connection_id is', 'migration documents candidate_connection_id');
assertIncludes(migrationSql, 'deliberately no fk', 'migration comments candidate_connection_id no-FK decision');
assertIncludes(docsSql, 'candidate_connection_id', 'docs mention candidate_connection_id');
assertIncludes(docsSql, 'deliberately no fk', 'docs document candidate_connection_id no-FK decision');
assertIncludes(docsSql, 'evidence/reference only', 'docs forbid candidate_connection_id as tenant authority');

assertIncludes(migrationSql, 'alter table public.pms_webhook_quarantine enable row level security', 'new quarantine table gets RLS');
assertIncludes(migrationSql, 'revoke all privileges on table public.pms_webhook_quarantine from public', 'new quarantine table revokes PUBLIC');
assertIncludes(migrationSql, 'revoke all privileges on table public.pms_webhook_quarantine from anon', 'new quarantine table revokes anon');
assertIncludes(migrationSql, 'revoke all privileges on table public.pms_webhook_quarantine from authenticated', 'new quarantine table revokes authenticated');
assertIncludes(migrationSql, 'grant select, insert, update, delete on table public.pms_webhook_quarantine to service_role', 'new quarantine table grants service_role CRUD');
assert.equal(/create\s+policy/i.test(migrationSql), false, 'foundation migration must not create browser policies');
assertIncludes(migrationSql, 'preexisting public.pms_webhook_quarantine is in supabase_realtime', 'preexisting quarantine Realtime membership blocks migration');

assertIncludes(eventSchemaSql, 'pms_webhook_events_provider_external_event_unique_idx on pms_webhook_events(provider, external_event_id)', 'legacy global event unique remains in base schema');
assertIncludes(connectionSchemaSql, 'hotel_pms_connections_hotel_provider_idx', 'legacy hotel/provider unique remains in base schema');
assertIncludes(reservationSchemaSql, 'constraint reservations_pms_unique unique (pms_provider, pms_reservation_id)', 'legacy reservation unique remains in base schema');
assertNotIncludes(migrationSql, 'drop index', 'migration must not drop indexes');
assertNotIncludes(migrationSql, 'drop constraint', 'migration must not drop constraints');
assertNotIncludes(rollbackSql, 'pms_webhook_events_provider_external_event_unique_idx', 'rollback must not drop legacy event unique');
assertNotIncludes(rollbackSql, 'reservations_pms_unique', 'rollback must not drop legacy reservation unique');

assertIncludes(eventSchemaSql, 'hotel_id uuid null', 'event hotel_id is still nullable in base schema');
assertIncludes(eventSchemaSql, 'connection_id uuid null', 'event connection_id is still nullable in base schema');
assertIncludes(eventSchemaSql, 'external_event_id text null', 'event provider id is still nullable in base schema');
assert.equal(/alter\s+table\s+public\.pms_webhook_events[\s\S]{0,240}set\s+not\s+null/i.test(migrationSql), false, 'migration must not enforce event NOT NULL');
assert.equal(/alter\s+table\s+public\.reservations[\s\S]{0,240}set\s+not\s+null/i.test(migrationSql), false, 'migration must not enforce reservation NOT NULL');

assertNoOperationalDml(migration, 'pms_webhook_events', 'migration');
assertNoOperationalDml(migration, 'reservations', 'migration');
assertNoOperationalDml(migration, 'hotel_pms_connections', 'migration');
assert.equal(/backfill/i.test(migrationSql), false, 'migration must not contain backfill operations');

assert.equal(/\bforeign\s+key\s*\(\s*connection_id\s*,\s*hotel_id\s*\)/i.test(migrationSql), false, 'foundation migration must not add final event composite FK');
assert.equal(/\bon\s+delete\s+(restrict|no\s+action)\b/i.test(migrationSql), false, 'foundation migration must not introduce restrictive delete semantics');
assert.equal(/\bconstraint\b[\s\S]{0,200}\bconnection_id\b[\s\S]{0,80}\bhotel_id\b[\s\S]{0,200}\breferences\s+public\.hotel_pms_connections/i.test(migrationSql), false, 'foundation migration must not create event connection/hotel FK');

assertReadOnlyPreflight();
for (const [sql, label] of [
  [preflight, 'preflight'],
  [migration, 'migration'],
  [rollback, 'rollback']
]) {
  assertNoNameArrayTextArrayMismatch(sql, label);
}
assertIncludes(preflightSql, 'select att.attname::text', 'preflight casts pg_attribute.attname before text[] comparison');

for (const metric of [
  'total_events',
  'null_hotel_id',
  'null_connection_id',
  'both_null',
  'hotel_present_connection_null',
  'connection_present_hotel_null',
  'connection_hotel_mismatch',
  'orphan_connection_id',
  'resolvable_by_connection',
  'unresolved_after_connection_mapping',
  'null_external_event_id',
  'duplicate_current_event_identity',
  'duplicate_proposed_event_identity',
  'oldest_created_at',
  'newest_created_at',
  'total_pms_identified_reservations',
  'hotel_id_null_among_pms_rows',
  'pms_provider_null',
  'pms_reservation_id_null',
  'duplicate_current_reservation_identity',
  'duplicate_proposed_reservation_identity',
  'cross_hotel_reservation_identity_reuse',
  'total_hotel_pms_connections',
  'id_null_impossible_sanity',
  'duplicate_id_hotel_id',
  'ready_for_p0_2b1_stage_a',
  'readiness',
  'quarantine_schema_compatible',
  'connection_composite_index_compatible',
  'event_connection_index_compatible',
  'event_scoped_unique_compatible',
  'reservation_scoped_unique_compatible',
  'critical_schema_compatible'
]) {
  assertIncludes(preflightSql, metric, `preflight includes ${metric}`);
}

assertIncludes(preflightSql, 'ready_for_stage_a', 'preflight readiness includes READY_FOR_STAGE_A');
assertIncludes(preflightSql, 'needs_manual_review', 'preflight readiness includes NEEDS_MANUAL_REVIEW');
assertIncludes(preflightSql, 'blocked', 'preflight readiness includes BLOCKED');
assertIncludes(preflightSql, 'browser_event_access_regression', 'preflight blocks browser event access regression');
assertIncludes(preflightSql, 'connection_hotel_mismatch > 0', 'preflight blocks event tenant mismatches');
assertIncludes(preflightSql, 'orphan_connection_id > 0', 'preflight blocks orphan event connections');
assertIncludes(preflightSql, 'duplicate_proposed_event_identity > 0', 'preflight blocks proposed event duplicates');
assertIncludes(preflightSql, 'duplicate_proposed_reservation_identity > 0', 'preflight blocks proposed reservation duplicates');
assertIncludes(preflightSql, 'index_compatibility_summary.b1_indexes_compatible_or_absent', 'preflight readiness includes B1 index compatibility');
assertIncludes(preflightSql, 'quarantine_compatibility.quarantine_schema_compatible', 'preflight readiness includes quarantine compatibility');
assertIncludes(preflightSql, 'pg_indexes', 'preflight reports indexes');
assertIncludes(preflightSql, 'pg_constraint', 'preflight reports constraints');
assertIncludes(preflightSql, 'role_table_grants', 'preflight reports grants');
assertIncludes(preflightSql, 'pg_policies', 'preflight reports policies');
assertIncludes(preflightSql, 'pg_publication_tables', 'preflight reports realtime publication membership');

assert.equal(/\bselect\s+(?:[^;]*\.)?payload\b/i.test(preflightSql), false, 'preflight must not select event body values');
assert.equal(/\bselect\s+(?:[^;]*\.)?error\b/i.test(preflightSql), false, 'preflight must not select provider error values');
assert.doesNotMatch(
  preflightSql,
  /\bfrom\s+public\.(reservations|pms_webhook_events|hotel_pms_connections|pms_webhook_quarantine)\b[^;]*(guest_name|guest_email|guest_phone|request_body|raw_payload|credentials|token)/i,
  'preflight must not select sensitive operational values'
);

assertIncludes(rollbackSql, 'obj_description', 'rollback checks ownership comments');
assertIncludes(rollbackSql, 'preserving unowned preexisting index public.%', 'rollback preserves unowned preexisting indexes');
assertIncludes(rollbackSql, 'drop index public.%i', 'rollback can remove B1-owned indexes after validation');
assertIncludes(rollbackSql, 'select count(*) from public.pms_webhook_quarantine', 'rollback counts quarantine rows before table drop');
assertIncludes(rollbackSql, 'contains % row(s)', 'rollback blocks non-empty quarantine table');
assertIncludes(rollbackSql, 'preserving unowned preexisting public.pms_webhook_quarantine', 'rollback preserves unowned preexisting quarantine table');
assertIncludes(rollbackSql, 'drop table public.pms_webhook_quarantine', 'rollback can remove empty B1-owned quarantine table');
assertIncludes(rollbackSql, 'has drifted from the expected b1 definition', 'rollback aborts if owned index definition drifted');
assertIncludes(rollbackSql, 'has drifted from the expected b1 schema', 'rollback aborts if owned quarantine table drifted');

assert.equal(
  decideExistingIndex({ canonicalExists: true, canonicalCompatible: true, equivalentDifferentNameExists: false, b1Owned: false }) === 'REUSE_PREEXISTING_NOT_OWNED',
  true,
  'rollback preexisting object is preserved because it lacks marker'
);
assert.equal(
  decideExistingIndex({ canonicalExists: true, canonicalCompatible: true, equivalentDifferentNameExists: false, b1Owned: true }) === 'REUSE_B1_OWNED',
  true,
  'rollback B1-owned object is eligible after exact compatibility validation'
);
assertIncludes(rollbackSql, 'quarantine_row_count > 0', 'quarantine non-empty case blocks table DROP');

assertNoOperationalDml(rollback, 'pms_webhook_events', 'rollback');
assertNoOperationalDml(rollback, 'reservations', 'rollback');
assertNoOperationalDml(rollback, 'hotel_pms_connections', 'rollback');
assert.equal(/disable\s+row\s+level\s+security/i.test(rollbackSql), false, 'rollback must not disable RLS');
assert.equal(/\bgrant\b/i.test(rollbackSql), false, 'rollback must not restore browser grants');
assert.equal(/webhook_secret|encrypted_webhook_secret/i.test(rollbackSql), false, 'rollback must not touch P0-2A secrets');

for (const docsNeedle of [
  'production drift',
  'exact object compatibility',
  'ownership marker',
  'preexisting compatible objects',
  'rollback ownership',
  'quarantine row guard',
  'pre-b2 rollback',
  'post-b2 rollback',
  'candidate_connection_id',
  'needs operational caution',
  'p0-2b2',
  'p0-2b3',
  'deferred'
]) {
  assertIncludes(docsSql, docsNeedle, `docs include ${docsNeedle}`);
}

const apaleoWebhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
assert.ok(apaleoWebhookSource.includes('processApaleoWebhookEvent'), 'runtime webhook processing file remains present');
assert.ok(apaleoWebhookSource.includes('hotel_id: connection?.hotel_id || null'), 'P0-2B1 does not remove current webhook fallback yet');
assert.ok(apaleoWebhookSource.includes('connection_id: connection?.id || null'), 'P0-2B1 does not remove current event connection fallback yet');

console.log(JSON.stringify({
  ok: true,
  ownershipMarker: OWNERSHIP_MARKER,
  migration: 'supabase/sql/p0_2b1_webhook_tenant_foundation.sql',
  preflight: 'supabase/sql/preflight_p0_2b1_webhook_tenant_foundation.sql',
  rollback: 'supabase/sql/rollback_p0_2b1_webhook_tenant_foundation.sql',
  docs: 'docs/badar-p0-2b1-webhook-tenant-foundation.md'
}, null, 2));
