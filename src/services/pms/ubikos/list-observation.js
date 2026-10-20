import {z} from 'zod';
import {isUbikosListDay, ubikosListOperations} from './list-contract.js';

// Offline-only observation, deliberately NOT a read-snapshot or operational
// context. No client, store, provider SDK, prompt, scheduler or environment imports.
// Same explicit-offset instant validation as the internal PMS contract, without
// treating the requested day as an individual arrival/departure date.
const contextSchema = z.object({
  provider: z.literal('ubikos'),
  externalHotelId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  operation: z.enum(ubikosListOperations),
  date: z.string().refine(isUbikosListDay).optional(),
  observedAt: z.string().datetime({offset: true}).refine(value =>
    isUbikosListDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value)))
}).strict().refine(value => value.operation === 'inhouse'
  ? value.date === undefined : value.date !== undefined);

const plainObject = value => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const ownValue = (row, name) => {
  const property = Object.getOwnPropertyDescriptor(row, name);
  // Do not execute getters. Only JSON-like own data properties are eligible.
  return property && Object.hasOwn(property, 'value') ? property.value : undefined;
};

/**
 * Returns only explicit context, row positions and the two recognized references.
 * Invalid rows keep their positions with null references and safe issue codes.
 * Null means unknown/invalid, never a provider-confirmed unassignment.
 * Identical rows are retained; no reservation/participant grouping or lifecycle
 * inference is made. References are scoped by the enclosing context, not global.
 */
export function observeUbikosList(context, rows) {
  const result = {
    kind: 'partial_observation',
    schemaVersion: 1,
    status: 'rejected',
    completeness: 'unknown',
    importable: false,
    operationalUse: false,
    context: null,
    rowCount: null,
    records: [],
    issues: []
  };
  const parsed = contextSchema.safeParse(context);
  if (!parsed.success) {
    result.issues.push({code: 'CONTEXT_INVALID'});
    return result; // Never return Zod messages, paths or supplied values.
  }
  result.context = parsed.data;
  if (!Array.isArray(rows)) {
    result.issues.push({code: 'ROWS_ARRAY_REQUIRED'});
    return result;
  }
  // Same local inspection bound as the list client. No truncated partial success.
  if (rows.length > 1000) {
    result.issues.push({code: 'ROW_LIMIT_EXCEEDED'});
    return result;
  }
  result.rowCount = rows.length;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const record = {index, externalBookingId: null, externalRoomReference: null};
    result.records.push(record);
    const issue = code => result.issues.push({code, index});
    if (!plainObject(row)) {
      issue('ROW_INVALID');
      continue;
    }
    const booking = ownValue(row, 'BOOKING_ID');
    if (typeof booking !== 'number' || !Number.isSafeInteger(booking)) {
      issue(booking === undefined ? 'BOOKING_ID_MISSING' : 'BOOKING_ID_INVALID');
    } else {
      record.externalBookingId = String(booking);
    }
    const room = ownValue(row, 'ROOM_ID');
    if (room === undefined) issue('ROOM_REFERENCE_MISSING');
    else if (typeof room !== 'string') issue('ROOM_REFERENCE_INVALID');
    else if (!room.trim()) issue('ROOM_REFERENCE_EMPTY');
    // Local size/control bound, not a claim about Ubikos's room identifier format.
    else if (room.length > 200 || /[\u0000-\u001f\u007f]/.test(room)) issue('ROOM_REFERENCE_INVALID');
    else record.externalRoomReference = room; // Preserve zeros and spaces exactly.
    if (Object.keys(row).some(name => name !== 'BOOKING_ID' && name !== 'ROOM_ID')) {
      issue('UNMAPPED_FIELDS_OMITTED'); // Never copy unknown/dynamic field names.
    }
  }
  result.status = result.issues.length ? 'recorded_with_issues' : 'recorded';
  return result;
}
