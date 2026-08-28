import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiLog } from '../src/services/ai-log.service.js';
import { upsertConversationAiState } from '../src/services/conversation-context.service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const readSource = (path) => readFileSync(join(root, path), 'utf8');

const scopedTables = [
  'guests',
  'guest_ai_profiles',
  'guest_ai_tags',
  'guest_ai_insights',
  'guest_ai_actions',
  'ai_logs',
  'conversation_ai_state',
  'scheduled_messages'
];

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripSqlCommentsAndStrings = (sql) => sql
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'([^']|'')*'/g, "''");

const listCodeFiles = (directory) => {
  const files = [];

  for (const item of readdirSync(directory)) {
    if (item.startsWith('.') || item === 'node_modules') {
      continue;
    }

    const fullPath = join(directory, item);
    const stats = lstatSync(fullPath);

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCodeFiles(fullPath));
      continue;
    }

    if (/\.(js|jsx|ts|tsx)$/.test(item)) {
      files.push(fullPath);
    }
  }

  return files;
};

const assertContains = (source, token, message) => {
  assert.ok(source.includes(token), message);
};

const assertRegex = (source, regex, message) => {
  assert.match(source, regex, message);
};

const assertNoBrowserGrant = (source, label) => {
  assert.doesNotMatch(
    source,
    /\bgrant\s+(select|insert|update|delete|all\s+privileges)[\s\S]{0,180}\bto\s+(public|anon|authenticated)\b/i,
    `${label} must not grant browser roles`
  );
};

class FakeQuery {
  constructor(db, operations, table) {
    this.db = db;
    this.operations = operations;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.insertRows = [];
    this.upsertRows = [];
    this.upsertOptions = {};
    this.limitCount = null;
  }

  select() {
    return this;
  }

  insert(rows) {
    this.operation = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows, options = {}) {
    this.operation = 'upsert';
    this.upsertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertOptions = options;
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    const { data, error } = this.execute();
    return Promise.resolve({ data: data?.[0] || null, error });
  }

  single() {
    const { data, error } = this.execute();
    return Promise.resolve({ data: data?.[0] || null, error });
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  execute() {
    this.db[this.table] ||= [];

    if (this.operation === 'insert') {
      const inserted = this.insertRows.map((row) => ({
        id: row.id || `${this.table}-${this.db[this.table].length + 1}`,
        ...row
      }));

      this.db[this.table].push(...inserted);
      this.operations.push({ table: this.table, operation: 'insert', rows: inserted });
      return { data: inserted, error: null };
    }

    if (this.operation === 'upsert') {
      const conflictColumns = String(this.upsertOptions.onConflict || 'id')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean);
      const upserted = this.upsertRows.map((row) => {
        const existing = this.db[this.table].find((current) => (
          conflictColumns.every((column) => current[column] === row[column])
        ));

        if (existing) {
          Object.assign(existing, row);
          return existing;
        }

        const next = {
          id: row.id || `${this.table}-${this.db[this.table].length + 1}`,
          ...row
        };
        this.db[this.table].push(next);
        return next;
      });

      this.operations.push({ table: this.table, operation: 'upsert', rows: upserted });
      return { data: upserted, error: null };
    }

    let rows = this.db[this.table].filter((row) => this.filters.every((filter) => filter(row)));

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    this.operations.push({ table: this.table, operation: 'select', rows });
    return { data: rows, error: null };
  }
}

const createFakeSupabase = (initialData = {}) => {
  const db = Object.entries(initialData).reduce((acc, [table, rows]) => ({
    ...acc,
    [table]: rows.map((row) => ({ ...row }))
  }), {
    messages: [],
    guests: [],
    conversations: [],
    tickets: [],
    ai_logs: [],
    conversation_ai_state: []
  });
  const operations = [];

  return {
    db,
    operations,
    from(table) {
      return new FakeQuery(db, operations, table);
    }
  };
};

const wasInsertedInto = (supabase, table) => (
  supabase.operations.some((operation) => operation.table === table && operation.operation === 'insert')
);

const compositeFkAllows = ({ parentRows, childRow, childColumns, parentColumns }) => (
  childColumns.some((childColumn) => (
    childRow[childColumn] === null || childRow[childColumn] === undefined
  ))
    || parentRows.some((parentRow) => childColumns.every((childColumn, index) => (
      childRow[childColumn] === parentRow[parentColumns[index]]
    )))
);

const assertOptionalRelationshipTenantGuard = ({ table, childColumn, parentTable, parentAlias }) => {
  assertRegex(
    migration,
    new RegExp(
      `from public\\.${escapeRegExp(table)} t\\s+left join public\\.${escapeRegExp(parentTable)} ${parentAlias} on ${parentAlias}\\.id = t\\.${escapeRegExp(childColumn)}\\s+where t\\.${escapeRegExp(childColumn)} is not null\\s+and \\(\\s*${parentAlias}\\.id is null\\s+or ${parentAlias}\\.hotel_id is distinct from t\\.hotel_id\\s*\\)`,
      'i'
    ),
    `${table}.${childColumn} migration guard should ignore null optional relationship ids`
  );
};

const assertOptionalAiLogGuard = ({ childColumn, parentTable, parentAlias }) => {
  assertRegex(
    migration,
    new RegExp(
      `from public\\.ai_logs t\\s+left join public\\.${escapeRegExp(parentTable)} ${parentAlias} on ${parentAlias}\\.id = t\\.${escapeRegExp(childColumn)}\\s+where t\\.${escapeRegExp(childColumn)} is not null\\s+and ${parentAlias}\\.id is null`,
      'i'
    ),
    `ai_logs.${childColumn} missing-reference guard should ignore null optional relationship ids`
  );
  assertRegex(
    migration,
    new RegExp(
      `from public\\.ai_logs t\\s+join public\\.${escapeRegExp(parentTable)} ${parentAlias} on ${parentAlias}\\.id = t\\.${escapeRegExp(childColumn)}\\s+where t\\.${escapeRegExp(childColumn)} is not null\\s+and t\\.hotel_id is not null\\s+and ${parentAlias}\\.hotel_id is distinct from t\\.hotel_id`,
      'i'
    ),
    `ai_logs.${childColumn} tenant mismatch guard should ignore null optional relationship ids`
  );
};

const preflight = readSource('supabase/sql/preflight_p0_3_guest_ai_tenant_isolation.sql');
const migration = readSource('supabase/sql/p0_3_guest_ai_tenant_isolation.sql');
const rollback = readSource('supabase/sql/rollback_p0_3_guest_ai_tenant_isolation.sql');
const packageJson = JSON.parse(readSource('package.json'));

assert.equal(
  packageJson.scripts['test:guest-ai-tenant-isolation'],
  'node scripts/test-guest-ai-tenant-isolation.js',
  'Permanent npm script should exist'
);

const hotelA = 'hotel-synthetic-a';
const hotelB = 'hotel-synthetic-b';

const validSupabase = createFakeSupabase({
  messages: [{ id: 'message-a', hotel_id: hotelA }],
  guests: [{ id: 'guest-a', hotel_id: hotelA }],
  conversations: [{ id: 'conversation-a', hotel_id: hotelA }],
  tickets: [{ id: 'ticket-a', hotel_id: hotelA }]
});
const validAiLog = await createAiLog({
  supabase: validSupabase,
  hotelId: hotelA,
  messageId: 'message-a',
  guestId: 'guest-a',
  conversationId: 'conversation-a',
  ticketId: 'ticket-a',
  detectedIntent: 'synthetic_valid_ai_log',
  rawGuestMessage: 'synthetic guest text',
  generatedResponse: 'synthetic ai response'
});
assert.ok(validAiLog, 'Valid same-hotel AI log should be inserted');
assert.equal(validSupabase.db.ai_logs.length, 1, 'Valid same-hotel AI log should write exactly one row');
assert.equal(validSupabase.db.ai_logs[0].hotel_id, hotelA, 'Valid AI log should retain explicit hotel_id');

const crossTenantSupabase = createFakeSupabase({
  messages: [{ id: 'message-b', hotel_id: hotelB }],
  guests: [{ id: 'guest-b', hotel_id: hotelB }],
  conversations: [{ id: 'conversation-b', hotel_id: hotelB }],
  tickets: [{ id: 'ticket-b', hotel_id: hotelB }]
});
const blockedAiLog = await createAiLog({
  supabase: crossTenantSupabase,
  hotelId: hotelA,
  messageId: 'message-b',
  guestId: 'guest-b',
  conversationId: 'conversation-b',
  ticketId: 'ticket-b',
  detectedIntent: 'synthetic_cross_tenant_injection'
});
assert.equal(blockedAiLog, null, 'Cross-tenant AI log ID injection should fail closed');
assert.equal(crossTenantSupabase.db.ai_logs.length, 0, 'Cross-tenant AI log ID injection should not insert');
assert.equal(wasInsertedInto(crossTenantSupabase, 'ai_logs'), false, 'Cross-tenant AI log ID injection should not attempt an insert');

const missingHotelSupabase = createFakeSupabase();
const missingHotelAiLog = await createAiLog({
  supabase: missingHotelSupabase,
  detectedIntent: 'synthetic_missing_hotel'
});
assert.equal(missingHotelAiLog, null, 'AI log without hotel_id should fail closed');
assert.equal(missingHotelSupabase.db.ai_logs.length, 0, 'AI log without hotel_id should not insert');

const conversationStateSupabase = createFakeSupabase({
  conversations: [{ id: 'conversation-a', hotel_id: hotelA }]
});
const blockedConversationState = await upsertConversationAiState({
  supabase: conversationStateSupabase,
  hotelId: hotelB,
  conversationId: 'conversation-a',
  state: {
    currentIntent: 'synthetic_intent',
    primaryIntent: { confidence: 0.8 },
    metadata: {}
  }
});
assert.equal(blockedConversationState, null, 'conversation_ai_state should reject conversation/hotel mismatch before write');
assert.equal(conversationStateSupabase.db.conversation_ai_state.length, 0, 'conversation_ai_state mismatch should not upsert');

const validConversationState = await upsertConversationAiState({
  supabase: conversationStateSupabase,
  hotelId: hotelA,
  conversationId: 'conversation-a',
  state: {
    currentIntent: 'synthetic_intent',
    primaryIntent: { confidence: 0.9 },
    metadata: {}
  }
});
assert.ok(validConversationState, 'Same-hotel conversation_ai_state should upsert');
assert.equal(conversationStateSupabase.db.conversation_ai_state.length, 1, 'Same-hotel conversation_ai_state should write once');
assert.equal(conversationStateSupabase.db.conversation_ai_state[0].hotel_id, hotelA, 'conversation_ai_state should retain hotel_id');

for (const table of ['guest_ai_profiles', 'guest_ai_tags', 'guest_ai_insights', 'guest_ai_actions']) {
  assert.equal(
    compositeFkAllows({
      parentRows: [{ id: 'guest-a', hotel_id: hotelA }],
      childRow: { guest_id: 'guest-a', hotel_id: hotelB },
      childColumns: ['guest_id', 'hotel_id'],
      parentColumns: ['id', 'hotel_id']
    }),
    false,
    `${table} composite FK semantics should reject guest/hotel mismatch`
  );
  assert.equal(
    compositeFkAllows({
      parentRows: [{ id: 'guest-a', hotel_id: hotelA }],
      childRow: { guest_id: 'guest-a', hotel_id: hotelA },
      childColumns: ['guest_id', 'hotel_id'],
      parentColumns: ['id', 'hotel_id']
    }),
    true,
    `${table} composite FK semantics should allow same-hotel guest`
  );
  assert.equal(
    compositeFkAllows({
      parentRows: [],
      childRow: { guest_id: null, hotel_id: hotelB },
      childColumns: ['guest_id', 'hotel_id'],
      parentColumns: ['id', 'hotel_id']
    }),
    true,
    `${table} composite FK semantics should not reject null optional guest_id`
  );
}

assert.equal(
  compositeFkAllows({
    parentRows: [{ id: 'reservation-a', hotel_id: hotelA }],
    childRow: { reservation_id: 'reservation-a', hotel_id: hotelB },
    childColumns: ['reservation_id', 'hotel_id'],
    parentColumns: ['id', 'hotel_id']
  }),
  false,
  'scheduled_messages composite FK semantics should reject reservation/hotel mismatch'
);
assert.equal(
  compositeFkAllows({
    parentRows: [{ id: 'reservation-a', hotel_id: hotelA }],
    childRow: { reservation_id: 'reservation-a', hotel_id: hotelA },
    childColumns: ['reservation_id', 'hotel_id'],
    parentColumns: ['id', 'hotel_id']
  }),
  true,
  'scheduled_messages composite FK semantics should allow same-hotel reservation'
);
assert.equal(
  compositeFkAllows({
    parentRows: [],
    childRow: { reservation_id: null, hotel_id: hotelB },
    childColumns: ['reservation_id', 'hotel_id'],
    parentColumns: ['id', 'hotel_id']
  }),
  true,
  'scheduled_messages reservation_id NULL should not produce a migration tenant violation'
);

for (const { table, childColumn, parentColumns } of [
  { table: 'conversation_ai_state', childColumn: 'conversation_id', parentColumns: ['id', 'hotel_id'] },
  { table: 'scheduled_messages', childColumn: 'guest_id', parentColumns: ['id', 'hotel_id'] },
  { table: 'scheduled_messages', childColumn: 'conversation_id', parentColumns: ['id', 'hotel_id'] },
  { table: 'ai_logs', childColumn: 'message_id', parentColumns: ['id', 'hotel_id'] },
  { table: 'ai_logs', childColumn: 'guest_id', parentColumns: ['id', 'hotel_id'] },
  { table: 'ai_logs', childColumn: 'conversation_id', parentColumns: ['id', 'hotel_id'] },
  { table: 'ai_logs', childColumn: 'ticket_id', parentColumns: ['id', 'hotel_id'] }
]) {
  assert.equal(
    compositeFkAllows({
      parentRows: [],
      childRow: { [childColumn]: null, hotel_id: hotelB },
      childColumns: [childColumn, 'hotel_id'],
      parentColumns
    }),
    true,
    `${table}.${childColumn} nullable relationship semantics should not reject null child ids`
  );
}

for (const table of scopedTables) {
  assertRegex(
    migration,
    new RegExp(`alter table public\\.${escapeRegExp(table)}\\s+enable row level security`, 'i'),
    `${table} should enable RLS`
  );

  for (const role of ['public', 'anon', 'authenticated']) {
    assertRegex(
      migration,
      new RegExp(`revoke all privileges on table public\\.${escapeRegExp(table)} from ${role}`, 'i'),
      `${table} should revoke ${role}`
    );
    assertRegex(
      rollback,
      new RegExp(`revoke all privileges on table public\\.${escapeRegExp(table)} from ${role}`, 'i'),
      `${table} rollback should keep ${role} revoked`
    );
  }

  assertRegex(
    migration,
    new RegExp(`grant select, insert, update, delete on table public\\.${escapeRegExp(table)} to service_role`, 'i'),
    `${table} should preserve service-role CRUD`
  );
  assertRegex(
    rollback,
    new RegExp(`grant select, insert, update, delete on table public\\.${escapeRegExp(table)} to service_role`, 'i'),
    `${table} rollback should preserve service-role CRUD`
  );
}

assertNoBrowserGrant(migration, 'P0-3 migration');
assertNoBrowserGrant(rollback, 'P0-3 rollback');
assert.doesNotMatch(migration, /\bcreate\s+(or\s+replace\s+)?policy\b/i, 'Server-only migration must not create browser policies');
assert.doesNotMatch(migration, /\bdisable\s+row\s+level\s+security\b/i, 'Migration must not disable RLS');
assert.doesNotMatch(rollback, /\bdisable\s+row\s+level\s+security\b/i, 'Rollback must not disable RLS');
assert.doesNotMatch(stripSqlCommentsAndStrings(rollback), /\b(delete\s+from|update\s+public|insert\s+into|drop\s+(table|column|constraint|index))\b/i, 'Rollback must not mutate data or drop objects');

for (const requiredToken of [
  'guests_id_hotel_id_unique_idx',
  'conversations_id_hotel_id_unique_idx',
  'reservations_id_hotel_id_unique_idx',
  'guest_ai_profiles_guest_hotel_match_fk',
  'guest_ai_tags_guest_hotel_match_fk',
  'guest_ai_insights_guest_hotel_match_fk',
  'guest_ai_actions_guest_hotel_match_fk',
  'conversation_ai_state_conversation_hotel_match_fk',
  'scheduled_messages_reservation_hotel_match_fk'
]) {
  assertContains(migration, requiredToken, `${requiredToken} should be part of tenant consistency migration`);
  assertContains(preflight, requiredToken, `${requiredToken} should be inventoried by preflight`);
}

assertRegex(
  migration,
  /foreign key \(guest_id, hotel_id\)\s+references public\.guests\(id, hotel_id\)/i,
  'guest_ai_* should enforce guest/hotel consistency'
);
assertRegex(
  migration,
  /foreign key \(conversation_id, hotel_id\)\s+references public\.conversations\(id, hotel_id\)/i,
  'conversation_ai_state should enforce conversation/hotel consistency'
);
assertRegex(
  migration,
  /foreign key \(reservation_id, hotel_id\)\s+references public\.reservations\(id, hotel_id\)/i,
  'scheduled_messages should enforce reservation/hotel consistency'
);

for (const table of ['guest_ai_profiles', 'guest_ai_tags', 'guest_ai_insights', 'guest_ai_actions']) {
  assertOptionalRelationshipTenantGuard({
    table,
    childColumn: 'guest_id',
    parentTable: 'guests',
    parentAlias: 'g'
  });
}

assertOptionalRelationshipTenantGuard({
  table: 'conversation_ai_state',
  childColumn: 'conversation_id',
  parentTable: 'conversations',
  parentAlias: 'c'
});
assertOptionalRelationshipTenantGuard({
  table: 'scheduled_messages',
  childColumn: 'reservation_id',
  parentTable: 'reservations',
  parentAlias: 'r'
});
assertOptionalRelationshipTenantGuard({
  table: 'scheduled_messages',
  childColumn: 'guest_id',
  parentTable: 'guests',
  parentAlias: 'g'
});
assertOptionalRelationshipTenantGuard({
  table: 'scheduled_messages',
  childColumn: 'conversation_id',
  parentTable: 'conversations',
  parentAlias: 'c'
});

for (const relation of [
  { childColumn: 'message_id', parentTable: 'messages', parentAlias: 'm' },
  { childColumn: 'guest_id', parentTable: 'guests', parentAlias: 'g' },
  { childColumn: 'conversation_id', parentTable: 'conversations', parentAlias: 'c' },
  { childColumn: 'ticket_id', parentTable: 'tickets', parentAlias: 'k' }
]) {
  assertOptionalAiLogGuard(relation);
}

for (const readinessToken of [
  'ready_for_p0_3',
  'readiness',
  'READY',
  'NEEDS_MANUAL_REVIEW',
  'BLOCKED',
  'hotel_id_null_count',
  'dangerous_browser_policies',
  'guest_hotel_mismatch_count',
  'conversation_hotel_mismatch_count',
  'reservation_hotel_mismatch_count',
  'orphan_relationship_count'
]) {
  assertContains(preflight, readinessToken, `Preflight should report ${readinessToken}`);
}

assert.doesNotMatch(
  stripSqlCommentsAndStrings(preflight),
  /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|vacuum|call)\b/i,
  'Preflight must be read-only'
);

for (const forbidden of [
  'phone_number',
  'email',
  'guest_name',
  'guest_email',
  'raw_guest_message',
  'generated_response',
  'message_preview',
  'send_to'
]) {
  assert.equal(preflight.toLowerCase().includes(forbidden), false, `Preflight must not expose ${forbidden}`);
}

const dashboardCodeFiles = [
  'dashboard/app',
  'dashboard/components',
  'dashboard/lib'
].flatMap((directory) => listCodeFiles(join(root, directory)));
const browserFiles = dashboardCodeFiles.filter((file) => {
  const source = readFileSync(file, 'utf8');
  const normalizedStart = source.trimStart().slice(0, 96);
  return file.endsWith(join('lib', 'supabase-browser.js'))
    || normalizedStart.startsWith("'use client'")
    || normalizedStart.startsWith('"use client"');
});

for (const file of browserFiles) {
  const source = readFileSync(file, 'utf8');
  const label = relative(root, file);

  for (const table of scopedTables) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\.from\\(\\s*['"\`]${escapeRegExp(table)}['"\`]\\s*\\)`, 'i'),
      `${label} must not browser-read or browser-write ${table}`
    );
  }
}

const inboxClient = readSource('dashboard/components/InboxClient.js');
assertRegex(inboxClient, /table:\s*'conversation_ai_state'/, 'Inbox browser subscription may observe state changes');
assert.doesNotMatch(
  inboxClient,
  /\.from\(\s*['"`]conversation_ai_state['"`]\s*\)/,
  'Inbox browser subscription must not directly read conversation_ai_state'
);

const inboxLib = readSource('dashboard/lib/inbox.js');
assertRegex(
  inboxLib,
  /const getLatestAiLogsByConversation = async \(\{ supabase, conversationIds, hotelId \}\)[\s\S]*?\.from\('ai_logs'\)[\s\S]*?\.eq\('hotel_id', hotelId\)[\s\S]*?\.in\('conversation_id', conversationIds\)/,
  'Inbox AI logs should be hotel-scoped server reads'
);
assertRegex(
  inboxLib,
  /const getAiStateByConversation = async \(\{ supabase, conversationIds, hotelId \}\)[\s\S]*?\.from\('conversation_ai_state'\)[\s\S]*?\.eq\('hotel_id', hotelId\)[\s\S]*?\.in\('conversation_id', conversationIds\)/,
  'Inbox AI state should be hotel-scoped server reads'
);

const aiLogsRoute = readSource('dashboard/app/api/ai-logs/route.js');
assertRegex(
  aiLogsRoute,
  /\.from\('ai_logs'\)[\s\S]*?\.eq\('hotel_id', hotel\.id\)[\s\S]*?\.in\('conversation_id', conversationIds\)/,
  'AI logs API should be scoped by current hotel'
);

const guestMemoryRoute = readSource('dashboard/app/api/guest-memory/[guestId]/route.js');
assertRegex(
  guestMemoryRoute,
  /\.from\('scheduled_messages'\)[\s\S]*?\.eq\('hotel_id', hotel\.id\)[\s\S]*?\.in\('reservation_id', reservationIds\)/,
  'Guest detail scheduled_messages read should be scoped by current hotel'
);
for (const table of ['guest_ai_profiles', 'guest_ai_tags', 'guest_ai_insights', 'guest_ai_actions', 'ai_logs']) {
  assertRegex(
    guestMemoryRoute,
    new RegExp(`\\.from\\('${escapeRegExp(table)}'\\)[\\s\\S]*?\\.eq\\('hotel_id', hotel\\.id\\)[\\s\\S]*?\\.eq\\('guest_id', guestId\\)`, 'i'),
    `Guest detail ${table} read should be hotel and guest scoped`
  );
}

const executiveRoute = readSource('dashboard/app/api/executive-dashboard/route.js');
for (const table of ['ai_logs', 'conversation_ai_state', 'scheduled_messages', 'guest_ai_profiles']) {
  assertRegex(
    executiveRoute,
    new RegExp(`withHotel\\(\\s*supabase\\.from\\('${escapeRegExp(table)}'\\)`, 'i'),
    `Executive dashboard ${table} queries should use hotel-scoped helper`
  );
}
assertRegex(
  executiveRoute,
  /\.from\('guests'\)[\s\S]*?\.eq\('hotel_id', hotelId\)[\s\S]*?\.in\('id', signalGuestIds\)/,
  'Executive dashboard signal guests should be hotel-scoped'
);

const aiLogService = readSource('src/services/ai-log.service.js');
for (const token of [
  'validateAiLogTenantContext',
  'missing_hotel_id',
  'messages_tenant_mismatch',
  'guests_tenant_mismatch',
  'conversations_tenant_mismatch',
  'tickets_tenant_mismatch',
  'AI log write blocked by tenant context'
]) {
  assertContains(aiLogService, token, `AI log service should enforce ${token}`);
}
assertRegex(
  aiLogService,
  /const tenantContext = await validateAiLogTenantContext\([\s\S]*?hotelId[\s\S]*?messageId[\s\S]*?guestId[\s\S]*?conversationId[\s\S]*?ticketId[\s\S]*?\)/,
  'AI log writes should validate all tenant relationships before insert'
);
assert.doesNotMatch(
  aiLogService,
  /\n\s*hotel_id,\s*\n[\s\S]*?\.\.\.fallbackRecord/,
  'AI log legacy retry must not strip hotel_id from fallback insert'
);

const conversationContextService = readSource('src/services/conversation-context.service.js');
assertRegex(
  conversationContextService,
  /\.from\('conversations'\)[\s\S]*?\.eq\('id', conversationId\)[\s\S]*?\.eq\('hotel_id', hotelId\)[\s\S]*?\.maybeSingle\(\)/,
  'conversation_ai_state writes should validate conversation/hotel ownership'
);
assertContains(
  conversationContextService,
  'Conversation AI state upsert blocked by tenant mismatch',
  'conversation_ai_state should fail closed on tenant mismatch'
);

const messageQueueService = readSource('src/services/message-queue.service.js');
assertRegex(
  messageQueueService,
  /createAiLog\(\{[\s\S]*?hotelId:\s*scheduledMessage\.hotel_id \|\| null[\s\S]*?\}\)/,
  'Scheduled message AI logs should preserve hotel_id'
);

const schedulerService = readSource('src/services/scheduler.service.js');
assertRegex(
  schedulerService,
  /createAiLog\(\{[\s\S]*?hotelId:\s*reservation\.hotel_id \|\| context\.hotelProfile\?\.id \|\| null[\s\S]*?\}\)/,
  'Scheduler AI logs should preserve hotel_id'
);

const demoDataService = readSource('src/services/demo-data.service.js');
assertRegex(
  demoDataService,
  /const createDemoAiLogs = async \(\{ hotelId[\s\S]*?createAiLog\(\{[\s\S]*?hotelId,/,
  'Demo AI log fixture should pass the explicit demo hotelId'
);

const queueWriter = readSource('shared/automations/queue-writer.js');
assertRegex(
  queueWriter,
  /\.from\('scheduled_messages'\)[\s\S]*?\.eq\('hotel_id', decision\.hotelId\)/,
  'Scheduled message queue should remain hotel-scoped'
);
assertContains(queueWriter, "process.env.SEND_AUTOMATIONS === 'true'", 'Automation runtime gate should remain unchanged');
assert.doesNotMatch(migration, /\b(for update|skip locked|claim|double-send)\b/i, 'P0-3 migration must not implement scheduled delivery atomicity');

for (const source of [preflight, migration, rollback]) {
  for (const forbidden of ['guest_memory', 'data_retention', 'cleanupExpiredGuestData']) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `P0-3 SQL must not touch ${forbidden}`);
  }
}

const self = readSource('scripts/test-guest-ai-tenant-isolation.js');
const forbiddenSupabaseModule = ['@supabase', '/supabase-js'].join('');
const forbiddenSupabaseConstructor = ['create', 'Client('].join('');
const forbiddenSupabaseUrl = ['SUPABASE', '_URL'].join('');
assert.equal(self.includes(forbiddenSupabaseModule), false, 'Test must not import Supabase client');
assert.equal(self.includes(forbiddenSupabaseConstructor), false, 'Test must not create a Supabase client');
assert.equal(self.includes(forbiddenSupabaseUrl), false, 'Test must not require live Supabase env');

console.log('Guest/AI tenant isolation checks passed');
