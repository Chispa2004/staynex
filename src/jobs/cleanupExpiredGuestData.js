import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { getSupabase } from '../services/supabase.service.js';
import { logger } from '../utils/logger.js';

const JOB_NAME = 'cleanupExpiredGuestData';
export const ANONYMIZED_MESSAGE = '[Message anonymized by Staynex GDPR retention]';
// Mixed operational/profiling purposes: no new retention rule is inferred.
export const RETENTION_POLICY_PENDING = ['guest_intelligence_profiles', 'guest_interest_affinities',
  'guest_behavior_signals', 'guest_sentiment_history', 'guest_revenue_predictions', 'revenue_ai_events',
  'guest_ai_profiles', 'guest_ai_tags', 'guest_ai_insights', 'guest_ai_actions',
  'conversation_ai_state', 'guests additional identity fields', 'external provider/debug logs'];
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 1 ? Math.floor(Number(value)) : fallback;
const before = (now, days) => new Date(now.getTime() - days * 86400000).toISOString();
const failure = (stage, error) => ({ stage, code: /^[A-Z0-9_]+$/i.test(error?.code || '') ? error.code : 'RETENTION_FAILED' });
const checked = async (query, stage) => {
  const result = await query;
  if (result.error || !Array.isArray(result.data)) throw Object.assign(new Error(stage), { stage, code: result.error?.code });
  return result.data;
};

// Continue until an empty page, including when the server cap is smaller than
// batchSize. Immutable IDs avoid offset skips when eligibility changes on write.
async function* pages(makeQuery, batchSize, stage) {
  let after = null;
  for (;;) {
    let query = makeQuery().order('id', { ascending: true }).limit(batchSize);
    if (after) query = query.gt('id', after);
    const rows = await checked(query, stage);
    if (!rows.length) return;
    const last = rows.at(-1).id;
    if (!last || (after && last <= after)) throw Object.assign(new Error('Cursor did not advance'), { stage });
    yield rows;
    after = last;
  }
}

const anonymizeHotel = async ({ supabase, hotel, dryRun, now, batchSize, summary }) => {
  const hotelId = hotel.id;
  const checkoutCutoff = before(now, positive(hotel.anonymize_after_checkout_days || hotel.guest_data_retention_days, 30)).slice(0, 10);
  const messageCutoff = before(now, positive(hotel.delete_message_body_after_days, 90));
  Object.assign(summary, { checkoutCutoff, messageCutoff });
  const read = (table, fields = '*') => supabase.from(table).select(fields).eq('hotel_id', hotelId);
  const stamp = row => ({ anonymized: true,
    anonymized_at: row.metadata?.retention_job === JOB_NAME && row.metadata?.retention_version === 2
      ? row.metadata.anonymized_at : now.toISOString(), retention_job: JOB_NAME, retention_version: 2 });
  const change = async (table, row, values, counter, updatedAt = false) => {
    if (Object.entries(values).every(([key, value]) => isDeepStrictEqual(row[key], value))) return;
    summary.planned[counter]++;
    if (dryRun) return;
    const patch = updatedAt ? { ...values, updated_at: now.toISOString() } : values;
    const rows = await checked(supabase.from(table).update(patch).eq('hotel_id', hotelId).eq('id', row.id).select('id'), table);
    if (rows.length !== 1 || rows[0].id !== row.id) throw Object.assign(new Error('Write not confirmed'), { stage: table });
    summary.changed[counter]++;
  };
  const sweep = async (table, query, patch, counter, updatedAt = false) => {
    for await (const rows of pages(query, batchSize, table)) {
      summary.batches++;
      for (const row of rows) await change(table, row, patch(row), counter, updatedAt);
    }
  };
  // Inspect every stay before guest-wide retention; unknown checkout or any
  // later stay protects the guest even when it appears on a later page.
  const eligible = new Set(), protectedGuests = new Set();
  for await (const rows of pages(() => read('reservations', 'id,guest_id,departure_date'), batchSize, 'eligibility')) {
    summary.batches++;
    for (const row of rows) {
      summary.reservationsScanned++;
      if (!row.guest_id) continue;
      if (row.departure_date && row.departure_date < checkoutCutoff) eligible.add(row.guest_id);
      else protectedGuests.add(row.guest_id);
    }
  }
  for (const guestId of protectedGuests) eligible.delete(guestId);
  summary.guestsEligible = eligible.size;
  summary.guestsProtected = protectedGuests.size;
  await sweep('reservations', () => read('reservations', 'id,guest_name,guest_email,guest_phone,notes').lt('departure_date', checkoutCutoff), () => ({
    guest_name: 'Guest anonymized', guest_email: null, guest_phone: null, notes: null
  }), 'reservations', true);

  for (const guestId of eligible) {
    // Recheck before the sweep, not a DB lock. Concurrent stay/identity writers
    // still require a safe execution window; see the release procedure.
    let stillEligible = true;
    for await (const rows of pages(() => read('reservations', 'id,departure_date').eq('guest_id', guestId), batchSize, 'eligibility_recheck')) {
      if (rows.some(row => !row.departure_date || row.departure_date >= checkoutCutoff)) stillEligible = false;
    }
    if (!stillEligible) { summary.guestsProtected++; summary.guestsEligible--; continue; }
    await sweep('guest_memory', () => read('guest_memory', 'id,memory_type,memory_key,memory_value,confidence,source,source_message_id,reservation_id,is_active,metadata').eq('guest_id', guestId), row => ({
      memory_type: 'anonymized', memory_key: `anonymized:${row.id}`, memory_value: '[anonymized]',
      confidence: null, source: 'retention', source_message_id: null, reservation_id: null,
      is_active: false, metadata: stamp(row)
    }), 'guestMemory', true);
    // Same eligible logs: erase copied memory labels and personal summaries,
    // preserving IDs, operational links, metrics and ticket/send outcomes.
    await sweep('ai_logs', () => read('ai_logs', 'id,raw_guest_message,generated_response,memory_keys_used,memory_used,ai_summary,ai_reasoning,human_reason')
      .eq('guest_id', guestId), () => ({ raw_guest_message: null, generated_response: null,
      memory_keys_used: [], memory_used: false, ai_summary: null, ai_reasoning: null, human_reason: null
    }), 'aiLogs');
    await sweep('guests', () => read('guests', 'id,phone_number,current_room').eq('id', guestId), () => ({
      phone_number: `anon-${createHash('sha256').update(`${hotelId}:${guestId}`).digest('hex').slice(0, 24)}`,
      current_room: null
    }), 'guests');
    await sweep('experience_booking_requests', () => read('experience_booking_requests', 'id,guest_name,room_number,notes,metadata').eq('guest_id', guestId)
      .in('status', ['completed', 'cancelled', 'rejected']), row => ({
      guest_name: 'Guest anonymized', room_number: null, notes: null, metadata: stamp(row)
    }), 'experienceBookings', true);
    for await (const rows of pages(() => read('conversations', 'id').eq('guest_id', guestId), batchSize, 'conversations')) {
      summary.conversationsScanned += rows.length;
      for (const conversation of rows) {
        await sweep('messages', () => read('messages', 'id,content,translated_text,metadata').eq('conversation_id', conversation.id).lt('created_at', messageCutoff), row => ({
          content: ANONYMIZED_MESSAGE, translated_text: null, metadata: stamp(row)
        }), 'messages');
      }
    }
  }
};

const counts = () => ({ guests: 0, reservations: 0, messages: 0, guestMemory: 0, experienceBookings: 0, aiLogs: 0 });
export const cleanupExpiredGuestData = async ({ hotelId = null, dryRun = false, limit = 500,
  now = new Date(), supabase = getSupabase() } = {}) => {
  const results = [], errors = [];
  const batchSize = Math.min(positive(limit, 500), 500);
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid retention date');
  try {
    for await (const hotels of pages(() => {
      const query = supabase.from('hotels').select('*');
      return hotelId ? query.eq('id', hotelId) : query;
    }, batchSize, 'hotels')) {
      for (const hotel of hotels) {
        const summary = { hotelId: hotel.id, dryRun, status: 'running', batches: 0,
          reservationsScanned: 0, conversationsScanned: 0, planned: counts(), changed: counts(), errors: [] };
        try { await anonymizeHotel({ supabase, hotel, dryRun, now, batchSize, summary }); }
        catch (error) { summary.errors.push(failure(error.stage || 'hotel_cleanup', error)); }
        if (!dryRun) {
          // A failed audit is not success. Never copy raw DB errors/guest content.
          try {
            const { error } = await supabase.from('data_retention_audit_logs').insert({
              hotel_id: hotel.id, job_name: JOB_NAME, run_at: now.toISOString(),
              records_scanned: summary.reservationsScanned + summary.conversationsScanned,
              records_anonymized: Object.values(summary.changed).reduce((a, b) => a + b, 0), records_deleted: 0,
              status: summary.errors.length ? 'partial' : 'data_complete',
              error: summary.errors.length ? 'Retention incomplete; inspect stage/code' : null,
              metadata: { scope: 'existing_retention_rules', ...summary, status: summary.errors.length ? 'partial' : 'data_complete' }
            });
            if (error) throw error;
          } catch (error) { summary.errors.push(failure('audit', error)); }
          if (!summary.errors.length) {
            try {
              const rows = await checked(supabase.from('hotels').update({ last_data_retention_cleanup_at: now.toISOString() })
                .eq('id', hotel.id).select('id'), 'completion_marker');
              if (rows.length !== 1) throw new Error('Completion not confirmed');
            } catch (error) { summary.errors.push(failure('completion_marker', error)); }
          }
        }
        summary.status = summary.errors.length ? 'partial' : dryRun ? 'preview_complete' : 'complete';
        logger[summary.errors.length ? 'error' : 'info']('retention_scope_result', summary);
        results.push(summary);
      }
    }
  } catch (error) { errors.push(failure(error.stage || 'hotels', error)); }
  if (hotelId && !results.length && !errors.length) errors.push({ stage: 'hotels', code: 'HOTEL_NOT_FOUND' });
  const complete = !errors.length && results.every(result => !result.errors.length);
  return { jobName: JOB_NAME, scope: 'existing_retention_rules', dryRun, complete,
    status: complete ? (dryRun ? 'preview_complete' : 'complete') : 'partial',
    policyPending: RETENTION_POLICY_PENDING, hotelsProcessed: results.length, results, errors };
};
