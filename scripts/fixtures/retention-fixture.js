// Synthetic data only. No clients, environment credentials or remote access.
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const NOW = new Date('2026-09-23T12:00:00Z');
export const fixture = (volume = 7) => {
  const hotel = n => ({ id: id(n), guest_data_retention_days: 30, anonymize_after_checkout_days: 30,
    delete_message_body_after_days: 90, last_data_retention_cleanup_at: null });
  const guest = (n, h) => ({ id: id(n), hotel_id: id(h), phone_number: `synthetic-${n}`, current_room: '101' });
  const reservation = (n, h, g, departure) => ({ id: id(n), hotel_id: id(h), guest_id: id(g), departure_date: departure,
    guest_name: 'Synthetic guest', guest_email: 'synthetic@example.invalid', guest_phone: 'synthetic', notes: 'gluten', updated_at: null });
  const memory = (n, h = 1, g = 11) => ({ id: id(n), hotel_id: id(h), guest_id: id(g), memory_type: 'dietary',
    memory_key: n === 100 ? 'dietary_gluten_allergy' : `dietary_gluten_allergy_${n}`, memory_value: 'gluten allergy', confidence: 0.94,
    source: 'conversation', source_message_id: id(50), reservation_id: id(30), is_active: true,
    metadata: { detected_from: 'Soy celiaco' }, updated_at: null });
  return {
    hotels: [hotel(1), hotel(2)], guests: [guest(11, 1), guest(12, 1), guest(13, 1), guest(21, 2)],
    reservations: [reservation(30, 1, 11, '2026-01-01'), reservation(31, 1, 12, '2026-01-01'),
      reservation(32, 1, 13, null), reservation(33, 2, 21, '2026-01-01'), reservation(9999, 1, 12, '2026-09-20')],
    conversations: [{ id: id(40), hotel_id: id(1), guest_id: id(11) }],
    messages: [{ id: id(50), hotel_id: id(1), conversation_id: id(40), content: 'Soy celiaco', translated_text: 'gluten allergy',
      metadata: { original: 'gluten' }, created_at: '2026-01-01T00:00:00.000Z' },
    { id: id(51), hotel_id: id(1), conversation_id: id(40), content: 'Recent operational question', translated_text: null,
      metadata: {}, created_at: '2026-09-22T00:00:00.000Z' }],
    guest_memory: [...Array.from({ length: volume }, (_, i) => memory(100 + i)), memory(8000, 1, 12), memory(8001, 1, 13), memory(8002, 2, 21)],
    ai_logs: [{ id: id(60), hotel_id: id(1), guest_id: id(11), raw_guest_message: 'celiaco', generated_response: 'gluten',
      memory_keys_used: ['dietary_gluten_allergy'], memory_used: true, ai_summary: 'gluten', ai_reasoning: 'gluten', human_reason: 'gluten',
      ticket_id: id(70), delivery_status: 'delivered' }],
    experience_booking_requests: ['completed', 'pending'].map((status, i) => ({ id: id(80 + i), hotel_id: id(1), guest_id: id(11),
      guest_name: 'Synthetic guest', room_number: '101', notes: 'gluten', metadata: { gluten: true }, status, updated_at: null })),
    data_retention_audit_logs: [],
    guest_intelligence_profiles: [{ id: id(90), hotel_id: id(1), guest_id: id(11), metadata: { detected_from: 'celiaco' } }],
    tickets: [{ id: id(70), hotel_id: id(1), guest_id: id(11), description: 'Operational task' }]
  };
};

export const memoryDb = (data = fixture(), { cap = Infinity, fail = () => false } = {}) => {
  const calls = [];
  const from = table => {
    const state = { table, action: 'select', filters: [], limit: Infinity, order: null };
    const query = {
      select(fields = '*') { state.fields = fields; return query; },
      update(values) { state.action = 'update'; state.values = values; return query; },
      insert(values) { state.action = 'insert'; state.values = values; return query; },
      eq(key, value) { state.filters.push(row => row[key] === value); return query; },
      in(key, values) { state.filters.push(row => values.includes(row[key])); return query; },
      lt(key, value) { state.filters.push(row => row[key] != null && row[key] < value); return query; },
      gt(key, value) { state.filters.push(row => row[key] != null && row[key] > value); return query; },
      order(key) { state.order = key; return query; },
      limit(value) { state.limit = value; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          calls.push({ table, action: state.action });
          if (fail(state, calls)) return { data: null, error: { code: 'SYNTHETIC_FAILURE', message: 'PRIVATE CONTENT MUST NOT LEAK' } };
          if (!data[table]) return { data: null, error: { code: '42P01' } };
          if (state.action === 'insert') { data[table].push(structuredClone(state.values)); return { data: [], error: null }; }
          let rows = data[table].filter(row => state.filters.every(filter => filter(row)));
          if (state.order) rows.sort((a, b) => String(a[state.order]).localeCompare(String(b[state.order])));
          if (state.action === 'select') rows = rows.slice(0, Math.min(state.limit, cap));
          if (state.action === 'update') rows.forEach(row => Object.assign(row, structuredClone(state.values)));
          return { data: structuredClone(rows), error: null, count: rows.length };
        }).then(resolve, reject);
      }
    };
    return query;
  };
  return { from, data, calls };
};
