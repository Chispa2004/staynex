import assert from 'node:assert/strict';

// Only for existing gate unit tests. Real concurrency/fencing is tested against
// PostgreSQL in test-automation-dispatch-postgres.js, never by this fake.
export const automationGateRpc = db => async (name, args) => {
  const row = db.scheduled_messages.find(r => r.id === args.p_message_id && r.hotel_id === args.p_hotel_id);
  if (name === 'automation_dispatch_claim') {
    return { data: row && ['scheduled', 'retry'].includes(row.status)
      ? { message: structuredClone(row), attempt_id: 'gate-unit-attempt' } : null, error: null };
  }
  if (name === 'automation_dispatch_block') {
    assert.equal(args.p_attempt_id, 'gate-unit-attempt');
    Object.assign(row, args.p_updates);
    return { data: row, error: null };
  }
  throw new Error(`Gate unit test unexpectedly reached provider boundary: ${name}`);
};
