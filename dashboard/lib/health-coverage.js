export const HEALTH_SOURCES = ['pms', 'tickets', 'conversations', 'conversation_ai_state',
  'experience_booking_requests', 'scheduled_messages', 'hotel_rooms', 'reservations', 'ai_logs'];

export const HEALTH_SOURCE_LABELS = {
  pms: 'PMS', tickets: 'Tickets', conversations: 'Conversaciones', conversation_ai_state: 'Estado de conversaciones',
  experience_booking_requests: 'Solicitudes a proveedores', scheduled_messages: 'Mensajes programados',
  hotel_rooms: 'Habitaciones', reservations: 'Reservas vigentes', ai_logs: 'Actividad IA de hoy'
};

const dependencies = {
  pms: ['pms'], whatsapp: [], ai: ['ai_logs', 'conversations'], tickets: ['tickets'],
  provider_bookings: ['experience_booking_requests'], automations: ['scheduled_messages'],
  conversations: ['conversations', 'conversation_ai_state'], qr_rooms: ['hotel_rooms'],
  reception: ['reservations'], folio: ['scheduled_messages']
};

export const buildHealthCoverage = (sources = {}, issues = []) => {
  const normalized = Object.fromEntries(HEALTH_SOURCES.map((key) => {
    const source = sources[key];
    const issue = issues.find((item) => item.label === key);
    const status = issue ? 'unavailable' : source?.status || 'partial';
    return [key, { ...source, status, label: HEALTH_SOURCE_LABELS[key] }];
  }));
  const values = Object.values(normalized);
  const status = values.every((source) => source.status === 'unavailable') ? 'unavailable'
    : values.every((source) => source.status === 'complete') && !issues.length ? 'complete' : 'partial';
  return { status, sources: normalized };
};

export const applyHealthCoverage = (card, coverage) => {
  const sources = (dependencies[card.id] || []).map((key) => coverage.sources[key]);
  if (sources.some((source) => source.status === 'unavailable')) {
    return { ...card, status: 'unavailable', value: null, coverage: 'unavailable',
      description: 'Fuente no disponible. No se puede confirmar este estado.' };
  }
  if (sources.some((source) => source.status !== 'complete')) {
    return { ...card, status: card.status === 'critical' ? 'critical' : 'partial', coverage: 'partial',
      description: 'Información parcial. Los valores corresponden solo a la muestra disponible.' };
  }
  return { ...card, coverage: 'complete' };
};
