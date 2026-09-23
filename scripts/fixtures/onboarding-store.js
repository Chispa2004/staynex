// Disposable synthetic transport shared by behavior tests and the local UI lab.
export const createOnboardingStore = () => {
  const hotel = { id: 'hotel-onboarding-a', name: 'Hotel de prueba A', country_code: 'ES', city: 'Madrid',
    timezone: 'Europe/Madrid', timezone_integrity_status: 'verified', ai_auto_reply_enabled: false, metadata: {} };
  const tables = { hotels: [hotel, { ...hotel, id: 'hotel-onboarding-b', name: 'Hotel de prueba B' }],
    hotel_users: [{ id: 'assignment-a', hotel_id: hotel.id, email: 'admin-a@example.invalid', role: 'admin', status: 'invited' },
      { id: 'assignment-b', hotel_id: 'hotel-onboarding-b', email: 'admin-b@example.invalid', role: 'admin', status: 'active' }],
    hotel_onboarding_state: [{ id: 'state-a', hotel_id: hotel.id, current_step: 'users', completed_steps: [], onboarding_completed: false }],
    hotel_knowledge: [], local_knowledge_items: [], hotel_pms_connections: [] };
  const store = { tables, failNextWrite: false, writes: [], role: 'admin', platformRole: 'none', fallback: false };
  store.supabase = { from(table) {
    let filters = [], mode = 'read', patch, single = false, limit = Infinity;
    const query = {
      select() { return query; }, order() { return query; },
      limit(value) { limit = value; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      neq(key, value) { filters.push(row => row[key] !== value); return query; },
      gte(key, value) { filters.push(row => row[key] >= value); return query; },
      lt(key, value) { filters.push(row => row[key] < value); return query; },
      not() { return query; },
      update(value) { mode = 'update'; patch = value; return query; },
      insert(value) { mode = 'insert'; patch = value; return query; },
      upsert(value) { mode = 'upsert'; patch = value; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        if (mode !== 'read' && store.failNextWrite) {
          store.failNextWrite = false;
          return Promise.resolve({ data: null, error: { message: 'No se pudo guardar. Reintenta.', code: 'SYNTHETIC' } }).then(resolve, reject);
        }
        const rows = tables[table] ||= [];
        let selected = rows.filter(row => filters.every(test => test(row)));
        if (mode === 'insert' || mode === 'upsert') {
          let row = mode === 'upsert' ? rows.find(item => item.hotel_id === patch.hotel_id) : null;
          if (!row) { row = { id: `synthetic-${table}-${rows.length}` }; rows.push(row); }
          Object.assign(row, structuredClone(patch)); selected = [row];
        } else if (mode === 'update') selected.forEach(row => Object.assign(row, structuredClone(patch)));
        if (mode !== 'read') store.writes.push({ table, mode, ids: selected.map(row => row.id) });
        const data = structuredClone(selected.slice(0, limit));
        return Promise.resolve({ data: single ? data[0] || null : data, count: selected.length, error: null }).then(resolve, reject);
      }
    }; return query;
  } };
  store.context = async request => {
    const requested = request?.headers?.get('x-staynex-hotel-id');
    if (requested && requested !== hotel.id) throw Object.assign(new Error('Hotel no autorizado'), { status: 403 });
    return { supabase: store.supabase, hotel, role: store.role, platformRole: store.platformRole, fallback: store.fallback,
      user: { id: 'synthetic-admin', email: 'admin-a@example.invalid' },
      hotelUser: { id: 'synthetic-access', hotel_id: hotel.id, role: store.role, status: 'active' },
      availableHotels: [{ hotel, role: store.role }], accessDenied: false };
  };
  return store;
};
