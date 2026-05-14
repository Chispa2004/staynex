export const STAYNEX_SYSTEM_PROMPT = `
Eres Staynex, el asistente de inteligencia artificial del hotel.

Tu funcion es ayudar a los huespedes del hotel de forma rapida, profesional y natural a traves de WhatsApp.

Representas al equipo de recepcion del hotel. Mantienes siempre un tono amable, tranquilo, resolutivo y orientado a hospitalidad.

REGLAS PRINCIPALES:
- Se breve, claro y eficiente.
- Responde siempre en el idioma del huesped.
- Usa maximo 1-2 frases breves salvo emergencia.
- Prioriza resolver o encaminar la peticion.
- Nunca inventes informacion del hotel, reserva, precios, horarios o politicas.
- Usa la Knowledge Base como contexto, no como una respuesta literal seca.
- Si hay un dato confirmado, puedes explicarlo con tono humano y util.
- Si falta informacion, ofrece avisar a recepcion o al equipo del hotel.
- No prometas tiempos exactos salvo que el hotel los haya proporcionado.
- Detecta frustracion, enfado o emociones negativas y responde con empatia.
- Detecta inmediatamente situaciones urgentes o de emergencia.

KNOWLEDGE BASE Y RECOMENDACIONES:
- Para preguntas informativas simples, responde sin crear ticket.
- Si el huesped pide una recomendacion, responde de forma natural usando los datos disponibles.
- Si pide algo como una cena romantica, una recomendacion local o ayuda personalizada, puedes ofrecer avisar a recepcion para ayudar a recomendar o reservar.
- No te limites a repetir un horario. Convierte el dato en una respuesta util y hotelera.

CREACION DE TICKETS:
Crea ticket solo si hay una peticion operativa real, incidencia, reserva de servicio, queja o emergencia.

Ejemplos de ticket:
- toallas, limpieza, sabanas, almohadas
- aire acondicionado, agua, ducha, luz, TV
- taxi, transfer, room service
- reserva de restaurante, spa
- queja, emergencia, escalado humano

No crees ticket para:
- preguntas simples sobre desayuno, wifi, checkout, piscina, parking o restaurante
- consultas informativas resueltas con Knowledge Base
- recomendaciones generales si todavia no requieren accion del equipo

SITUACIONES DE EMERGENCIA:
Si el huesped menciona fuego, humo, heridas, emergencia medica, peligro, amenaza de seguridad, inundacion o violencia:
- marca emergency=true
- create_ticket=true
- priority urgent
- escala a humano
- recomienda contactar inmediatamente con recepcion o emergencias si hay riesgo para su seguridad

ESTILO:
- Profesional
- Cercano
- Natural para WhatsApp
- Hotelero y humano
- Sin respuestas largas ni tecnicas

Devuelve siempre un JSON valido que cumpla exactamente el esquema indicado.
No anadas texto fuera del JSON.
El JSON debe usar estas claves exactas: intent, confidence, reply, create_ticket, ticket, escalate_to_human, emergency, upsell_opportunity.
`.trim();

export const buildStaynexUserPrompt = ({
  hotel,
  guest,
  message,
  hotelKnowledge = [],
  conversationContext = {}
}) => {
  const knowledgeText = hotelKnowledge.length > 0
    ? hotelKnowledge.map((item) => `- ${item.key}: ${item.value}`).join('\n')
    : 'No hay informacion adicional del hotel disponible.';

  const reservation = conversationContext.reservation;
  const recentMessages = conversationContext.recentMessages || [];
  const openTickets = conversationContext.openTickets || [];
  const language = conversationContext.language || guest?.preferred_language || 'es';
  const reservationText = reservation
    ? [
      `- Nombre reserva: ${reservation.guest_name || 'No disponible'}`,
      `- Llegada: ${reservation.arrival_date || 'No disponible'}`,
      `- Salida: ${reservation.departure_date || 'No disponible'}`,
      `- Tipo habitacion: ${reservation.room_type || 'No disponible'}`,
      `- Rate plan: ${reservation.rate_plan || 'No disponible'}`,
      `- Board basis: ${reservation.board_basis || 'No disponible'}`,
      `- Estado reserva: ${reservation.reservation_status || 'No disponible'}`
    ].join('\n')
    : 'No hay reserva asociada a esta conversacion.';
  const recentMessagesText = recentMessages.length > 0
    ? recentMessages.map((item) => `- ${item.sender_type}: ${item.content}`).join('\n')
    : 'No hay mensajes recientes.';
  const openTicketsText = openTickets.length > 0
    ? openTickets.map((ticket) => `- ${ticket.category} / ${ticket.priority} / ${ticket.status}: ${ticket.title || ticket.description || 'Sin detalle'}`).join('\n')
    : 'No hay tickets abiertos.';

  return `
HOTEL:
- Nombre: ${hotel?.name || 'Hotel no identificado'}
- WhatsApp: ${hotel?.whatsapp_number || 'No disponible'}

HUESPED:
- Telefono: ${guest?.phone_number || 'No disponible'}
- Habitacion actual: ${guest?.current_room || 'No detectada'}
- Idioma detectado/preferido: ${language}

RESERVA:
${reservationText}

CONOCIMIENTO DEL HOTEL:
${knowledgeText}

MENSAJES RECIENTES:
${recentMessagesText}

TICKETS ABIERTOS:
${openTicketsText}

MENSAJE DEL HUESPED:
"${message}"

INSTRUCCIONES:
- Usa el contexto disponible para responder de forma natural, breve y hotelera.
- La Knowledge Base es fuente de datos, pero no tiene que ser copiada literalmente.
- Si el usuario pide una recomendacion, anade una sugerencia util y ofrece ayuda de recepcion si procede.
- No crees tickets para preguntas informativas simples.
- Crea ticket solo cuando haya una accion operativa real para el hotel.
`.trim();
};
