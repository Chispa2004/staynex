import { validateAiResponse } from '../schemas/ai-response.schema.js';
import { detectGuestLanguage, normalizeLanguage } from './language.service.js';
import { logger } from '../utils/logger.js';

const normalize = (value) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const buildTicket = ({ category, title, description, priority = 'normal' }) => ({
  category,
  title,
  description,
  priority
});

const noTicket = () => ({
  category: null,
  title: null,
  description: null,
  priority: null
});

export const extractRoomNumberFromMessage = (message) => {
  const explicitMatch = message.match(/\b(?:habitaci[oó]n|hab\.?|room|cuarto|chambre|zimmer)\s*(\d{1,5})\b/i);

  if (explicitMatch?.[1]) {
    return explicitMatch[1];
  }

  const standaloneMatch = message.match(/\b\d{3,5}\b/);

  return standaloneMatch?.[0] || null;
};

const roomText = (roomNumber, language, mode = 'in') => {
  const room = roomNumber || null;

  const text = {
    es: {
      in: room ? `en la habitación ${room}` : 'en tu habitación',
      to: room ? `a la habitación ${room}` : 'a tu habitación',
      from: room ? `desde la habitación ${room}` : 'desde tu habitación'
    },
    en: {
      in: room ? `in room ${room}` : 'in your room',
      to: room ? `to room ${room}` : 'to your room',
      from: room ? `from room ${room}` : 'from your room'
    },
    fr: {
      in: room ? `dans la chambre ${room}` : 'dans votre chambre',
      to: room ? `à la chambre ${room}` : 'à votre chambre',
      from: room ? `depuis la chambre ${room}` : 'depuis votre chambre'
    },
    de: {
      in: room ? `in Zimmer ${room}` : 'in Ihrem Zimmer',
      to: room ? `auf Zimmer ${room}` : 'auf Ihr Zimmer',
      from: room ? `von Zimmer ${room}` : 'von Ihrem Zimmer'
    }
  };

  return text[language]?.[mode] || text.es[mode];
};

const titleText = (key, language) => {
  const titles = {
    towels: {
      es: 'Solicitud de toallas',
      en: 'Towel request',
      fr: 'Demande de serviettes',
      de: 'Handtuchanfrage'
    },
    bedding: {
      es: 'Solicitud de ropa de cama',
      en: 'Bedding request',
      fr: 'Demande de linge de lit',
      de: 'Bettwäscheanfrage'
    },
    cleaning: {
      es: 'Solicitud de limpieza',
      en: 'Cleaning request',
      fr: 'Demande de ménage',
      de: 'Reinigungsanfrage'
    },
    ac: {
      es: 'Incidencia aire acondicionado',
      en: 'Air conditioning issue',
      fr: 'Incident climatisation',
      de: 'Problem mit der Klimaanlage'
    },
    maintenance: {
      es: 'Incidencia de mantenimiento',
      en: 'Maintenance issue',
      fr: 'Incident maintenance',
      de: 'Wartungsproblem'
    },
    taxi: {
      es: 'Solicitud de taxi',
      en: 'Taxi request',
      fr: 'Demande de taxi',
      de: 'Taxianfrage'
    },
    restaurant: {
      es: 'Reserva restaurante',
      en: 'Restaurant booking',
      fr: 'Réservation restaurant',
      de: 'Restaurantreservierung'
    },
    complaint: {
      es: 'Queja de huésped',
      en: 'Guest complaint',
      fr: 'Réclamation client',
      de: 'Gästebeschwerde'
    },
    emergency: {
      es: 'Emergencia',
      en: 'Emergency',
      fr: 'Urgence',
      de: 'Notfall'
    },
    reception: {
      es: 'Solicitud del huésped',
      en: 'Guest request',
      fr: 'Demande client',
      de: 'Gästeanfrage'
    }
  };

  return titles[key]?.[language] || titles[key]?.es || key;
};

const replyText = (key, language, roomNumber, isAddOn = false) => {
  const replies = {
    towels: {
      es: `Claro 😊 Aviso al equipo de housekeeping para llevarte las toallas ${roomText(roomNumber, 'es', 'to')}.`,
      en: `Of course 😊 I'll notify housekeeping to bring two towels ${roomText(roomNumber, 'en', 'to')}.`,
      fr: `Bien sûr 😊 Je préviens l’équipe d’entretien pour apporter les serviettes ${roomText(roomNumber, 'fr', 'to')}.`,
      de: `Natürlich 😊 Ich informiere das Housekeeping, damit sie zwei Handtücher ${roomText(roomNumber, 'de', 'to')} bringen.`
    },
    towelsAddon: {
      es: `Perfecto 😊 Añadimos también una almohada para la habitación ${roomNumber || 'indicada'}.`,
      en: `Perfect 😊 I'll add the pillow request for room ${roomNumber || 'provided'}.`,
      fr: `Parfait 😊 J’ajoute aussi cette demande pour la chambre ${roomNumber || 'indiquée'}.`,
      de: `Perfekt 😊 Ich ergänze diese Anfrage auch für Zimmer ${roomNumber || 'das angegebene Zimmer'}.`
    },
    cleaning: {
      es: `Por supuesto. Aviso al equipo de limpieza para revisar tu habitación ${roomNumber || 'indicada'}.`,
      en: `Of course. I'll notify housekeeping to check ${roomText(roomNumber, 'en')}.`,
      fr: `Bien sûr. Je préviens l’équipe d’entretien pour vérifier ${roomText(roomNumber, 'fr')}.`,
      de: `Natürlich. Ich informiere das Housekeeping, damit sie ${roomText(roomNumber, 'de')} prüfen.`
    },
    bedding: {
      es: isAddOn
        ? `Perfecto 😊 Añadimos también una almohada para la habitación ${roomNumber || 'indicada'}.`
        : `Claro, aviso al equipo para preparar lo que necesitas ${roomText(roomNumber, 'es')}.`,
      en: `Of course 😊 I'll notify housekeeping to prepare what you need ${roomText(roomNumber, 'en', 'to')}.`,
      fr: `Bien sûr 😊 Je préviens l’équipe pour préparer ce dont vous avez besoin ${roomText(roomNumber, 'fr')}.`,
      de: `Natürlich 😊 Ich informiere das Team, damit es vorbereitet, was Sie ${roomText(roomNumber, 'de')} benötigen.`
    },
    ac: {
      es: `Gracias por avisar. Informo al equipo de mantenimiento para revisar el aire acondicionado de la habitación ${roomNumber || 'indicada'}.`,
      en: `Thank you for letting us know. I'll inform maintenance to check the air conditioning ${roomText(roomNumber, 'en')}.`,
      fr: `Merci de nous prévenir. Je transmets à la maintenance pour vérifier la climatisation ${roomText(roomNumber, 'fr')}.`,
      de: `Danke für die Information. Ich informiere die Wartung, damit sie die Klimaanlage ${roomText(roomNumber, 'de')} überprüft.`
    },
    maintenance: {
      es: `Gracias por avisar. Paso el aviso a mantenimiento para revisar la incidencia ${roomText(roomNumber, 'es')}.`,
      en: `Thank you for letting us know. I'll pass this to maintenance to check the issue ${roomText(roomNumber, 'en')}.`,
      fr: `Merci de nous prévenir. Je transmets l’incident à la maintenance pour vérifier ${roomText(roomNumber, 'fr')}.`,
      de: `Danke für die Information. Ich gebe den Hinweis an die Wartung weiter, damit sie das Problem ${roomText(roomNumber, 'de')} prüft.`
    },
    taxi: {
      es: `Claro. Aviso a recepción para ayudarte con el taxi ${roomText(roomNumber, 'es', 'from')}.`,
      en: `Of course. I'll notify reception to help you with the taxi ${roomText(roomNumber, 'en', 'from')}.`,
      fr: `Bien sûr. Je préviens la réception pour vous aider avec le taxi ${roomText(roomNumber, 'fr', 'from')}.`,
      de: `Natürlich. Ich informiere die Rezeption, damit sie Ihnen mit dem Taxi ${roomText(roomNumber, 'de', 'from')} hilft.`
    },
    airport: {
      es: 'Perfecto. Aviso a recepción para ayudarte con el traslado al aeropuerto.',
      en: 'Perfect. I will notify reception to help you with the airport transfer.',
      fr: 'Parfait. Je préviens la réception pour vous aider avec le transfert à l’aéroport.',
      de: 'Perfekt. Ich informiere die Rezeption, damit sie Ihnen mit dem Flughafentransfer hilft.'
    },
    restaurant: {
      es: 'Encantado. Aviso al equipo del restaurante para ayudarte con la reserva.',
      en: 'Of course. I will notify the restaurant team to help you with the reservation.',
      fr: 'Avec plaisir. Je préviens l’équipe du restaurant pour vous aider avec la réservation.',
      de: 'Sehr gern. Ich informiere das Restaurantteam, damit es Ihnen bei der Reservierung hilft.'
    },
    complaint: {
      es: 'Lamento mucho las molestias. Aviso ahora mismo al equipo del hotel para revisar tu caso con prioridad.',
      en: 'I am very sorry for the inconvenience. I will notify the hotel team right away so they can review your case with priority.',
      fr: 'Je suis vraiment désolé pour la gêne occasionnée. Je préviens immédiatement l’équipe de l’hôtel pour traiter votre demande en priorité.',
      de: 'Es tut mir sehr leid für die Unannehmlichkeiten. Ich informiere sofort das Hotelteam, damit Ihr Anliegen mit Priorität geprüft wird.'
    },
    emergency: {
      es: 'Hemos marcado tu mensaje como urgente. Por favor, contacta también inmediatamente con recepción o emergencias si hay riesgo para tu seguridad.',
      en: 'We have marked your message as urgent. Please also contact reception or emergency services immediately if there is any risk to your safety.',
      fr: 'Nous avons marqué votre message comme urgent. Veuillez aussi contacter immédiatement la réception ou les urgences s’il y a un risque pour votre sécurité.',
      de: 'Wir haben Ihre Nachricht als dringend markiert. Bitte kontaktieren Sie sofort auch die Rezeption oder den Notdienst, falls Gefahr für Ihre Sicherheit besteht.'
    },
    human: {
      es: 'Por supuesto. Aviso al equipo de recepción para que te atienda una persona.',
      en: 'Of course. I will notify reception so a person can assist you.',
      fr: 'Bien sûr. Je préviens la réception afin qu’une personne puisse vous aider.',
      de: 'Natürlich. Ich informiere die Rezeption, damit Ihnen eine Person weiterhilft.'
    },
    unknown: {
      es: 'Gracias por tu mensaje. Aviso al equipo del hotel para ayudarte.',
      en: 'Thank you for your message. I will notify the hotel team so they can help you.',
      fr: 'Merci pour votre message. Je préviens l’équipe de l’hôtel pour vous aider.',
      de: 'Vielen Dank für Ihre Nachricht. Ich informiere das Hotelteam, damit es Ihnen helfen kann.'
    },
    infoFallback: {
      es: 'Ahora mismo no tengo ese dato confirmado del hotel. Aviso al equipo para darte la información correcta.',
      en: 'I do not have that hotel detail confirmed right now. I will notify the team so they can give you the correct information.',
      fr: 'Je n’ai pas cette information confirmée pour le moment. Je préviens l’équipe afin de vous donner la bonne réponse.',
      de: 'Diese Hotelinformation ist mir im Moment nicht bestätigt. Ich informiere das Team, damit Sie die richtige Auskunft erhalten.'
    }
  };

  return replies[key]?.[language] || replies[key]?.es;
};

const baseResponse = ({ intent, confidence, reply, ticket, escalate = false, emergency = false, upsell = false }) => ({
  intent,
  confidence,
  reply,
  create_ticket: Boolean(ticket),
  ticket: ticket || noTicket(),
  escalate_to_human: escalate,
  emergency,
  upsell_opportunity: upsell
});

export const analyzeGuestMessageWithMockAi = async ({
  message,
  conversationContext = {},
  knownRoom = null,
  recentMessages = []
}) => {
  const text = normalize(message);
  const detectedRoom = extractRoomNumberFromMessage(message);
  const roomNumber = detectedRoom || knownRoom || null;
  const language = normalizeLanguage(conversationContext.language || detectGuestLanguage(message));
  const isAddOn = includesAny(text, ['y tambien', 'tambien', 'and also', 'also', 'et aussi', 'aussi', 'und auch', 'auch']);

  logger.info('Using mock AI classifier', {
    mode: 'USE_MOCK_AI=true',
    detectedRoom,
    knownRoom,
    roomNumber,
    language,
    recentMessages: recentMessages.length
  });

  if (includesAny(text, ['fire', 'smoke', 'fuego', 'humo', 'herida', 'medical', 'medica', 'emergencia', 'emergency', 'danger', 'peligro', 'amenaza', 'inundacion', 'flood', 'violence', 'violencia', 'fumee', 'feu', 'urgence', 'rauch im', 'rauch in', 'es raucht', 'feuer', 'notfall', 'gefahr'])) {
    return validateAiResponse(baseResponse({
      intent: 'emergency',
      confidence: 0.98,
      reply: replyText('emergency', language, roomNumber),
      ticket: buildTicket({
        category: 'emergency',
        title: titleText('emergency', language),
        description: message,
        priority: 'urgent'
      }),
      escalate: true,
      emergency: true
    }));
  }

  if (includesAny(text, ['complaint', 'angry', 'upset', 'nobody helps', 'queja', 'molesto', 'molesta', 'enfadado', 'enfadada', 'fatal', 'mal servicio', 'nadie me ayuda', 'no estoy contento', 'no estoy contenta', 'reclamation', 'mecontent', 'personne ne m aide', 'beschwerde', 'verargert', 'niemand hilft'])) {
    return validateAiResponse(baseResponse({
      intent: 'complaint',
      confidence: 0.94,
      reply: replyText('complaint', language, roomNumber),
      ticket: buildTicket({
        category: 'complaint',
        title: titleText('complaint', language),
        description: message,
        priority: 'high'
      }),
      escalate: true
    }));
  }

  if (includesAny(text, ['toalla', 'toallas', 'towel', 'towels', 'serviette', 'serviettes', 'handtuch', 'handtucher'])) {
    return validateAiResponse(baseResponse({
      intent: 'housekeeping_request',
      confidence: 0.96,
      reply: replyText('towels', language, roomNumber),
      ticket: buildTicket({
        category: 'housekeeping',
        title: titleText('towels', language),
        description: message,
        priority: 'normal'
      })
    }));
  }

  if (includesAny(text, ['limpieza', 'limpiar', 'limpien', 'aseo', 'cleaning', 'clean my room', 'menage', 'nettoyer', 'reinigung', 'reinigen'])) {
    return validateAiResponse(baseResponse({
      intent: 'housekeeping_request',
      confidence: 0.94,
      reply: replyText('cleaning', language, roomNumber),
      ticket: buildTicket({
        category: 'housekeeping',
        title: titleText('cleaning', language),
        description: message,
        priority: 'normal'
      })
    }));
  }

  if (includesAny(text, ['almohada', 'almohadas', 'pillow', 'pillows', 'sabana', 'sheet', 'sheets', 'manta', 'blanket', 'oreiller', 'drap', 'kissen', 'bettwasche', 'decke'])) {
    return validateAiResponse(baseResponse({
      intent: 'housekeeping_request',
      confidence: 0.93,
      reply: replyText(isAddOn ? 'towelsAddon' : 'bedding', language, roomNumber, isAddOn),
      ticket: buildTicket({
        category: 'housekeeping',
        title: titleText('bedding', language),
        description: message,
        priority: 'normal'
      })
    }));
  }

  if (includesAny(text, ['aire acondicionado', 'air conditioning', ' ac ', 'climatizacion', 'climatisation', 'klimaanlage'])) {
    return validateAiResponse(baseResponse({
      intent: 'maintenance_issue',
      confidence: 0.95,
      reply: replyText('ac', language, roomNumber),
      ticket: buildTicket({
        category: 'maintenance',
        title: titleText('ac', language),
        description: message,
        priority: 'high'
      })
    }));
  }

  if (includesAny(text, ['ducha', 'agua', 'grifo', 'bano', 'shower', 'water', 'tap', 'bathroom', 'douche', 'eau', 'wasser', 'dusche'])) {
    return validateAiResponse(baseResponse({
      intent: 'maintenance_issue',
      confidence: 0.94,
      reply: replyText('maintenance', language, roomNumber),
      ticket: buildTicket({
        category: 'maintenance',
        title: titleText('maintenance', language),
        description: message,
        priority: 'high'
      })
    }));
  }

  if (includesAny(text, ['luz', 'luces', 'television', 'tv', 'light', 'lights', 'lampe', 'licht', 'fernseher'])) {
    return validateAiResponse(baseResponse({
      intent: 'maintenance_issue',
      confidence: 0.92,
      reply: replyText('maintenance', language, roomNumber),
      ticket: buildTicket({
        category: 'maintenance',
        title: titleText('maintenance', language),
        description: message,
        priority: 'normal'
      })
    }));
  }

  if (includesAny(text, ['roto', 'rota', 'no funciona', 'averia', 'broken', 'not working', 'ne fonctionne pas', 'kaputt', 'funktioniert nicht'])) {
    return validateAiResponse(baseResponse({
      intent: 'maintenance_issue',
      confidence: 0.86,
      reply: replyText('maintenance', language, roomNumber),
      ticket: buildTicket({
        category: 'maintenance',
        title: titleText('maintenance', language),
        description: message,
        priority: 'high'
      })
    }));
  }

  if (includesAny(text, ['taxi', 'cab'])) {
    return validateAiResponse(baseResponse({
      intent: 'transport_request',
      confidence: 0.93,
      reply: replyText('taxi', language, roomNumber),
      ticket: buildTicket({
        category: 'transport',
        title: titleText('taxi', language),
        description: message,
        priority: 'normal'
      }),
      upsell: true
    }));
  }

  if (includesAny(text, ['aeropuerto', 'airport', 'transfer', 'traslado', 'aeroport', 'flughafen'])) {
    return validateAiResponse(baseResponse({
      intent: 'transport_request',
      confidence: 0.91,
      reply: replyText('airport', language, roomNumber),
      ticket: buildTicket({
        category: 'transport',
        title: titleText('taxi', language),
        description: message,
        priority: 'normal'
      }),
      upsell: true
    }));
  }

  if (includesAny(text, ['reserva', 'reservar', 'restaurante', 'restaurant', 'booking', 'reservation', 'mesa', 'cena', 'cenar', 'dinner', 'reserver', 'table', 'diner', 'reservieren', 'abendessen'])) {
    return validateAiResponse(baseResponse({
      intent: 'restaurant_booking',
      confidence: 0.92,
      reply: replyText('restaurant', language, roomNumber),
      ticket: buildTicket({
        category: 'restaurant',
        title: titleText('restaurant', language),
        description: message,
        priority: 'normal'
      }),
      upsell: true
    }));
  }

  if (includesAny(text, ['spa', 'masaje', 'massage', 'tratamiento', 'treatment', 'behandlung'])) {
    return validateAiResponse(baseResponse({
      intent: 'spa_booking',
      confidence: 0.9,
      reply: {
        es: 'Perfecto, aviso al equipo para ayudarte con la reserva del spa.',
        en: 'Perfect, I will notify the team to help you with the spa booking.',
        fr: 'Parfait, je préviens l’équipe pour vous aider avec la réservation du spa.',
        de: 'Perfekt, ich informiere das Team, damit es Ihnen bei der Spa-Reservierung hilft.'
      }[language],
      ticket: buildTicket({
        category: 'spa',
        title: titleText('restaurant', language),
        description: message,
        priority: 'normal'
      }),
      upsell: true
    }));
  }

  if (includesAny(text, ['room service', 'servicio de habitaciones', 'hamburguesa', 'pizza', 'bebida', 'drink', 'getrank'])) {
    return validateAiResponse(baseResponse({
      intent: 'room_service',
      confidence: 0.9,
      reply: {
        es: `Claro, aviso al equipo de room service para ayudarte ${roomText(roomNumber, 'es')}.`,
        en: `Of course, I will notify room service to help you ${roomText(roomNumber, 'en')}.`,
        fr: `Bien sûr, je préviens le room service pour vous aider ${roomText(roomNumber, 'fr')}.`,
        de: `Natürlich, ich informiere den Room Service, damit er Ihnen ${roomText(roomNumber, 'de')} hilft.`
      }[language],
      ticket: buildTicket({
        category: 'room_service',
        title: titleText('reception', language),
        description: message,
        priority: 'normal'
      }),
      upsell: true
    }));
  }

  if (includesAny(text, ['persona', 'humano', 'recepcion', 'hablar con alguien', 'person', 'human', 'reception', 'quelqu un', 'rezeption', 'person sprechen'])) {
    return validateAiResponse(baseResponse({
      intent: 'human_escalation',
      confidence: 0.93,
      reply: replyText('human', language, roomNumber),
      ticket: buildTicket({
        category: 'reception',
        title: titleText('reception', language),
        description: message,
        priority: 'normal'
      }),
      escalate: true
    }));
  }

  if (includesAny(text, ['wifi', 'wi-fi', 'wlan', 'desayuno', 'checkout', 'check out', 'piscina', 'horario', 'breakfast', 'pool', 'schedule', 'mot de passe', 'passwort'])) {
    return validateAiResponse(baseResponse({
      intent: 'hotel_info',
      confidence: 0.76,
      reply: replyText('infoFallback', language, roomNumber),
      ticket: null,
      escalate: true
    }));
  }

  return validateAiResponse(baseResponse({
    intent: 'unknown',
    confidence: 0.72,
    reply: replyText('unknown', language, roomNumber),
    ticket: buildTicket({
      category: 'reception',
      title: titleText('reception', language),
      description: message,
      priority: 'normal'
    })
  }));
};
