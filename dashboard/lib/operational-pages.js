// Server-only complete scan. Never return the full inventory to the browser.
export async function readOperationalPages(supabase, table, columns, hotelId, configure = q => q) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const {data,error} = await configure(supabase.from(table).select(columns).eq('hotel_id',hotelId)).order('id',{ascending:true}).range(offset,offset+499);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Lectura operativa incompleta.');
    if (data.some(row => row.hotel_id && row.hotel_id !== hotelId)) throw Object.assign(new Error('Acceso al hotel denegado.'),{status:403});
    rows.push(...data);
    if (data.length < 500) {
      if (new Set(rows.map(row=>row.id)).size !== rows.length) throw new Error('Los registros cambiaron durante la lectura. Actualiza para reintentar.');
      return rows;
    }
  }
}
