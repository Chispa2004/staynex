// Existing pilot contract: these values mean external setup is pending, never connected.
export const WHATSAPP_DEPENDENCIES = Object.freeze({
  pending_staynex: 'Pendiente de actuación de Staynex',
  pending_twilio: 'Pendiente de actuación del proveedor WhatsApp (Twilio)',
  waiting_external: 'Pendiente de coordinación externa'
});

export const getWhatsappDependency = (hotel = {}) => {
  const value = String(hotel.whatsapp_setup_status || hotel.metadata?.whatsapp_setup_status || '').trim().toLowerCase();
  return Object.hasOwn(WHATSAPP_DEPENDENCIES, value) ? value : null;
};

export const validateWhatsappDependency = (body = {}) => {
  const allowed = ['action', 'hotelId', 'hotel_id', 'whatsapp_setup_status'];
  if (Object.keys(body).some(key => !allowed.includes(key))
      || typeof body.whatsapp_setup_status !== 'string'
      || !Object.hasOwn(WHATSAPP_DEPENDENCIES, body.whatsapp_setup_status)) {
    throw Object.assign(new Error('Selecciona la actuación externa pendiente. Esta acción no configura una conexión.'), {
      status: 422, fields: { whatsapp_setup_status: 'Selecciona la actuación externa pendiente.' }
    });
  }
  return body.whatsapp_setup_status;
};

export const saveWhatsappDependency = async ({supabase, hotel, body}) => {
  const status = validateWhatsappDependency(body);
  if (hotel.whatsapp_number || hotel.whatsapp_setup_status) {
    throw Object.assign(new Error('Este hotel ya tiene una configuración de WhatsApp. Pide a Staynex que la revise antes de registrar una dependencia.'), {status:409});
  }
  const metadata = hotel.metadata ?? {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw Object.assign(new Error('No se pudo confirmar la configuración del hotel. Pide ayuda a Staynex.'), {status:409});
  }
  // Compare-and-set: never overwrite concurrent changes to privileged metadata or a new number.
  let query = supabase.from('hotels').update({metadata:{...metadata,whatsapp_setup_status:status}}).eq('id',hotel.id);
  query = hotel.metadata == null ? query.is('metadata',null) : query.eq('metadata',JSON.stringify(metadata));
  query = hotel.whatsapp_number == null ? query.is('whatsapp_number',null) : query.eq('whatsapp_number',hotel.whatsapp_number);
  const {data,error} = await query.select('*').maybeSingle();
  if (error) throw Object.assign(new Error('No se pudo guardar la dependencia. Reintenta.'), {status:503});
  if (!data) throw Object.assign(new Error('La configuración cambió durante el guardado. Recarga para revisarla antes de reintentar.'), {status:409});
  if (data.id !== hotel.id || getWhatsappDependency(data) !== status) {
    throw Object.assign(new Error('No se pudo confirmar la dependencia guardada. Reintenta.'), {status:503});
  }
  return data;
};
