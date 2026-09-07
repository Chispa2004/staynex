import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canAccess,
  canAccessPlatform,
  getPermissionsForPlatformRole,
  getPermissionsForRole
} from '../dashboard/lib/permissions.js';

if ((process.env.NODE_OPTIONS || '').includes('dotenv/config')) {
  throw new Error('Refusing to run auth hotel context tests with dotenv preloaded');
}

for (const key of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'OPENAI_API_KEY'
]) {
  delete process.env[key];
}

process.env.BACKEND_URL = 'http://backend.test';

const root = process.cwd();
const hotelA = {
  id: 'hotel-a',
  name: 'Hotel A',
  slug: 'hotel-a',
  default_language: 'es',
  created_at: '2026-09-01T09:00:00.000Z'
};
const hotelB = {
  id: 'hotel-b',
  name: 'Hotel B',
  slug: 'hotel-b',
  default_language: 'fr',
  created_at: '2026-09-01T09:05:00.000Z'
};

const normalizeAuthEmail = (email) => String(email || '').trim().toLowerCase() || null;

const hotelAssignment = ({
  hotel = hotelA,
  role = 'manager',
  platformRole = 'none',
  multiPropertyAccess = false,
  isDefault = true,
  userId = 'user-a',
  email = 'user-a@example.com'
} = {}) => ({
  id: `assignment-${hotel.id}-${role}-${platformRole}`,
  hotel_id: hotel.id,
  hotel,
  role,
  status: 'active',
  platform_role: platformRole,
  multi_property_access: multiPropertyAccess,
  is_default: isDefault,
  user_id: userId,
  email,
  preferred_dashboard_language: 'es',
  preferred_translation_language: 'es'
});

const makeRequest = ({
  token = null,
  headerHotelId = null,
  queryHotelId = null,
  cookieHotelId = null,
  workspacePath = '/dashboard/inbox'
} = {}) => {
  const url = new URL('https://staynex.test/dashboard/inbox');

  if (queryHotelId) {
    url.searchParams.set('hotelId', queryHotelId);
  }

  const headers = new Headers({
    'x-staynex-workspace-path': workspacePath
  });

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  if (headerHotelId) {
    headers.set('x-staynex-hotel-id', headerHotelId);
  }

  return {
    url: url.toString(),
    headers,
    cookies: {
      get(name) {
        return name === 'staynex_active_hotel_id' && cookieHotelId
          ? { value: cookieHotelId }
          : undefined;
      }
    }
  };
};

class FakeSupabaseQuery {
  constructor({ tableName, rows, calls, error = null }) {
    this.tableName = tableName;
    this.rows = rows;
    this.calls = calls;
    this.error = error;
    this.filters = [];
    this.orderBy = null;
    this.limitCount = null;
    this.updateValues = null;
  }

  select(value) {
    this.calls.push({ type: 'select', tableName: this.tableName, value });
    return this;
  }

  eq(field, value) {
    this.calls.push({ type: 'eq', tableName: this.tableName, field, value });
    this.filters.push((row) => row[field] === value);
    return this;
  }

  order(field, options = {}) {
    this.orderBy = { field, ascending: options.ascending !== false };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  update(values) {
    this.updateValues = values;
    this.calls.push({ type: 'update', tableName: this.tableName, values });
    return this;
  }

  maybeSingle() {
    const result = this.execute();

    if (result.error) {
      return result;
    }

    return { data: result.data[0] || null, error: null };
  }

  execute() {
    if (this.error) {
      return { data: null, error: this.error };
    }

    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.orderBy) {
      data = [...data].sort((left, right) => {
        const leftValue = left[this.orderBy.field] || '';
        const rightValue = right[this.orderBy.field] || '';
        if (leftValue === rightValue) return 0;
        return (leftValue > rightValue ? 1 : -1) * (this.orderBy.ascending ? 1 : -1);
      });
    }

    if (Number.isFinite(this.limitCount)) {
      data = data.slice(0, this.limitCount);
    }

    if (this.updateValues) {
      for (const row of data) {
        Object.assign(row, this.updateValues);
      }
    }

    return { data, error: null };
  }

  then(resolve, reject) {
    try {
      resolve(this.execute());
    } catch (error) {
      reject(error);
    }
  }
}

const createFakeSupabase = ({
  authResults = {},
  hotels = [hotelA, hotelB],
  hotelUsers = [],
  missingHotelUsers = false,
  calls = []
} = {}) => ({
  calls,
  auth: {
    async getUser(token) {
      calls.push({ type: 'auth.getUser', token });
      return authResults[token] || {
        data: { user: null },
        error: new Error('invalid or expired session')
      };
    }
  },
  from(tableName) {
    calls.push({ type: 'from', tableName });
    const tableRows = {
      hotels,
      hotel_users: hotelUsers
    }[tableName] || [];
    const error = missingHotelUsers && tableName === 'hotel_users'
      ? new Error('relation "public.hotel_users" does not exist')
      : null;

    return new FakeSupabaseQuery({
      tableName,
      rows: tableRows,
      calls,
      error
    });
  }
});

const loadCurrentHotelModule = ({
  supabase,
  assignments = [],
  allAssignments = null,
  assignmentError = null,
  invitationError = null
}) => {
  const source = readFileSync(join(root, 'dashboard/lib/current-hotel.js'), 'utf8')
    .replace(/import[\s\S]*?from '\.\/supabase';\r?\n/, '')
    .replace(/import[\s\S]*?from '\.\/permissions';\r?\n/, '')
    .replace(/import[\s\S]*?from '\.\/user-invitations';\r?\n/, '')
    .replaceAll('export const ', 'const ');
  const assignmentCalls = [];

  return new Function(
    'getSupabaseAdmin',
    'canAccessPlatform',
    'getPermissionsForPlatformRole',
    'getPermissionsForRole',
    'getUserHotelAssignments',
    'normalizeAuthEmail',
    'resolvePendingInvitationsForUser',
    `${source}\nreturn { getCurrentHotelForRequest, getDefaultHotel };`
  )(
    () => supabase,
    canAccessPlatform,
    getPermissionsForPlatformRole,
    getPermissionsForRole,
    async (args) => {
      assignmentCalls.push(args);
      if (assignmentError) {
        throw assignmentError;
      }

      return args.statuses === null ? (allAssignments ?? assignments) : assignments;
    },
    normalizeAuthEmail,
    async () => {
      if (invitationError) {
        throw invitationError;
      }

      return undefined;
    }
  );
};

const validAuth = {
  data: { user: { id: 'user-a', email: 'User-A@Example.com' } },
  error: null
};

const contextHarness = (options = {}) => {
  const calls = [];
  const supabase = createFakeSupabase({
    calls,
    authResults: { valid: validAuth, ...(options.authResults || {}) },
    hotels: options.hotels || [hotelA, hotelB],
    hotelUsers: options.hotelUsers || [],
    missingHotelUsers: Boolean(options.missingHotelUsers)
  });

  return {
    calls,
    ...loadCurrentHotelModule({
      supabase,
      assignments: options.assignments || [],
      allAssignments: options.allAssignments,
      assignmentError: options.assignmentError || null,
      invitationError: options.invitationError || null
    })
  };
};

{
  const harness = contextHarness({
    hotels: [{ ...hotelA, slug: 'staynex-demo' }]
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest());

  assert.equal(context.accessDenied, true, 'anonymous requests must be access denied');
  assert.equal(context.accessDeniedReason, 'missing_session');
  assert.equal(context.hotel, null);
  assert.equal(context.role, 'blocked');
  assert.equal(context.fallback, false);
  assert.equal(harness.calls.some((call) => call.tableName === 'hotels'), false, 'anonymous requests must not look up a default hotel');
}

{
  const harness = contextHarness({
    authResults: {
      expired: { data: { user: null }, error: new Error('JWT expired') }
    },
    hotels: [{ ...hotelA, slug: 'staynex-demo' }]
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest({ token: 'expired' }));

  assert.equal(context.accessDenied, true, 'invalid sessions must be rejected');
  assert.equal(context.accessDeniedReason, 'invalid_session');
  assert.equal(context.hotel, null);
  assert.equal(context.role, 'blocked');
  assert.equal(harness.calls.some((call) => call.tableName === 'hotels'), false, 'invalid sessions must not look up a default hotel');
}

{
  const harness = contextHarness({ assignments: [], allAssignments: [] });
  const context = await harness.getCurrentHotelForRequest(makeRequest({ token: 'valid' }));

  assert.equal(context.accessDenied, true, 'users without assignments must be blocked');
  assert.equal(context.accessDeniedReason, 'no_active_assignment');
  assert.equal(context.hotel, null);
  assert.equal(context.role, 'blocked');
  assert.notEqual(context.role, 'owner');
}

{
  const assignmentError = new Error('temporary hotel assignment lookup failure');
  const harness = contextHarness({ assignmentError });

  await assert.rejects(
    () => harness.getCurrentHotelForRequest(makeRequest({ token: 'valid' })),
    /temporary hotel assignment lookup failure/,
    'assignment lookup failures must not fall back to a default hotel'
  );
  assert.equal(harness.calls.some((call) => call.tableName === 'hotels'), false, 'assignment errors must not fetch hotels');
}

{
  const harness = contextHarness({
    assignments: [hotelAssignment({ hotel: hotelA, role: 'receptionist' })],
    invitationError: new Error('temporary invitation resolution failure')
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest({ token: 'valid' }));

  assert.equal(context.hotel.id, hotelA.id, 'active memberships must still resolve when pending invitation resolution fails');
  assert.equal(context.role, 'receptionist');
  assert.equal(context.fallback, false);
  assert.equal(context.accessDenied, undefined);
}

{
  const missingSchemaError = new Error('hotel_users schema missing');
  const harness = contextHarness({
    assignmentError: missingSchemaError,
    missingHotelUsers: true
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest({ token: 'valid' }));

  assert.equal(context.accessDenied, true, 'missing identity schema without legacy access must be blocked');
  assert.equal(context.accessDeniedReason, 'legacy_assignment_missing');
  assert.equal(context.hotel, null);
  assert.equal(context.role, 'blocked');
}

{
  const harness = contextHarness({
    assignments: [hotelAssignment({ hotel: hotelA, role: 'receptionist' })]
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest({
    token: 'valid',
    headerHotelId: hotelB.id,
    cookieHotelId: hotelB.id,
    queryHotelId: hotelB.id
  }));

  assert.equal(context.accessDenied, undefined);
  assert.equal(context.hotel.id, hotelA.id, 'ordinary hotel users must stay scoped to their assigned hotel');
  assert.equal(context.role, 'receptionist');
  assert.equal(context.availableHotels.some((item) => item.hotel.id === hotelB.id), false, 'manipulated workspace state must not add Hotel B');
}

{
  const harness = contextHarness({
    assignments: [hotelAssignment({ hotel: hotelA, role: 'admin' })]
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest({ token: 'valid' }));

  assert.equal(context.hotel.id, hotelA.id, 'single authorized hotel should still auto-select');
  assert.equal(context.role, 'admin');
  assert.equal(context.fallback, false);
}

{
  const harness = contextHarness({
    assignments: [
      hotelAssignment({
        hotel: hotelA,
        role: 'admin',
        platformRole: 'platform_admin',
        multiPropertyAccess: true
      })
    ]
  });
  const context = await harness.getCurrentHotelForRequest(makeRequest({
    token: 'valid',
    headerHotelId: hotelB.id
  }));

  assert.equal(context.hotel.id, hotelB.id, 'authenticated platform admins can select a hotel workspace');
  assert.equal(context.platformRole, 'platform_admin');
  assert.equal(context.fallback, false);
}

const loadMessagesSendRoute = ({ getCurrentHotelForRequest }) => {
  const source = readFileSync(join(root, 'dashboard/app/api/messages/send/route.js'), 'utf8')
    .replace(/import[\s\S]*?;\r?\n/g, '')
    .replace('export async function POST', 'async function POST');
  const NextResponse = {
    json(body, init = {}) {
      return {
        status: init.status || 200,
        body,
        async json() {
          return body;
        }
      };
    }
  };

  return new Function(
    'NextResponse',
    'getCurrentHotelForRequest',
    'getInternalApiHeaders',
    'canAccess',
    'sanitizePilotOperationalMessage',
    `${source}\nreturn { POST };`
  )(
    NextResponse,
    getCurrentHotelForRequest,
    () => ({ Authorization: 'Bearer internal-test-token' }),
    canAccess,
    (value, fallback) => value || fallback
  );
};

const createConversationSupabase = (rows = []) => ({
  from(tableName) {
    assert.equal(tableName, 'conversations', 'messages/send should only read conversations before sending');
    return new FakeSupabaseQuery({
      tableName,
      rows,
      calls: []
    });
  }
});

const runMessagesSend = async ({ context, body }) => {
  let parsedBody = false;
  const fetchCalls = [];
  const previousFetch = globalThis.fetch;
  const { POST } = loadMessagesSendRoute({
    getCurrentHotelForRequest: async () => context
  });
  const request = {
    headers: new Headers(),
    async json() {
      parsedBody = true;
      return body;
    }
  };

  globalThis.fetch = async (url, options) => {
    fetchCalls.push({
      url,
      body: JSON.parse(options.body)
    });

    return {
      status: 200,
      async json() {
        return { ok: true };
      }
    };
  };

  try {
    const response = await POST(request);
    return {
      status: response.status,
      body: await response.json(),
      parsedBody,
      fetchCalls
    };
  } finally {
    globalThis.fetch = previousFetch;
  }
};

{
  const result = await runMessagesSend({
    context: {
      accessDenied: true,
      accessDeniedReason: 'missing_session',
      fallback: false,
      role: 'blocked',
      platformRole: 'none',
      hotel: null
    },
    body: { conversationId: 'conversation-a', message: 'hello' }
  });

  assert.equal(result.status, 401, 'anonymous messages/send must be rejected');
  assert.equal(result.parsedBody, false, 'rejected messages/send must not parse the body');
  assert.equal(result.fetchCalls.length, 0, 'rejected messages/send must not call the backend');
}

{
  const result = await runMessagesSend({
    context: {
      accessDenied: false,
      fallback: true,
      role: 'owner',
      platformRole: 'none',
      hotel: hotelA
    },
    body: { conversationId: 'conversation-a', message: 'hello' }
  });

  assert.equal(result.status, 403, 'fallback owner context must not be allowed to send');
  assert.equal(result.parsedBody, false);
  assert.equal(result.fetchCalls.length, 0);
}

{
  const result = await runMessagesSend({
    context: {
      accessDenied: false,
      fallback: false,
      role: 'receptionist',
      platformRole: 'none',
      hotel: hotelA,
      hotelUser: { preferred_translation_language: 'fr' },
      supabase: createConversationSupabase([{ id: 'conversation-a', hotel_id: hotelA.id }])
    },
    body: {
      conversationId: 'conversation-a',
      hotelId: hotelB.id,
      message: 'hola'
    }
  });

  assert.equal(result.status, 200, 'legitimate reception send should still work');
  assert.equal(result.fetchCalls.length, 1);
  assert.equal(result.fetchCalls[0].body.hotelId, hotelA.id, 'messages/send must derive hotelId from authorized context, not request body');
  assert.equal(result.fetchCalls[0].body.staffLanguage, 'fr');
}

{
  const result = await runMessagesSend({
    context: {
      accessDenied: false,
      fallback: false,
      role: 'receptionist',
      platformRole: 'none',
      hotel: hotelA,
      hotelUser: {},
      supabase: createConversationSupabase([{ id: 'conversation-b', hotel_id: hotelB.id }])
    },
    body: { conversationId: 'conversation-b', message: 'hola' }
  });

  assert.equal(result.status, 404, 'Hotel A users must not send to Hotel B conversations');
  assert.equal(result.fetchCalls.length, 0);
}

{
  const result = await runMessagesSend({
    context: {
      accessDenied: false,
      fallback: false,
      role: 'admin',
      platformRole: 'support',
      hotel: hotelB,
      hotelUser: {},
      supabase: createConversationSupabase([{ id: 'conversation-b', hotel_id: hotelB.id }])
    },
    body: { conversationId: 'conversation-b', message: 'support message' }
  });

  assert.equal(result.status, 403, 'support sessions must remain read-only for messages/send');
  assert.equal(result.fetchCalls.length, 0);
}

const currentHotelApi = readFileSync(join(root, 'dashboard/app/api/current-hotel/route.js'), 'utf8');
const currentHotelResolver = readFileSync(join(root, 'dashboard/lib/current-hotel.js'), 'utf8');
const messagesSendRoute = readFileSync(join(root, 'dashboard/app/api/messages/send/route.js'), 'utf8');
const appShellSource = readFileSync(join(root, 'dashboard/components/AppShell.js'), 'utf8');
const loginClientSource = readFileSync(join(root, 'dashboard/components/LoginClient.js'), 'utf8');

assert.ok(currentHotelResolver.includes('buildAccessDeniedContext'), 'current hotel resolver must centralize denied contexts');
assert.ok(currentHotelResolver.includes("reason: token ? 'invalid_session' : 'missing_session'"), 'missing or invalid sessions must be explicit');
assert.equal(/const\s+fallbackHotel\s*=\s*await\s+getDefaultHotel\(supabase\)/.test(currentHotelResolver), false, 'current hotel resolver must not fetch default hotels for unauthorized contexts');
assert.ok(messagesSendRoute.includes('accessDenied || fallback || !hotel?.id'), 'messages/send must reject blocked or fallback context before permissions');
assert.ok(messagesSendRoute.indexOf('accessDenied || fallback || !hotel?.id') < messagesSendRoute.indexOf('const body = await request.json()'), 'messages/send must reject before parsing the body');
assert.equal(currentHotelApi.includes("role: 'admin'"), false, 'current-hotel error payload must not invent admin role');
assert.ok(currentHotelApi.includes('getAccessDeniedStatus'), 'current-hotel API must expose session failures with explicit HTTP status');
assert.ok(appShellSource.includes("role: 'blocked'"), 'AppShell default context must fail closed');
assert.ok(appShellSource.includes('permissions: []'), 'AppShell default context must not start with broad permissions');
assert.equal(appShellSource.includes("body.role || 'owner'"), false, 'AppShell must not recover missing API roles as owner');
assert.equal(appShellSource.includes("body.permissions || ['all']"), false, 'AppShell must not recover missing API permissions as all');
assert.equal(loginClientSource.includes("getDefaultRouteForRole('owner')"), false, 'Login fallback must not route through owner defaults');
assert.equal(canAccess('blocked', 'inbox'), false, 'blocked context must not inherit receptionist Inbox access');

console.log('Auth hotel context checks passed');
