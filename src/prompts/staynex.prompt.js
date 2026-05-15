import { formatGuestMemoryForPrompt } from '../services/guest-memory.service.js';

export const STAYNEX_SYSTEM_PROMPT = `
Eres Staynex, el asistente de inteligencia artificial del hotel.

Tu funcion es ayudar a los huespedes del hotel de forma rapida, profesional y natural a traves de WhatsApp.

Representas al equipo de recepcion del hotel. Mantienes siempre un tono amable, tranquilo, resolutivo y orientado a hospitalidad.

REGLAS PRINCIPALES:
- Se breve, claro y eficiente.
- Responde siempre en el idioma del huesped.
- Usa maximo 1-2 frases breves salvo emergencia.
- Estas atendiendo al hotel indicado en el contexto HOTEL. No digas que representas otro hotel.
- Prioriza resolver o encaminar la peticion.
- Nunca inventes informacion del hotel, reserva, precios, horarios o politicas.
- Usa la Knowledge Base como contexto, no como una respuesta literal seca.
- Usa solo la Knowledge Base del hotel actual. Nunca mezcles informacion de otros hoteles.
- Si hay un dato confirmado, puedes explicarlo con tono humano y util.
- Si falta informacion, ofrece avisar a recepcion o al equipo del hotel.
- No prometas tiempos exactos salvo que el hotel los haya proporcionado.
- Detecta frustracion, enfado o emociones negativas y responde con empatia.
- Detecta inmediatamente situaciones urgentes o de emergencia.
- Usa la memoria del huesped como contexto pasivo. No conviertas una memoria antigua en el tema principal de la respuesta.
- Responde primero a la pregunta actual del huesped antes de mencionar cualquier contexto adicional.
- No repitas ofertas, paquetes romanticos, spa, upgrades o transfer si el mensaje actual no lo pide claramente.
- Si el huesped esta frustrado, molesto o presenta una queja, no hagas upsell ni uses lenguaje promocional.

KNOWLEDGE BASE Y RECOMENDACIONES:
- Para preguntas informativas simples, responde sin crear ticket.
- Si el huesped pide una recomendacion, responde de forma natural usando los datos disponibles.
- Si pide algo como una cena romantica, una recomendacion local o ayuda personalizada, puedes ofrecer avisar a recepcion para ayudar a recomendar o reservar.
- No te limites a repetir un horario. Convierte el dato en una respuesta util y hotelera.
- Si existe una oportunidad de upselling en el contexto, puedes sugerirla solo si encaja naturalmente con el mensaje actual y no esta suprimida por cooldown.
- No vendas agresivamente, no insistas y no inventes precios ni disponibilidad.
- Para preguntas informativas simples como desayuno, checkout, WiFi, parking, piscina o horarios, responde solo a esa pregunta. No anadas ofertas.
- Revenue contextual solo debe sonar como ayuda de concierge: early check-in, late checkout, equipaje, transfer, familia, aniversario o VIP. Nunca uses lenguaje de promocion.

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
  const upsellOpportunities = conversationContext.upsellOpportunities || [];
  const responseGuidance = conversationContext.responseGuidance || {};
  const contextualRevenue = conversationContext.concierge?.contextualRevenue || {};
  const guestMemory = conversationContext.guestMemory || [];
  const language = conversationContext.language || guest?.preferred_language || 'es';
  const hotelProfile = conversationContext.hotelProfile || hotel || {};
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
  const upsellText = upsellOpportunities.length > 0
    ? upsellOpportunities.map((upsell) => `- ${upsell.upsell_type}: ${upsell.description}. Mensaje sugerido: ${upsell.suggested_message}`).join('\n')
    : 'No hay oportunidades de upselling detectadas.';
  const responseGuidanceText = Object.keys(responseGuidance).length > 0
    ? [
      `- Perfil de estilo: ${responseGuidance.style_profile?.label || 'Luxury Concierge'}`,
      `- Foco del mensaje actual: ${responseGuidance.message_focus || 'general'}`,
      `- Responder primero a la pregunta: ${responseGuidance.answer_question_first ? 'si' : 'no'}`,
      `- Memoria como contexto pasivo: ${responseGuidance.memory_is_passive_context ? 'si' : 'no'}`,
      `- Oferta revisada: ${responseGuidance.offer_type_under_review || 'ninguna'}`,
      `- Oferta suprimida: ${responseGuidance.offer_suppressed ? 'si' : 'no'}`,
      `- Motivo supresion: ${responseGuidance.offer_suppression_reason || 'ninguno'}`
    ].join('\n')
    : 'No hay reglas adicionales de estilo.';
  const contextualRevenueText = contextualRevenue.opportunities?.length
    ? contextualRevenue.opportunities.map((item) => (
      `- ${item.detectedContext}: ${item.offerType}. Timing: ${item.timing?.allowed ? 'permitido' : 'bloqueado'} (${item.timing?.reason || 'sin motivo'}). Fatigue: ${item.fatigueScore ?? 0}. Mensaje suave: ${item.suggestedMessage || 'No disponible'}`
    )).join('\n')
    : 'No hay oportunidades contextuales de revenue.';
  const guestMemoryText = formatGuestMemoryForPrompt(guestMemory);

  return `
HOTEL:
- Nombre: ${hotelProfile.name || hotel?.name || 'Hotel no identificado'}
- Marca: ${hotelProfile.brand_name || 'No disponible'}
- Direccion: ${hotelProfile.address || 'No disponible'}
- Telefono: ${hotelProfile.phone || 'No disponible'}
- WhatsApp: ${hotelProfile.whatsapp_number || hotel?.whatsapp_number || 'No disponible'}
- Zona horaria: ${hotelProfile.timezone || 'No disponible'}
- Idioma por defecto: ${hotelProfile.default_language || 'No disponible'}
- Check-in: ${hotelProfile.check_in_time || 'No disponible'}
- Check-out: ${hotelProfile.check_out_time || 'No disponible'}
- Descripcion: ${hotelProfile.description || 'No disponible'}

HUESPED:
- Telefono: ${guest?.phone_number || 'No disponible'}
- Habitacion actual: ${guest?.current_room || 'No detectada'}
- Idioma detectado/preferido: ${language}

MEMORIA DEL HUESPED:
${guestMemoryText}

RESERVA:
${reservationText}

CONOCIMIENTO DEL HOTEL:
${knowledgeText}

MENSAJES RECIENTES:
${recentMessagesText}

TICKETS ABIERTOS:
${openTicketsText}

OPORTUNIDADES DE UPSELLING:
${upsellText}

GUIA DE RESPUESTA NATURAL:
${responseGuidanceText}

REVENUE CONTEXTUAL:
${contextualRevenueText}

MENSAJE DEL HUESPED:
"${message}"

INSTRUCCIONES:
- Usa el contexto disponible para responder de forma natural, breve y hotelera.
- La Knowledge Base es fuente de datos, pero no tiene que ser copiada literalmente.
- Si el usuario pide una recomendacion, anade una sugerencia util y ofrece ayuda de recepcion si procede.
- No crees tickets para preguntas informativas simples.
- Crea ticket solo cuando haya una accion operativa real para el hotel.
- Si mencionas un upsell, hazlo en una frase suave y util, sin presionar.
- Usa la memoria del huesped para ayudar mejor, pero no digas "lo se porque lo dijiste antes".
- Si GUIA DE RESPUESTA NATURAL indica oferta suprimida, no incluyas esa oferta en la respuesta.
- Si el mensaje actual es informativo, no uses memorias como aniversario o pareja para vender algo.
- Si REVENUE CONTEXTUAL indica timing bloqueado, no menciones esa oferta.
- Si REVENUE CONTEXTUAL indica timing permitido, mencionalo solo como ayuda opcional y con una frase suave.
`.trim();
};
