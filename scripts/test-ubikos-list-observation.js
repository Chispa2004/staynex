import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {observeUbikosList} from '../src/services/pms/ubikos/list-observation.js';

// Entirely invented fixtures. No credential store, captured response or dotenv.
let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw new Error('External transport blocked'); };
const context = Object.freeze({
  provider: 'ubikos', externalHotelId: 'fictional-hotel-A', operation: 'checkin',
  date: '2026-10-20', observedAt: '2026-10-20T16:00:00+02:00'
});
const row = Object.freeze({BOOKING_ID: 7001, ROOM_ID: '0027'});
const observe = (rows, patch = {}) => observeUbikosList({...context, ...patch}, rows);

test('safe numeric IDs become text without coercing, rounding or assuming positive provider semantics', () => {
  const valid = [7001, 0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
  const result = observe(valid.map(BOOKING_ID => ({BOOKING_ID, ROOM_ID: '0027'})));
  assert.equal(result.status, 'recorded');
  assert.deepEqual(result.records.map(r => r.externalBookingId), valid.map(String));
  for (const BOOKING_ID of ['7001', 7.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1, null, true, {}, 7n, 'PRIVATE_VALUE']) {
    const rejected = observe([{BOOKING_ID, ROOM_ID: '0027'}]);
    assert.equal(rejected.records[0].externalBookingId, null);
    assert.deepEqual(rejected.issues, [{code: 'BOOKING_ID_INVALID', index: 0}]);
    assert.ok(!JSON.stringify(rejected).includes('PRIVATE_VALUE'));
  }
  assert.equal(observe([{}]).issues[0].code, 'BOOKING_ID_MISSING');
});

test('room references preserve leading zeros and whitespace without claiming assignment', () => {
  for (const ROOM_ID of ['0027', ' 0027 ', 'A-02']) {
    assert.equal(observe([{...row, ROOM_ID}]).records[0].externalRoomReference, ROOM_ID);
  }
  for (const [ROOM_ID, code] of [
    ['', 'ROOM_REFERENCE_EMPTY'], ['   ', 'ROOM_REFERENCE_EMPTY'],
    [undefined, 'ROOM_REFERENCE_MISSING'], [null, 'ROOM_REFERENCE_INVALID'],
    [27, 'ROOM_REFERENCE_INVALID'], [{name: 'PRIVATE'}, 'ROOM_REFERENCE_INVALID'],
    ['x'.repeat(201), 'ROOM_REFERENCE_INVALID'], ['A\nB', 'ROOM_REFERENCE_INVALID']
  ]) {
    const result = observe([{...row, ROOM_ID}]);
    assert.equal(result.records[0].externalRoomReference, null);
    assert.deepEqual(result.issues, [{code, index: 0}]);
    assert.equal(result.records[0].assignment, undefined);
  }
});

test('multiple rooms and duplicate projections remain separate rows in original order', () => {
  const rows = [{...row, CARDEX_ID: 91}, {...row, ROOM_ID: '0028', CARDEX_ID: 92},
    {...row, CARDEX_ID: 93}, {...row, CARDEX_ID: 91}];
  const result = observe(rows);
  assert.equal(result.rowCount, 4);
  assert.deepEqual(result.records, [
    {index: 0, externalBookingId: '7001', externalRoomReference: '0027'},
    {index: 1, externalBookingId: '7001', externalRoomReference: '0028'},
    {index: 2, externalBookingId: '7001', externalRoomReference: '0027'},
    {index: 3, externalBookingId: '7001', externalRoomReference: '0027'}
  ]);
  assert.equal(result.reservations, undefined);
  assert.equal(result.participants, undefined);
});

test('empty or missing later rows never mutate earlier observations or infer deletion/cancellation', () => {
  const initial = observe([row, {...row, BOOKING_ID: 7002}]);
  const before = structuredClone(initial);
  const next = observe([row]);
  const empty = observe([]);
  assert.deepEqual(initial, before);
  assert.equal(next.rowCount, 1);
  assert.equal(empty.rowCount, 0);
  assert.deepEqual(empty.records, []);
  assert.equal(empty.status, 'recorded');
  for (const result of [initial, next, empty]) {
    assert.equal(result.completeness, 'unknown');
    assert.equal(result.importable, false);
    assert.equal(result.operationalUse, false);
    for (const forbidden of ['cancelled', 'checked_out', 'no_show', 'deleted', 'occupancy',
      'uniqueBookings', 'uniquePeople', 'arrival_date', 'departure_date']) {
      assert.equal(result[forbidden], undefined);
      for (const record of result.records) assert.equal(record[forbidden], undefined);
    }
  }
});

test('malformed rows preserve positions, while invalid containers and oversize lists reject wholly', () => {
  const rows = [null, 'PRIVATE_VALUE', 3, [], true, row, new Date('2026-01-01')];
  const result = observe(rows);
  assert.equal(result.rowCount, 7);
  assert.equal(result.records.length, 7);
  assert.equal(result.records[5].externalBookingId, '7001');
  assert.deepEqual(result.issues.map(i => i.index), [0, 1, 2, 3, 4, 6]);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_VALUE'));
  const sparse = observe(new Array(2));
  assert.equal(sparse.records.length, 2);
  assert.deepEqual(sparse.issues, [{code: 'ROW_INVALID', index: 0}, {code: 'ROW_INVALID', index: 1}]);
  for (const input of [null, {data: [row]}, 'PRIVATE_VALUE', undefined]) {
    const rejected = observe(input);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.rowCount, null);
    assert.deepEqual(rejected.records, []);
    assert.deepEqual(rejected.issues, [{code: 'ROWS_ARRAY_REQUIRED'}]);
  }
  assert.equal(observe(Array(1000).fill(row)).records.length, 1000);
  const overflow = observe(Array(1001).fill(row));
  assert.deepEqual(overflow.records, []);
  assert.deepEqual(overflow.issues, [{code: 'ROW_LIMIT_EXCEEDED'}]);
});

test('unknown keys, contacts, documents, dates and consent do not escape the explicit projection', () => {
  const marker = 'SYNTHETIC_PRIVATE_DO_NOT_COPY';
  const raw = {...row, NAME: marker, EMAIL: marker, PHONE: marker, PASSPORT: marker,
    [marker]: marker, CARDEX_ID: marker, STR_CHECKIN_DATE: marker,
    STR_CHECKOUT_DATE: marker, IF_ADMITE_COMUNICADOS: true, nested: {secret: marker}};
  Object.defineProperty(raw, 'unknownAccessor', {enumerable: true, get() { throw Error(marker); }});
  const result = observe([raw]);
  assert.ok(!JSON.stringify(result).includes(marker));
  assert.deepEqual(result.records, [{index: 0, externalBookingId: '7001', externalRoomReference: '0027'}]);
  assert.deepEqual(result.issues, [{code: 'UNMAPPED_FIELDS_OMITTED', index: 0}]);
  const getter = {};
  Object.defineProperty(getter, 'BOOKING_ID', {get() { throw Error(marker); }});
  assert.equal(observe([getter]).records[0].externalBookingId, null);
});

test('context validates operation/calendar/offset and rejects unknown data without leaking it', () => {
  for (const patch of [
    {provider: 'other'}, {externalHotelId: ''}, {externalHotelId: ' hotel '},
    {externalHotelId: 'PRIVATE@example.invalid'}, {operation: 'cancelled'},
    {date: undefined}, {date: '2026-02-30'}, {date: '2026-2-01'}, {date: '2026-10-20T00:00:00Z'},
    {operation: 'inhouse'}, {observedAt: '2026-10-20T16:00:00'}, {observedAt: '2026-02-30T16:00:00Z'},
    {secret: 'PRIVATE_VALUE'}
  ]) {
    const result = observe([row], patch);
    assert.equal(result.status, 'rejected');
    assert.equal(result.context, null);
    assert.deepEqual(result.issues, [{code: 'CONTEXT_INVALID'}]);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
  assert.equal(observe([row], {date: '2028-02-29'}).status, 'recorded');
  assert.equal(observeUbikosList(undefined, []).status, 'rejected');
});

test('explicit hotel and operation contexts remain separate with coincident IDs', () => {
  const results = [];
  for (const externalHotelId of ['fictional-hotel-A', 'fictional-hotel-B']) {
    for (const operation of ['checkin', 'checkout', 'inhouse']) {
      const result = observe([row], {externalHotelId, operation,
        date: operation === 'inhouse' ? undefined : context.date});
      assert.equal(result.status, 'recorded');
      assert.equal(result.context.externalHotelId, externalHotelId);
      assert.equal(result.context.operation, operation);
      assert.equal(result.context.date, operation === 'inhouse' ? undefined : context.date);
      assert.deepEqual(result.records[0], {index: 0, externalBookingId: '7001', externalRoomReference: '0027'});
      results.push(result);
    }
  }
  assert.equal(new Set(results.map(r => JSON.stringify(r.context))).size, 6);
  const source = [{...row}];
  const result = observe(source);
  source[0].ROOM_ID = 'changed';
  assert.equal(result.records[0].externalRoomReference, '0027');
  assert.equal(result.context.observedAt, context.observedAt);
});

after(() => assert.equal(networkCalls, 0));
