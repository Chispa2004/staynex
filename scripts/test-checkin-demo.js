import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.SEND_AUTOMATIONS = 'false';
process.env.GUEST_MEMORY_ENABLED = 'false';
process.env.AUTOMATION_TEST_CENTER_ENABLED = 'true';
process.env.AUTOMATION_TEST_SEND_ENABLED = 'false';
process.env.USE_MOCK_AI = 'true';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_WHATSAPP_FROM;
delete process.env.OPENAI_API_KEY;
delete process.env.UBIKOS_ENABLED;

const {
  CHECKIN_DEMO_FIXTURE_MARKER,
  CHECKIN_DEMO_HOTEL,
  CHECKIN_DEMO_PMS_PROVIDER,
  CHECKIN_DEMO_RESET_CONFIRMATION,
  CHECKIN_DEMO_SOURCE,
  assertCheckinDemoHotelTarget,
  assertCheckinDemoResetOptIn,
  buildCheckinDemoCleanupSelectors,
  buildCheckinDemoFixturePlan,
  buildCheckinDemoJourneyPreviews,
  buildCheckinDemoPreflightReport,
  buildCheckinDemoScheduledPreviewRows,
  getCheckinDemoPreflight,
  seedCheckinDemoScenario
} = await import(`../src/services/demo-data.service.js?checkinDemo=${Date.now()}`);
const { buildTicketCopilot } = await import(`../dashboard/lib/ai-copilot.js?checkinDemo=${Date.now()}`);
const {
  EXECUTION_MODES,
  OPERATIONAL_STATUSES
} = await import('../shared/automations/catalog.js');

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.insertRows = [];
    this.updateValues = null;
    this.upsertRows = [];
    this.onConflict = [];
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

  update(values) {
    this.operation = 'update';
    this.updateValues = values;
    return this;
  }

  upsert(rows, options = {}) {
    this.operation = 'upsert';
    this.upsertRows = Array.isArray(rows) ? rows : [rows];
    this.onConflict = String(options.onConflict || '').split(',').map((item) => item.trim()).filter(Boolean);
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values = []) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  contains(column, value = {}) {
    this.filters.push((row) => Object.entries(value).every(([key, expected]) => row[column]?.[key] === expected));
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    const result = this.execute();
    return Promise.resolve({
      data: result.data?.[0] || null,
      error: result.error
    });
  }

  single() {
    const result = this.execute();
    return Promise.resolve({
      data: result.data?.[0] || null,
      error: result.error
    });
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  matchingRows() {
    this.db[this.table] ||= [];
    return this.db[this.table].filter((row) => this.filters.every((filter) => filter(row)));
  }

  execute() {
    this.db[this.table] ||= [];

    if (this.operation === 'insert') {
      const inserted = this.insertRows.map((row) => {
        const next = {
          id: row.id || `${this.table}-${this.db.nextId++}`,
          created_at: row.created_at || now.toISOString(),
          ...row
        };
        this.db[this.table].push(next);
        return next;
      });
      return { data: inserted, error: null };
    }

    if (this.operation === 'upsert') {
      const changed = this.upsertRows.map((row) => {
        const existing = this.onConflict.length
          ? this.db[this.table].find((item) => this.onConflict.every((column) => item[column] === row[column]))
          : null;

        if (existing) {
          Object.assign(existing, row);
          return existing;
        }

        const next = {
          id: row.id || `${this.table}-${this.db.nextId++}`,
          created_at: row.created_at || now.toISOString(),
          ...row
        };
        this.db[this.table].push(next);
        return next;
      });
      return { data: changed, error: null };
    }

    const rows = this.matchingRows();

    if (this.operation === 'update') {
      rows.forEach((row) => Object.assign(row, this.updateValues));
      return { data: this.limitCount === null ? rows : rows.slice(0, this.limitCount), error: null };
    }

    if (this.operation === 'delete') {
      const toDelete = new Set(rows);
      this.db[this.table] = this.db[this.table].filter((row) => !toDelete.has(row));
      return { data: [], error: null };
    }

    return {
      data: this.limitCount === null ? rows : rows.slice(0, this.limitCount),
      error: null
    };
  }
}

class MissingTableQueryBuilder {
  constructor(table) {
    this.table = table;
  }

  select() { return this; }
  insert() { return this; }
  update() { return this; }
  upsert() { return this; }
  delete() { return this; }
  eq() { return this; }
  in() { return this; }
  contains() { return this; }
  limit() { return this; }

  execute() {
    return {
      data: null,
      error: {
        message: `relation "public.${this.table}" does not exist`,
        details: this.table
      }
    };
  }

  maybeSingle() {
    return Promise.resolve(this.execute());
  }

  single() {
    return Promise.resolve(this.execute());
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }
}

const createMockSupabase = (initial = {}, { missingTables = [] } = {}) => {
  const db = {
    nextId: 1,
    hotels: [],
    guests: [],
    reservations: [],
    conversations: [],
    messages: [],
    tickets: [],
    hotel_knowledge: [],
    hotel_rooms: [],
    room_status_snapshots: [],
    hotel_occupancy_snapshots: [],
    guest_stay_context: [],
    conversation_ai_state: [],
    scheduled_messages: [],
    hotel_pms_connections: [],
    ...structuredClone(initial)
  };

  return {
    db,
    from(table) {
      if (missingTables.includes(table)) {
        return new MissingTableQueryBuilder(table);
      }

      return new QueryBuilder(db, table);
    }
  };
};

const now = new Date('2026-09-01T10:00:00.000Z');
const hotelId = 'hotel-checkin-demo-test';
const plan = buildCheckinDemoFixturePlan({ hotelId, now });

assert.equal(plan.hotelTarget.slug, CHECKIN_DEMO_HOTEL.slug, 'fixture should target Hotel Demo Checkin only');
assert.equal(plan.hotel.id, hotelId, 'fixture should be scoped to explicit hotel id');
assert.equal(plan.hotel.name, CHECKIN_DEMO_HOTEL.name, 'fixture should keep the demo hotel name');
assert.equal(plan.hotel.ai_auto_reply_enabled, true, 'hotel kill switch should be configured on for the demo');
assert.equal(plan.hotel.metadata.ai_auto_reply_enabled, undefined, 'hotel kill switch must not be stored in metadata');
assert.equal(plan.hotel.metadata.automation_execution_mode, EXECUTION_MODES.PREVIEW, 'automations must remain preview');
assert.equal(plan.safety.guestMemory, false, 'Guest Memory must stay off');
assert.equal(plan.safety.twilioReal, false, 'Twilio must not be touched');
assert.equal(plan.safety.openAiReal, false, 'OpenAI must not be touched');
assert.equal(plan.safety.pmsReal, false, 'real PMS must not be touched');

assert.equal(plan.reservations.length, 12, 'demo should include a compact but complete reservation set');
assert.equal(plan.rooms.length, 12, 'demo should include room inventory');
assert.equal(plan.conversations.length, 5, 'demo should include focused inbox conversations');
assert.equal(plan.tickets.length, 4, 'demo should include operational tickets');
assert.equal(plan.knowledge.length, 18, 'demo should include operational knowledge');

assert.ok(plan.reservations.every((reservation) => reservation.hotel_id === hotelId), 'reservations must be hotel-scoped');
assert.ok(plan.guests.every((guest) => guest.hotel_id === hotelId), 'guests must be hotel-scoped');
assert.ok(plan.rooms.every((room) => room.hotel_id === hotelId), 'rooms must be hotel-scoped');
assert.ok(plan.conversations.every((conversation) => conversation.hotel_id === hotelId), 'conversations must be hotel-scoped');
assert.ok(plan.tickets.every((ticket) => ticket.hotel_id === hotelId), 'tickets must be hotel-scoped');
assert.ok(plan.knowledge.every((entry) => entry.hotel_id === hotelId), 'knowledge must be hotel-scoped');

const pmsIds = new Set(plan.reservations.map((reservation) => reservation.pms_reservation_id));
assert.equal(pmsIds.size, plan.reservations.length, 'PMS reservation ids should be unique');
assert.ok(plan.reservations.every((reservation) => reservation.pms_provider === CHECKIN_DEMO_PMS_PROVIDER), 'reservations should use the Checkin demo PMS provider');
assert.ok(plan.reservations.every((reservation) => reservation.source === CHECKIN_DEMO_SOURCE), 'reservations should carry demo source');
assert.ok(plan.reservations.every((reservation) => /^CHECKIN-DEMO-/.test(reservation.pms_reservation_id)), 'PMS ids should be recognizable demo ids');
assert.ok(plan.reservations.every((reservation) => reservation.guest_email.endsWith('@example.invalid')), 'emails must be synthetic');
assert.ok(plan.reservations.every((reservation) => /^\+1500555\d{4}$/.test(reservation.guest_phone)), 'phones must be synthetic test phones');

const statuses = new Set(plan.reservations.map((reservation) => reservation.status));
for (const status of ['confirmed', 'checked_in', 'checked_out', 'cancelled']) {
  assert.ok(statuses.has(status), `reservation set should include ${status}`);
}

const mainReservation = plan.reservations.find((reservation) => reservation.key === 'main-lucia');
assert.equal(mainReservation.guest_name, 'Lucía Martín', 'main story guest should show the real demo identity');
assert.equal(mainReservation.status, 'checked_in', 'main story guest should be checked in');
assert.equal(mainReservation.room_number, '208', 'main story should happen in room 208');
const mainConversation = plan.conversations.find((conversation) => conversation.key === 'main-lucia');
assert.match(mainConversation.messages[1].content, /Lucía/, 'main story AI reply should keep the guest name visible');
assert.equal(
  mainConversation.messages.at(-1).content,
  'Hola, me podeis traer dos toallas mas a la habitacion?',
  'main story should be a towel request from the guest'
);
assert.equal(mainConversation.ai_state.state_metadata.conversation_ai_mode, 'ai_active', 'main story should start with AI active');
const mainTicket = plan.tickets.find((ticket) => ticket.key === 'main-towels');
assert.equal(mainTicket.category, 'housekeeping', 'main story should create a housekeeping ticket');
assert.equal(mainTicket.status, 'open', 'main ticket should be open for demo handling');
assert.equal(buildTicketCopilot(mainTicket).suggestedDepartment, 'Housekeeping', 'towel requests should route to housekeeping');
assert.equal(
  buildTicketCopilot({ category: 'maintenance', title: 'Aire acondicionado habitacion 401', description: 'No enfria' }).suggestedDepartment,
  'Maintenance',
  'AC maintenance should keep routing to maintenance'
);

const complaintConversation = plan.conversations.find((conversation) => conversation.key === 'complaint-david');
assert.equal(complaintConversation.ai_state.escalation_level, 'reception_required', 'fallback conversation should require reception');
assert.equal(complaintConversation.ai_state.state_metadata.conversation_ai_mode, 'human_takeover', 'fallback conversation should demonstrate human takeover');
assert.ok(plan.tickets.some((ticket) => ticket.category === 'complaint' && ticket.status === 'open'), 'demo should include a human fallback ticket');

const room208 = plan.rooms.find((room) => room.room_number === '208');
assert.equal(room208.qr_enabled, true, 'room 208 should be QR-ready');
assert.equal(room208.source, CHECKIN_DEMO_SOURCE, 'rooms should be marked as demo source');
const room401Status = plan.roomStatusSnapshots.find((room) => room.room_number === '401');
assert.equal(room401Status.maintenance_status, 'maintenance', 'maintenance ticket should show in room status');

const knowledgeKeys = new Set(plan.knowledge.map((entry) => entry.key));
for (const key of ['check_in', 'check_out', 'desayuno', 'wifi', 'housekeeping_toallas', 'late_checkout', 'transfer', 'emergencias']) {
  assert.ok(knowledgeKeys.has(key), `${key} knowledge should exist`);
}

const inboxSource = readFileSync(new URL('../dashboard/lib/inbox.js', import.meta.url), 'utf8');
assert.match(inboxSource, /getReservationIdentityLookups/, 'Inbox should use reservation context for guest identity');
assert.match(inboxSource, /byPhone\.get\(normalizePhone\(guest\?\.phone_number\)\)/, 'Inbox should recover reservation identity through same-tenant guest phone when guest_id links drift');
assert.match(inboxSource, /guest_name/, 'Inbox should prefer reservation guest names when guest rows only have phones');
assert.match(inboxSource, /room_number/, 'Inbox should derive room context from reservations when needed');

const reservationsClientSource = readFileSync(new URL('../dashboard/components/ReservationsClient.js', import.meta.url), 'utf8');
assert.match(reservationsClientSource, /CANCELLED_RESERVATION_STATUSES/, 'Reservations UI should classify cancelled stays explicitly');
assert.match(reservationsClientSource, /status !== 'cancelled' && reservation\.arrival_date === today/, 'Cancelled reservations should not appear as today arrivals');
assert.match(reservationsClientSource, /filteredReservations\.some/, 'Reservation detail should follow the visible filtered result');
assert.match(reservationsClientSource, /isCheckinDemoHotel/, 'Reservations demo controls should be scoped to the Checkin demo hotel');
assert.match(reservationsClientSource, /canCreateDemoReservation = canManageReservations && isCheckinDemoHotel\(currentHotel\)/, 'Demo reservation creation should stay hidden in normal hotel workspaces');

const reservationsApiSource = readFileSync(new URL('../dashboard/app/api/reservations/route.js', import.meta.url), 'utf8');
assert.match(reservationsApiSource, /return 'cancelled'/, 'Reservations API should not compute cancelled rows as pre-arrival');

const healthSource = readFileSync(new URL('../dashboard/components/HotelHealthClient.js', import.meta.url), 'utf8');
assert.match(healthSource, /DEMO_READY/, 'Pilot Health should present demo readiness separately from live status');
assert.match(healthSource, /Go-Live pendiente/, 'Pilot Health should keep live automation blockers honest');

const systemHealthSource = readFileSync(new URL('../dashboard/lib/system-health.js', import.meta.url), 'utf8');
assert.match(systemHealthSource, /demo scenario tickets are open/, 'Hotel Health should label demo tickets as demo scenario data');

const executiveDashboardSource = readFileSync(new URL('../dashboard/app/api/executive-dashboard/route.js', import.meta.url), 'utf8');
assert.match(executiveDashboardSource, /guestSatisfactionSource/, 'Executive KPI should expose whether satisfaction is demo-estimated');
assert.match(executiveDashboardSource, /getPilotAiSafetyReadiness/, 'Executive dashboard API should reuse canonical Pilot Health AI safety readiness');
assert.match(executiveDashboardSource, /pilotAiSafety/, 'Executive dashboard API should serialize canonical AI safety state');

const executiveDashboardClientSource = readFileSync(new URL('../dashboard/components/ExecutiveDashboardClient.js', import.meta.url), 'utf8');
assert.match(executiveDashboardClientSource, /Respuestas IA activas/, 'Dashboard should show AI active only from canonical safety state');
assert.match(executiveDashboardClientSource, /Respuestas IA desactivadas/, 'Dashboard should show hotel AI switch OFF honestly');
assert.match(executiveDashboardClientSource, /Bloqueo global activo/, 'Dashboard should show global AI block state');
assert.doesNotMatch(executiveDashboardClientSource, /value: 'Activa'/, 'Dashboard must not hardcode AI as active');

const ticketsTableSource = readFileSync(new URL('../dashboard/components/TicketsTable.js', import.meta.url), 'utf8');
assert.match(ticketsTableSource, /getTicketPrimaryText/, 'Tickets table should expose the canonical ticket issue summary');
assert.match(ticketsTableSource, /ticket\.title \|\| ticket\.subject \|\| ticket\.short_description \|\| ticket\.description/, 'Tickets table should use existing title/subject/description data only');
assert.match(ticketsTableSource, /Problema/, 'Tickets desktop table should make the issue primary, not only the room number');

const receptionPreCheckinSource = readFileSync(new URL('../dashboard/components/ReceptionPreCheckinClient.js', import.meta.url), 'utf8');
assert.match(receptionPreCheckinSource, /guestMemoryEnabled \? \['Guest memory'/, 'Pre Check-in should hide Guest Memory when the feature flag is off');
assert.doesNotMatch(receptionPreCheckinSource, /label="Create ticket"/, 'Pre Check-in should not advertise contextual ticket creation');
assert.match(receptionPreCheckinSource, /label="Ver tickets"/, 'Pre Check-in ticket action should be an honest navigation label');

const receptionApiSource = readFileSync(new URL('../dashboard/app/api/reception/route.js', import.meta.url), 'utf8');
assert.match(receptionApiSource, /guestMemoryEnabled: isGuestMemoryEnabled\(\)/, 'Reception API should expose the server Guest Memory flag to the UI');

const previews = buildCheckinDemoJourneyPreviews({ plan, now });
assert.equal(previews.length, 6, 'four pilot journey families should produce six concrete previews');
assert.ok(previews.every((preview) => preview.eligible), `all demo journey previews should be eligible: ${previews.map((preview) => preview.skipReason).filter(Boolean).join(', ')}`);
assert.ok(previews.every((preview) => preview.status === OPERATIONAL_STATUSES.PREVIEW), 'journey previews should be preview status');
assert.ok(previews.every((preview) => preview.executionMode === EXECUTION_MODES.PREVIEW), 'journey previews should stay in preview execution');
assert.ok(previews.every((preview) => preview.sendable === false), 'journey previews must never be sendable');
assert.ok(previews.every((preview) => preview.decision.metadata.live_sending_disabled === true), 'live sending should be explicitly disabled');
assert.deepEqual(
  [...new Set(previews.map((preview) => preview.journeyId))].sort(),
  ['checkout_review', 'during_stay_upsell', 'pre_checkin', 'welcome'].sort(),
  'previews should cover exactly the certified pilot journey families'
);

const scheduledPreviews = buildCheckinDemoScheduledPreviewRows({ plan, now });
assert.equal(scheduledPreviews.length, 6, 'scheduled preview rows should match preview count');
assert.ok(scheduledPreviews.every((message) => message.status === OPERATIONAL_STATUSES.PREVIEW), 'scheduled rows should be preview only');
assert.ok(scheduledPreviews.every((message) => message.send_to === null), 'scheduled rows should not store guest send targets');
assert.ok(scheduledPreviews.every((message) => message.metadata.fixture === CHECKIN_DEMO_FIXTURE_MARKER), 'scheduled rows should carry fixture marker');
assert.ok(scheduledPreviews.every((message) => message.metadata.live_sending_disabled === true), 'scheduled rows should block live sends');
assert.deepEqual(
  [...new Set(scheduledPreviews.map((message) => message.automation_type))].sort(),
  ['abandoned_interest_followup', 'checkout', 'post_stay_review_intelligence', 'pre_arrival_1d', 'welcome_message', 'weather_trigger'].sort(),
  'scheduled rows should use the expected runtime trigger names'
);

assert.equal(plan.ubikos.provider, 'ubikos', 'Ubikos state should be visible to the demo');
assert.equal(plan.ubikos.liveConnected, false, 'Ubikos must not be marked live connected');
assert.equal(plan.ubikos.realWrites, false, 'Ubikos demo must not perform real PMS writes');
assert.equal(plan.ubikos.secretsStored, false, 'Ubikos demo must not store secrets');

assert.throws(
  () => assertCheckinDemoResetOptIn('wrong-hotel'),
  /Refusing to reset Checkin demo data/,
  'reset must require explicit hotel slug confirmation'
);
assert.equal(assertCheckinDemoResetOptIn(CHECKIN_DEMO_RESET_CONFIRMATION), true, 'correct reset confirmation should pass');
assert.throws(
  () => assertCheckinDemoHotelTarget({ id: 'other', name: 'Staynex Demo Hotel', slug: 'staynex-demo' }),
  /outside Hotel Demo Checkin/,
  'Checkin demo must not fall back to the default demo hotel'
);
assert.equal(assertCheckinDemoHotelTarget(plan.hotel), true, 'explicit Checkin demo hotel should pass target guard');

const cleanupSelectors = buildCheckinDemoCleanupSelectors({ hotelId });
assert.ok(cleanupSelectors.length >= 10, 'cleanup should cover demo tables');
assert.ok(cleanupSelectors.every((selector) => selector.hotelId === hotelId), 'cleanup selectors must always be hotel-scoped');
assert.ok(cleanupSelectors.some((selector) => selector.table === 'reservations' && selector.by.includes('pms_provider')), 'reservation cleanup should use demo PMS ids');
assert.ok(cleanupSelectors.some((selector) => selector.table === 'hotel_knowledge' && selector.keys.length === plan.knowledge.length), 'knowledge cleanup should use known keys');

const rows = {
  reservations: plan.reservations,
  guests: plan.guests,
  rooms: plan.rooms,
  conversations: plan.conversations,
  messages: plan.conversations.flatMap((conversation) => conversation.messages),
  tickets: plan.tickets,
  knowledge: plan.knowledge,
  stayContexts: plan.stayContexts,
  roomStatusSnapshots: plan.roomStatusSnapshots,
  occupancySnapshots: plan.occupancySnapshots,
  conversationStates: plan.conversations.map((conversation) => conversation.ai_state),
  scheduledMessages: scheduledPreviews,
  pmsConnections: []
};
const preflight = buildCheckinDemoPreflightReport({
  hotel: plan.hotel,
  rows,
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(preflight.readyForPilotDemo, true, 'complete fixture should be ready for demo preflight');
assert.equal(preflight.readyForLiveAutomations, false, 'demo preflight must not certify live automations');
assert.equal(preflight.productionDataSeeded, false, 'test should not seed production data');
assert.equal(preflight.checks.four_pilot_journeys_ready, true, 'preflight should verify four pilot journeys');
assert.equal(preflight.checks.kill_switch_ready, true, 'preflight should verify the canonical hotel AI switch');
assert.equal(preflight.hotelAiKillSwitch.source, 'hotels.ai_auto_reply_enabled', 'preflight should read the canonical hotel AI switch column');
assert.equal(preflight.checks.no_real_provider_traffic, true, 'preflight should confirm no provider traffic');
assert.equal(preflight.checks.stay_context_ready, true, 'preflight should verify stay context');
assert.equal(preflight.checks.room_status_ready, true, 'preflight should verify room statuses');
assert.equal(preflight.checks.occupancy_snapshot_ready, true, 'preflight should verify occupancy snapshot');
assert.equal(preflight.optionalTables.guest_stay_context.status, 'AVAILABLE', 'available optional stay context should be reported');
assert.equal(preflight.optionalTables.guest_stay_context.requirement, 'OPTIONAL', 'optional stay context should be labeled optional');
assert.equal(preflight.optionalTables.guest_stay_context.blocking, false, 'populated optional stay context should not block');
assert.equal(preflight.ubikos.liveConnected, false, 'preflight should keep Ubikos non-live');
assert.ok(preflight.liveSendBlockers.includes('SEND_AUTOMATIONS=true controlled rollout'), 'live send blockers should remain explicit');

const optionalUnavailablePreflight = buildCheckinDemoPreflightReport({
  hotel: plan.hotel,
  rows: {
    ...rows,
    stayContexts: [],
    roomStatusSnapshots: [],
    occupancySnapshots: []
  },
  tableAvailability: {
    guest_stay_context: { status: 'NOT_AVAILABLE' },
    room_status_snapshots: { status: 'NOT_AVAILABLE' },
    hotel_occupancy_snapshots: { status: 'NOT_AVAILABLE' }
  },
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(optionalUnavailablePreflight.readyForPilotDemo, true, 'missing optional tables should not block demo readiness');
assert.equal(optionalUnavailablePreflight.checks.stay_context_ready, true, 'missing stay context table should be non-blocking');
assert.equal(optionalUnavailablePreflight.checks.room_status_ready, true, 'missing room status table should be non-blocking');
assert.equal(optionalUnavailablePreflight.checks.occupancy_snapshot_ready, true, 'missing occupancy table should be non-blocking');
for (const table of ['guest_stay_context', 'room_status_snapshots', 'hotel_occupancy_snapshots']) {
  assert.equal(optionalUnavailablePreflight.optionalTables[table].status, 'NOT_AVAILABLE', `${table} should report NOT_AVAILABLE`);
  assert.equal(optionalUnavailablePreflight.optionalTables[table].requirement, 'OPTIONAL', `${table} should report OPTIONAL`);
  assert.equal(optionalUnavailablePreflight.optionalTables[table].blocking, false, `${table} should not block when absent`);
}

const optionalAvailableButEmptyPreflight = buildCheckinDemoPreflightReport({
  hotel: plan.hotel,
  rows: {
    ...rows,
    stayContexts: [],
    roomStatusSnapshots: [],
    occupancySnapshots: []
  },
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(optionalAvailableButEmptyPreflight.readyForPilotDemo, false, 'available optional tables should be verified normally');
assert.equal(optionalAvailableButEmptyPreflight.optionalTables.guest_stay_context.status, 'AVAILABLE', 'empty existing stay context table should still be available');
assert.equal(optionalAvailableButEmptyPreflight.optionalTables.guest_stay_context.blocking, true, 'empty existing optional table should report a blocking population failure');

const { ai_auto_reply_enabled: _omittedHotelAiSwitch, ...hotelWithoutAiSwitch } = plan.hotel;
const metadataOnlyPreflight = buildCheckinDemoPreflightReport({
  hotel: {
    ...hotelWithoutAiSwitch,
    metadata: {
      ...(plan.hotel.metadata || {}),
      ai_auto_reply_enabled: true
    }
  },
  rows,
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(metadataOnlyPreflight.checks.kill_switch_ready, false, 'metadata-only AI switch should not satisfy demo preflight');
assert.equal(metadataOnlyPreflight.readyForPilotDemo, false, 'metadata-only AI switch should not create a false ready state');

const blockedPreflight = buildCheckinDemoPreflightReport({
  hotel: plan.hotel,
  rows: {
    ...rows,
    scheduledMessages: scheduledPreviews.map((message, index) => index === 0 ? { ...message, send_to: '+15005550001' } : message)
  },
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(blockedPreflight.readyForPilotDemo, false, 'preflight should fail if a scheduled preview has a send target');

const { metadata: _planHotelMetadata, ...planHotelDbRecord } = plan.hotel;
const supabase = createMockSupabase({
  hotels: [{
    ...planHotelDbRecord,
    id: hotelId,
    name: CHECKIN_DEMO_HOTEL.name,
    slug: CHECKIN_DEMO_HOTEL.slug,
    ai_auto_reply_enabled: false
  }]
});
const firstSeed = await seedCheckinDemoScenario({
  confirm: CHECKIN_DEMO_RESET_CONFIRMATION,
  supabase,
  now
});
assert.equal(firstSeed.reservations, 12, 'seed should create reservations');
assert.equal(firstSeed.conversations, 5, 'seed should create conversations');
assert.equal(firstSeed.scheduledPreviews, 6, 'seed should create journey previews');
assert.equal(supabase.db.reservations.length, 12, 'seeded reservations should be present');
assert.equal(supabase.db.guests.length, 12, 'seeded guests should be present');
assert.equal(supabase.db.conversations.length, 5, 'seeded conversations should be present');
assert.equal(supabase.db.messages.length, 11, 'seeded messages should be present');
assert.equal(supabase.db.tickets.length, 4, 'seeded tickets should be present');
assert.equal(supabase.db.hotel_knowledge.length, 18, 'seeded knowledge should be present');
assert.equal(supabase.db.scheduled_messages.length, 6, 'seeded scheduled previews should be present');
assert.ok(supabase.db.scheduled_messages.every((message) => message.send_to === null), 'seeded previews should not include send targets');
assert.ok(supabase.db.scheduled_messages.every((message) => message.metadata.fixture === CHECKIN_DEMO_FIXTURE_MARKER), 'seeded previews should carry fixture marker');
assert.equal(supabase.db.hotels[0].ai_auto_reply_enabled, true, 'reset should enable AI only through the canonical hotel column');
assert.equal(process.env.SEND_AUTOMATIONS, 'false', 'reset must not enable SEND_AUTOMATIONS');

const firstCounts = {
  guests: supabase.db.guests.length,
  reservations: supabase.db.reservations.length,
  conversations: supabase.db.conversations.length,
  messages: supabase.db.messages.length,
  tickets: supabase.db.tickets.length,
  knowledge: supabase.db.hotel_knowledge.length,
  scheduledMessages: supabase.db.scheduled_messages.length
};
await seedCheckinDemoScenario({
  confirm: CHECKIN_DEMO_RESET_CONFIRMATION,
  supabase,
  now
});
assert.deepEqual({
  guests: supabase.db.guests.length,
  reservations: supabase.db.reservations.length,
  conversations: supabase.db.conversations.length,
  messages: supabase.db.messages.length,
  tickets: supabase.db.tickets.length,
  knowledge: supabase.db.hotel_knowledge.length,
  scheduledMessages: supabase.db.scheduled_messages.length
}, firstCounts, 'repeat seed should reset in place without duplicate demo rows');

const seededPreflight = buildCheckinDemoPreflightReport({
  hotel: supabase.db.hotels[0],
  rows: {
    reservations: supabase.db.reservations,
    guests: supabase.db.guests,
    rooms: supabase.db.hotel_rooms,
    conversations: supabase.db.conversations,
    messages: supabase.db.messages,
    tickets: supabase.db.tickets,
    knowledge: supabase.db.hotel_knowledge,
    stayContexts: supabase.db.guest_stay_context,
    roomStatusSnapshots: supabase.db.room_status_snapshots,
    occupancySnapshots: supabase.db.hotel_occupancy_snapshots,
    conversationStates: supabase.db.conversation_ai_state,
    scheduledMessages: supabase.db.scheduled_messages,
    pmsConnections: supabase.db.hotel_pms_connections
  },
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(seededPreflight.readyForPilotDemo, true, 'seeded data should pass demo preflight');

const missingOptionalTables = [
  'guest_stay_context',
  'room_status_snapshots',
  'hotel_occupancy_snapshots'
];
const missingOptionalSupabase = createMockSupabase({
  hotels: [{
    ...planHotelDbRecord,
    id: hotelId,
    name: CHECKIN_DEMO_HOTEL.name,
    slug: CHECKIN_DEMO_HOTEL.slug,
    ai_auto_reply_enabled: false
  }]
}, {
  missingTables: missingOptionalTables
});
const missingOptionalSeed = await seedCheckinDemoScenario({
  confirm: CHECKIN_DEMO_RESET_CONFIRMATION,
  supabase: missingOptionalSupabase,
  now
});
for (const table of missingOptionalTables) {
  assert.equal(missingOptionalSeed.optionalTables[table].status, 'NOT_AVAILABLE', `${table} seed should report NOT_AVAILABLE`);
  assert.equal(missingOptionalSeed.optionalTables[table].requirement, 'OPTIONAL', `${table} seed should report OPTIONAL`);
  assert.equal(missingOptionalSeed.optionalTables[table].blocking, false, `${table} seed should be non-blocking when absent`);
}
const missingOptionalRuntimePreflight = await getCheckinDemoPreflight({
  supabase: missingOptionalSupabase,
  env: {
    SEND_AUTOMATIONS: 'false',
    GUEST_MEMORY_ENABLED: 'false'
  }
});
assert.equal(missingOptionalRuntimePreflight.readyForPilotDemo, true, 'runtime preflight should pass without optional tables');
for (const table of missingOptionalTables) {
  assert.equal(missingOptionalRuntimePreflight.optionalTables[table].status, 'NOT_AVAILABLE', `${table} runtime preflight should report NOT_AVAILABLE`);
  assert.equal(missingOptionalRuntimePreflight.optionalTables[table].requirement, 'OPTIONAL', `${table} runtime preflight should report OPTIONAL`);
  assert.equal(missingOptionalRuntimePreflight.optionalTables[table].blocking, false, `${table} runtime preflight should not block when absent`);
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['test:checkin-demo'], 'node scripts/test-checkin-demo.js', 'package script should register the Checkin demo test');
assert.equal(packageJson.scripts['demo:reset-checkin-demo'], 'node scripts/reset-checkin-demo.js', 'package script should register the opt-in reset');
assert.equal(packageJson.scripts['demo:preflight-checkin-demo'], 'node scripts/preflight-checkin-demo.js', 'package script should register the read-only preflight');

console.log('Checkin demo preparation tests passed');
