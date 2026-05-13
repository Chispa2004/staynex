export const DASHBOARD_LANGUAGES = [
  { code: 'es', label: 'ES', name: 'Español' },
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'fr', label: 'FR', name: 'Français' },
  { code: 'de', label: 'DE', name: 'Deutsch' }
];

export const DEFAULT_DASHBOARD_LANGUAGE = 'es';
export const DASHBOARD_LANGUAGE_STORAGE_KEY = 'staynex_dashboard_language';

export const translations = {
  es: {
    app: {
      hotelOperations: 'Operaciones del hotel',
      urgent: 'urgente',
      language: 'Idioma'
    },
    sidebar: {
      inbox: 'Inbox',
      tickets: 'Tickets',
      housekeeping: 'Housekeeping',
      maintenance: 'Mantenimiento',
      reception: 'Recepción',
      conversations: 'Conversaciones',
      analytics: 'Analítica',
      aiLogs: 'AI Logs',
      qrRooms: 'QR Rooms',
      settings: 'Ajustes',
      knowledgeBase: 'Knowledge Base',
      demo: 'Demo'
    },
    status: {
      open: 'Abierto',
      in_progress: 'En progreso',
      completed: 'Completado',
      cancelled: 'Cancelado',
      active: 'Activo',
      unknown: 'Desconocido'
    },
    priority: {
      low: 'Baja',
      normal: 'Normal',
      high: 'Alta',
      urgent: 'URGENTE'
    },
    table: {
      room: 'Habitación',
      category: 'Categoría',
      priority: 'Prioridad',
      status: 'Estado',
      date: 'Fecha',
      age: 'Tiempo abierto',
      description: 'Descripción',
      actions: 'Acciones',
      quickActions: 'Acciones rápidas'
    },
    buttons: {
      refresh: 'Actualizar',
      save: 'Guardar',
      delete: 'Eliminar',
      add: 'Añadir',
      send: 'Enviar',
      complete: 'Completar',
      inProgress: 'En progreso',
      open: 'Abrir',
      logout: 'Cerrar sesión'
    },
    screens: {
      operations: 'Operaciones',
      dashboard: 'Dashboard',
      tickets: 'Tickets',
      ticketsDescription: 'Solicitudes creadas por Staynex, ordenadas por fecha descendente.',
      inbox: 'Inbox',
      inboxDescription: 'Conversaciones con huéspedes y respuestas del equipo por WhatsApp.',
      departmentDescription: 'Tickets operativos filtrados para este departamento.',
      knowledgeBase: 'Knowledge Base',
      knowledgeDescription: 'Edita la información del hotel que Staynex usa para responder preguntas sin crear tickets.',
      settings: 'Ajustes',
      settingsDescription: 'Configura información del hotel, WhatsApp, IA y reglas operativas.',
      analytics: 'Analítica',
      analyticsDescription: 'Espacio reservado para métricas operativas, volumen de tickets y tiempos de resolución.',
      aiLogs: 'AI Logs',
      aiLogsDescription: 'Trazabilidad interna de decisiones de IA para debugging y monitoreo operativo.',
      qrRooms: 'QR Rooms',
      qrRoomsDescription: 'Genera códigos QR por habitación para abrir WhatsApp con el contexto de habitación incluido.'
    },
    inbox: {
      conversations: 'Conversaciones',
      activeThreads: '{count} conversaciones activas',
      guest: 'Huésped',
      staff: 'Equipo',
      noConversations: 'No hay conversaciones todavía.',
      noConversationsDescription: 'Las conversaciones aparecerán cuando el backend reciba mensajes.',
      noMessages: 'Sin mensajes todavía',
      noPhone: 'Sin teléfono',
      replyPlaceholder: 'Responder al huésped...',
      roomUnknown: 'Habitación desconocida',
      original: 'Original',
      staffTranslation: 'Traducción para recepción',
      hideTranslation: 'Ocultar traducción',
      showTranslation: 'Mostrar traducción',
      unreadTotal: '{count} sin leer',
      newCount: '{count} new',
      newConversation: 'Nueva',
      needsAttention: 'Atención',
      humanTotal: '{count} requieren humano',
      needsHuman: 'Needs human',
      needsHumanFilter: 'Needs human',
      noNeedsHuman: 'No hay conversaciones que requieran atención humana.',
      receptionAttentionRequired: 'Reception attention required',
      humanReason: 'Motivo: {reason}',
      humanReasons: {
        low_confidence: 'confianza baja',
        complaint_detected: 'queja detectada',
        emergency_detected: 'emergencia detectada',
        fallback_response: 'respuesta fallback',
        human_requested: 'humano solicitado',
        technical_issue_detected: 'incidencia delicada'
      }
    },
    tickets: {
      count: '{count} tickets',
      noTickets: 'No hay tickets todavía.',
      noTicketsDescription: 'Los tickets creados por el backend aparecerán aquí.',
      noMatchingTickets: 'No hay tickets con estos filtros.',
      tryAnotherFilter: 'Prueba con otro estado, prioridad o categoría.',
      noRoom: 'Sin habitación',
      noData: 'Sin datos',
      noDescription: 'Sin descripción',
      openedNow: 'Abierto ahora',
      openedMinutes: 'Abierto hace {count} min',
      openedHours: 'Abierto hace {count} h',
      openedDays: 'Abierto hace {count} d'
    },
    filters: {
      status: 'Estado',
      priority: 'Prioridad',
      category: 'Categoría',
      all: 'Todos'
    },
    stats: {
      open: 'Abiertos',
      inProgress: 'En progreso',
      completedToday: 'Completados hoy',
      urgent: 'Urgentes'
    },
    knowledge: {
      demoHotel: 'Hotel demo',
      loadingHotel: 'Cargando hotel...',
      loading: 'Cargando',
      usefulCategories: 'Categorías útiles',
      key: 'clave',
      value: 'valor',
      saved: 'Guardado correctamente',
      savedEntry: 'Dato guardado correctamente.',
      addedEntry: 'Dato añadido correctamente.',
      deletedEntry: 'Dato eliminado correctamente.'
    },
    analytics: {
      filters: { today: 'Hoy', sevenDays: '7 dias', thirtyDays: '30 dias' },
      kpis: {
        managedMessages: 'Mensajes gestionados',
        ticketsCreated: 'Tickets creados',
        resolutionRate: 'Tasa de resolucion',
        aiAutomation: 'Automatizacion IA'
      },
      kpiHints: {
        managedMessages: 'Conversaciones atendidas por Staynex.',
        ticketsCreated: 'Solicitudes operativas generadas.',
        resolutionRate: 'Tickets cerrados frente a creados.',
        aiAutomation: 'Respuestas resueltas sin intervencion humana.'
      },
      sections: {
        operationalOverview: 'Operational overview',
        guestIntelligence: 'Guest intelligence',
        businessImpact: 'Business impact'
      },
      descriptions: {
        operationalOverview: 'Volumen operativo y rendimiento del equipo.',
        guestIntelligence: 'Patrones de huespedes detectados por Staynex.',
        businessImpact: 'Impacto estimado en eficiencia y servicio.'
      },
      metrics: {
        messagesByDay: 'Mensajes por dia',
        createdVsResolved: 'Tickets creados vs resueltos',
        departmentTickets: 'Tickets por departamento',
        detectedLanguages: 'Idiomas detectados',
        frequentCategories: 'Categorias mas frecuentes',
        peakHours: 'Horas pico'
      },
      impact: {
        timeSaved: 'Tiempo estimado ahorrado',
        instantReplies: 'Respuestas instantaneas',
        urgentDetected: 'Incidencias urgentes detectadas',
        activeRooms: 'Habitaciones con mas actividad'
      },
      created: 'Creados',
      resolved: 'Resueltos',
      mockNotice: 'Datos mock para demo. Preparado para conectar con Supabase Analytics.'
    },
    aiLogs: {
      filters: {
        all: 'Todos',
        housekeeping: 'Housekeeping',
        maintenance: 'Mantenimiento',
        reception: 'Recepción',
        knowledgeBase: 'Knowledge Base',
        ticketsOnly: 'Solo tickets',
        lowConfidence: 'Baja confianza'
      },
      stats: {
        logsToday: 'Logs hoy',
        ticketsCreated: 'Tickets creados',
        avgConfidence: 'Confianza media',
        knowledgeHits: 'Knowledge hits'
      },
      columns: {
        date: 'Fecha',
        language: 'Idioma',
        intent: 'Intent detectado',
        room: 'Habitación',
        ticket: 'Ticket',
        category: 'Categoría',
        confidence: 'Confidence',
        guestMessage: 'Mensaje huésped',
        aiResponse: 'Respuesta IA'
      },
      searchPlaceholder: 'Buscar por habitación, mensaje o intent...',
      results: '{count} logs',
      loading: 'Cargando AI Logs...',
      empty: 'Todavía no hay AI Logs.',
      noMatches: 'No hay logs con estos filtros.',
      ticketCreated: 'Created',
      noTicket: 'No ticket',
      detailTitle: 'Detalle debug',
      selectLog: 'Selecciona un log para ver el detalle técnico.',
      closeDetail: 'Cerrar detalle',
      unknown: 'Desconocido',
      errors: {
        title: 'No se pudieron cargar los AI Logs',
        loadFailed: 'Error cargando AI Logs'
      }
    },
    qrRooms: {
      room: 'Habitación',
      whatsappNumber: 'Número WhatsApp',
      downloadQr: 'Descargar QR',
      copyLink: 'Copiar enlace',
      copied: 'Copiado',
      openWhatsapp: 'Abrir WhatsApp',
      qrAlt: 'QR para habitación {room}',
      missingWhatsappNumber: 'Configura TWILIO_WHATSAPP_FROM'
    },
    settings: {
      knowledgeDescription: 'Edita la información del hotel que Staynex usa para responder preguntas de huéspedes.'
    }
  },
  en: {
    app: {
      hotelOperations: 'Hotel operations',
      urgent: 'urgent',
      language: 'Language'
    },
    sidebar: {
      inbox: 'Inbox',
      tickets: 'Tickets',
      housekeeping: 'Housekeeping',
      maintenance: 'Maintenance',
      reception: 'Reception',
      conversations: 'Conversations',
      analytics: 'Analytics',
      aiLogs: 'AI Logs',
      qrRooms: 'QR Rooms',
      settings: 'Settings',
      knowledgeBase: 'Knowledge Base',
      demo: 'Demo'
    },
    status: {
      open: 'Open',
      in_progress: 'In progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      active: 'Active',
      unknown: 'Unknown'
    },
    priority: {
      low: 'Low',
      normal: 'Normal',
      high: 'High',
      urgent: 'URGENT'
    },
    table: {
      room: 'Room',
      category: 'Category',
      priority: 'Priority',
      status: 'Status',
      date: 'Date',
      age: 'Age',
      description: 'Description',
      actions: 'Actions',
      quickActions: 'Quick actions'
    },
    buttons: {
      refresh: 'Refresh',
      save: 'Save',
      delete: 'Delete',
      add: 'Add',
      send: 'Send',
      complete: 'Complete',
      inProgress: 'In progress',
      open: 'Open',
      logout: 'Logout'
    },
    screens: {
      operations: 'Operations',
      dashboard: 'Dashboard',
      tickets: 'Tickets',
      ticketsDescription: 'Requests created by Staynex, sorted newest first.',
      inbox: 'Inbox',
      inboxDescription: 'Guest conversations and staff replies through WhatsApp.',
      departmentDescription: 'Operational tickets filtered for this department.',
      knowledgeBase: 'Knowledge Base',
      knowledgeDescription: 'Edit hotel information Staynex can use to answer guest questions without creating tickets.',
      settings: 'Settings',
      settingsDescription: 'Configure hotel information, WhatsApp, AI and operational rules.',
      analytics: 'Analytics',
      analyticsDescription: 'Reserved for operational metrics, ticket volume and resolution times.',
      aiLogs: 'AI Logs',
      aiLogsDescription: 'Internal trace of AI decisions for debugging and operational monitoring.',
      qrRooms: 'QR Rooms',
      qrRoomsDescription: 'Generate room QR codes that open WhatsApp with room context included.'
    },
    inbox: {
      conversations: 'Conversations',
      activeThreads: '{count} active threads',
      guest: 'Guest',
      staff: 'Staff',
      noConversations: 'No conversations yet.',
      noConversationsDescription: 'Guest conversations will appear after the backend receives messages.',
      noMessages: 'No messages yet',
      noPhone: 'No phone',
      replyPlaceholder: 'Reply to guest...',
      roomUnknown: 'Unknown room',
      original: 'Original',
      staffTranslation: 'Staff translation',
      hideTranslation: 'Hide translation',
      showTranslation: 'Show translation',
      unreadTotal: '{count} unread',
      newCount: '{count} new',
      newConversation: 'New',
      needsAttention: 'Needs attention',
      humanTotal: '{count} need human',
      needsHuman: 'Needs human',
      needsHumanFilter: 'Needs human',
      noNeedsHuman: 'No conversations require human attention.',
      receptionAttentionRequired: 'Reception attention required',
      humanReason: 'Reason: {reason}',
      humanReasons: {
        low_confidence: 'low confidence',
        complaint_detected: 'complaint detected',
        emergency_detected: 'emergency detected',
        fallback_response: 'fallback response',
        human_requested: 'human requested',
        technical_issue_detected: 'sensitive technical issue'
      }
    },
    tickets: {
      count: '{count} tickets',
      noTickets: 'No tickets yet.',
      noTicketsDescription: 'Tickets created by the backend will appear here.',
      noMatchingTickets: 'No tickets match these filters.',
      tryAnotherFilter: 'Try another status, priority, or category.',
      noRoom: 'No room',
      noData: 'No data',
      noDescription: 'No description',
      openedNow: 'Opened now',
      openedMinutes: 'Opened {count} min ago',
      openedHours: 'Opened {count} h ago',
      openedDays: 'Opened {count} d ago'
    },
    filters: {
      status: 'Status',
      priority: 'Priority',
      category: 'Category',
      all: 'All'
    },
    stats: {
      open: 'Open',
      inProgress: 'In progress',
      completedToday: 'Completed today',
      urgent: 'Urgent'
    },
    knowledge: {
      demoHotel: 'Demo hotel',
      loadingHotel: 'Loading hotel...',
      loading: 'Loading',
      usefulCategories: 'Useful categories',
      key: 'key',
      value: 'value',
      saved: 'Saved correctly',
      savedEntry: 'Knowledge saved correctly.',
      addedEntry: 'Knowledge entry added correctly.',
      deletedEntry: 'Knowledge entry deleted correctly.'
    },
    analytics: {
      filters: { today: 'Today', sevenDays: '7 days', thirtyDays: '30 days' },
      kpis: {
        managedMessages: 'Managed messages',
        ticketsCreated: 'Tickets created',
        resolutionRate: 'Resolution rate',
        aiAutomation: 'AI automation'
      },
      kpiHints: {
        managedMessages: 'Guest conversations handled by Staynex.',
        ticketsCreated: 'Operational requests generated.',
        resolutionRate: 'Closed tickets compared with created tickets.',
        aiAutomation: 'Replies solved without human intervention.'
      },
      sections: {
        operationalOverview: 'Operational overview',
        guestIntelligence: 'Guest intelligence',
        businessImpact: 'Business impact'
      },
      descriptions: {
        operationalOverview: 'Operational volume and team performance.',
        guestIntelligence: 'Guest patterns detected by Staynex.',
        businessImpact: 'Estimated impact on efficiency and service.'
      },
      metrics: {
        messagesByDay: 'Messages by day',
        createdVsResolved: 'Tickets created vs resolved',
        departmentTickets: 'Tickets by department',
        detectedLanguages: 'Detected languages',
        frequentCategories: 'Most frequent categories',
        peakHours: 'Peak hours'
      },
      impact: {
        timeSaved: 'Estimated time saved',
        instantReplies: 'Instant replies',
        urgentDetected: 'Urgent incidents detected',
        activeRooms: 'Rooms with most activity'
      },
      created: 'Created',
      resolved: 'Resolved',
      mockNotice: 'Mock data for demo. Ready to connect with Supabase Analytics.'
    },
    aiLogs: {
      filters: {
        all: 'All',
        housekeeping: 'Housekeeping',
        maintenance: 'Maintenance',
        reception: 'Reception',
        knowledgeBase: 'Knowledge Base',
        ticketsOnly: 'Tickets only',
        lowConfidence: 'Low confidence'
      },
      stats: {
        logsToday: 'Logs today',
        ticketsCreated: 'Tickets created',
        avgConfidence: 'Avg confidence',
        knowledgeHits: 'Knowledge Base hits'
      },
      columns: {
        date: 'Date',
        language: 'Language',
        intent: 'Detected intent',
        room: 'Room',
        ticket: 'Ticket',
        category: 'Category',
        confidence: 'Confidence',
        guestMessage: 'Guest message',
        aiResponse: 'AI response'
      },
      searchPlaceholder: 'Search by room, message or intent...',
      results: '{count} logs',
      loading: 'Loading AI Logs...',
      empty: 'No AI Logs yet.',
      noMatches: 'No logs match these filters.',
      ticketCreated: 'Created',
      noTicket: 'No ticket',
      detailTitle: 'Debug detail',
      selectLog: 'Select a log to inspect the technical details.',
      closeDetail: 'Close detail',
      unknown: 'Unknown',
      errors: {
        title: 'AI Logs could not be loaded',
        loadFailed: 'Error loading AI Logs'
      }
    },
    qrRooms: {
      room: 'Room',
      whatsappNumber: 'WhatsApp number',
      downloadQr: 'Download QR',
      copyLink: 'Copy link',
      copied: 'Copied',
      openWhatsapp: 'Open WhatsApp',
      qrAlt: 'QR for room {room}',
      missingWhatsappNumber: 'Set TWILIO_WHATSAPP_FROM'
    },
    settings: {
      knowledgeDescription: 'Edit hotel information used by Staynex to answer guest questions.'
    }
  },
  fr: {
    app: {
      hotelOperations: 'Opérations hôtel',
      urgent: 'urgent',
      language: 'Langue'
    },
    sidebar: {
      inbox: 'Boîte de réception',
      tickets: 'Tickets',
      housekeeping: 'Housekeeping',
      maintenance: 'Maintenance',
      reception: 'Réception',
      conversations: 'Conversations',
      analytics: 'Analytique',
      aiLogs: 'AI Logs',
      qrRooms: 'QR Rooms',
      settings: 'Paramètres',
      knowledgeBase: 'Base de connaissances',
      demo: 'Démo'
    },
    status: {
      open: 'Ouvert',
      in_progress: 'En cours',
      completed: 'Terminé',
      cancelled: 'Annulé',
      active: 'Actif',
      unknown: 'Inconnu'
    },
    priority: {
      low: 'Basse',
      normal: 'Normale',
      high: 'Haute',
      urgent: 'URGENT'
    },
    table: {
      room: 'Chambre',
      category: 'Catégorie',
      priority: 'Priorité',
      status: 'Statut',
      date: 'Date',
      age: 'Depuis',
      description: 'Description',
      actions: 'Actions',
      quickActions: 'Actions rapides'
    },
    buttons: {
      refresh: 'Actualiser',
      save: 'Enregistrer',
      delete: 'Supprimer',
      add: 'Ajouter',
      send: 'Envoyer',
      complete: 'Terminer',
      inProgress: 'En cours',
      open: 'Ouvrir',
      logout: 'Déconnexion'
    },
    screens: {
      operations: 'Opérations',
      dashboard: 'Dashboard',
      tickets: 'Tickets',
      ticketsDescription: 'Demandes créées par Staynex, triées par date décroissante.',
      inbox: 'Boîte de réception',
      inboxDescription: 'Conversations avec les clients et réponses de l’équipe via WhatsApp.',
      departmentDescription: 'Tickets opérationnels filtrés pour ce département.',
      knowledgeBase: 'Base de connaissances',
      knowledgeDescription: 'Modifiez les informations que Staynex utilise pour répondre sans créer de ticket.',
      settings: 'Paramètres',
      settingsDescription: 'Configurez les informations hôtel, WhatsApp, IA et règles opérationnelles.',
      analytics: 'Analytique',
      analyticsDescription: 'Espace réservé aux métriques opérationnelles, volume de tickets et délais de résolution.',
      aiLogs: 'AI Logs',
      aiLogsDescription: 'Trace interne des decisions IA pour le debugging et le monitoring operationnel.',
      qrRooms: 'QR Rooms',
      qrRoomsDescription: 'Generez des QR par chambre pour ouvrir WhatsApp avec le contexte de chambre.'
    },
    inbox: {
      conversations: 'Conversations',
      activeThreads: '{count} fils actifs',
      guest: 'Client',
      staff: 'Équipe',
      noConversations: 'Aucune conversation pour le moment.',
      noConversationsDescription: 'Les conversations apparaîtront après réception des messages.',
      noMessages: 'Aucun message',
      noPhone: 'Pas de téléphone',
      replyPlaceholder: 'Répondre au client...',
      roomUnknown: 'Chambre inconnue',
      original: 'Original',
      staffTranslation: 'Traduction pour la réception',
      hideTranslation: 'Masquer la traduction',
      showTranslation: 'Afficher la traduction',
      unreadTotal: '{count} non lus',
      newCount: '{count} new',
      newConversation: 'Nouvelle',
      needsAttention: 'Attention',
      humanTotal: '{count} necessitent humain',
      needsHuman: 'Needs human',
      needsHumanFilter: 'Needs human',
      noNeedsHuman: 'Aucune conversation ne necessite une attention humaine.',
      receptionAttentionRequired: 'Attention reception requise',
      humanReason: 'Motif : {reason}',
      humanReasons: {
        low_confidence: 'faible confiance',
        complaint_detected: 'reclamation detectee',
        emergency_detected: 'urgence detectee',
        fallback_response: 'reponse fallback',
        human_requested: 'humain demande',
        technical_issue_detected: 'incident technique sensible'
      }
    },
    tickets: {
      count: '{count} tickets',
      noTickets: 'Aucun ticket pour le moment.',
      noTicketsDescription: 'Les tickets créés par le backend apparaîtront ici.',
      noMatchingTickets: 'Aucun ticket ne correspond à ces filtres.',
      tryAnotherFilter: 'Essayez un autre statut, priorité ou catégorie.',
      noRoom: 'Sans chambre',
      noData: 'Aucune donnée',
      noDescription: 'Aucune description',
      openedNow: 'Ouvert maintenant',
      openedMinutes: 'Ouvert il y a {count} min',
      openedHours: 'Ouvert il y a {count} h',
      openedDays: 'Ouvert il y a {count} j'
    },
    filters: {
      status: 'Statut',
      priority: 'Priorité',
      category: 'Catégorie',
      all: 'Tous'
    },
    stats: {
      open: 'Ouverts',
      inProgress: 'En cours',
      completedToday: 'Terminés aujourd’hui',
      urgent: 'Urgents'
    },
    knowledge: {
      demoHotel: 'Hôtel démo',
      loadingHotel: 'Chargement hôtel...',
      loading: 'Chargement',
      usefulCategories: 'Catégories utiles',
      key: 'clé',
      value: 'valeur',
      saved: 'Enregistré',
      savedEntry: 'Base de connaissances enregistrée.',
      addedEntry: 'Entrée ajoutée.',
      deletedEntry: 'Entrée supprimée.'
    },
    analytics: {
      filters: { today: 'Aujourd hui', sevenDays: '7 jours', thirtyDays: '30 jours' },
      kpis: {
        managedMessages: 'Messages traites',
        ticketsCreated: 'Tickets crees',
        resolutionRate: 'Taux de resolution',
        aiAutomation: 'Automatisation IA'
      },
      kpiHints: {
        managedMessages: 'Conversations clients gerees par Staynex.',
        ticketsCreated: 'Demandes operationnelles generees.',
        resolutionRate: 'Tickets fermes par rapport aux tickets crees.',
        aiAutomation: 'Reponses resolues sans intervention humaine.'
      },
      sections: {
        operationalOverview: 'Vue operationnelle',
        guestIntelligence: 'Intelligence client',
        businessImpact: 'Impact business'
      },
      descriptions: {
        operationalOverview: 'Volume operationnel et performance equipe.',
        guestIntelligence: 'Tendances clients detectees par Staynex.',
        businessImpact: 'Impact estime sur efficacite et service.'
      },
      metrics: {
        messagesByDay: 'Messages par jour',
        createdVsResolved: 'Tickets crees vs resolus',
        departmentTickets: 'Tickets par departement',
        detectedLanguages: 'Langues detectees',
        frequentCategories: 'Categories frequentes',
        peakHours: 'Heures de pointe'
      },
      impact: {
        timeSaved: 'Temps estime economise',
        instantReplies: 'Reponses instantanees',
        urgentDetected: 'Incidents urgents detectes',
        activeRooms: 'Chambres les plus actives'
      },
      created: 'Crees',
      resolved: 'Resolus',
      mockNotice: 'Donnees mock pour demo. Pret a connecter avec Supabase Analytics.'
    },
    aiLogs: {
      filters: {
        all: 'Tous',
        housekeeping: 'Housekeeping',
        maintenance: 'Maintenance',
        reception: 'Reception',
        knowledgeBase: 'Base de connaissances',
        ticketsOnly: 'Tickets seulement',
        lowConfidence: 'Faible confiance'
      },
      stats: {
        logsToday: 'Logs aujourd hui',
        ticketsCreated: 'Tickets crees',
        avgConfidence: 'Confiance moyenne',
        knowledgeHits: 'Hits Knowledge Base'
      },
      columns: {
        date: 'Date',
        language: 'Langue',
        intent: 'Intent detecte',
        room: 'Chambre',
        ticket: 'Ticket',
        category: 'Categorie',
        confidence: 'Confidence',
        guestMessage: 'Message client',
        aiResponse: 'Reponse IA'
      },
      searchPlaceholder: 'Rechercher par chambre, message ou intent...',
      results: '{count} logs',
      loading: 'Chargement des AI Logs...',
      empty: 'Aucun AI Log pour le moment.',
      noMatches: 'Aucun log ne correspond a ces filtres.',
      ticketCreated: 'Created',
      noTicket: 'No ticket',
      detailTitle: 'Detail debug',
      selectLog: 'Selectionnez un log pour voir le detail technique.',
      closeDetail: 'Fermer le detail',
      unknown: 'Inconnu',
      errors: {
        title: 'Impossible de charger les AI Logs',
        loadFailed: 'Erreur lors du chargement des AI Logs'
      }
    },
    qrRooms: {
      room: 'Chambre',
      whatsappNumber: 'Numero WhatsApp',
      downloadQr: 'Telecharger QR',
      copyLink: 'Copier le lien',
      copied: 'Copie',
      openWhatsapp: 'Ouvrir WhatsApp',
      qrAlt: 'QR pour chambre {room}',
      missingWhatsappNumber: 'Configurez TWILIO_WHATSAPP_FROM'
    },
    settings: {
      knowledgeDescription: 'Modifiez les informations utilisées par Staynex pour répondre aux clients.'
    }
  },
  de: {
    app: {
      hotelOperations: 'Hotelbetrieb',
      urgent: 'dringend',
      language: 'Sprache'
    },
    sidebar: {
      inbox: 'Posteingang',
      tickets: 'Tickets',
      housekeeping: 'Housekeeping',
      maintenance: 'Wartung',
      reception: 'Rezeption',
      conversations: 'Unterhaltungen',
      analytics: 'Analytik',
      aiLogs: 'AI Logs',
      qrRooms: 'QR Rooms',
      settings: 'Einstellungen',
      knowledgeBase: 'Wissensdatenbank',
      demo: 'Demo'
    },
    status: {
      open: 'Offen',
      in_progress: 'In Bearbeitung',
      completed: 'Abgeschlossen',
      cancelled: 'Storniert',
      active: 'Aktiv',
      unknown: 'Unbekannt'
    },
    priority: {
      low: 'Niedrig',
      normal: 'Normal',
      high: 'Hoch',
      urgent: 'DRINGEND'
    },
    table: {
      room: 'Zimmer',
      category: 'Kategorie',
      priority: 'Priorität',
      status: 'Status',
      date: 'Datum',
      age: 'Offen seit',
      description: 'Beschreibung',
      actions: 'Aktionen',
      quickActions: 'Schnellaktionen'
    },
    buttons: {
      refresh: 'Aktualisieren',
      save: 'Speichern',
      delete: 'Löschen',
      add: 'Hinzufügen',
      send: 'Senden',
      complete: 'Abschließen',
      inProgress: 'In Bearbeitung',
      open: 'Öffnen',
      logout: 'Abmelden'
    },
    screens: {
      operations: 'Betrieb',
      dashboard: 'Dashboard',
      tickets: 'Tickets',
      ticketsDescription: 'Von Staynex erstellte Anfragen, nach Datum absteigend sortiert.',
      inbox: 'Posteingang',
      inboxDescription: 'Gästegespräche und Teamantworten über WhatsApp.',
      departmentDescription: 'Operative Tickets für diese Abteilung.',
      knowledgeBase: 'Wissensdatenbank',
      knowledgeDescription: 'Bearbeiten Sie Hotelinformationen, die Staynex ohne Ticket beantworten kann.',
      settings: 'Einstellungen',
      settingsDescription: 'Konfigurieren Sie Hotelinformationen, WhatsApp, KI und operative Regeln.',
      analytics: 'Analytik',
      analyticsDescription: 'Bereich für operative Kennzahlen, Ticketvolumen und Lösungszeiten.',
      aiLogs: 'AI Logs',
      aiLogsDescription: 'Interne Nachverfolgung von KI-Entscheidungen fuer Debugging und Monitoring.',
      qrRooms: 'QR Rooms',
      qrRoomsDescription: 'QR-Codes pro Zimmer erstellen, die WhatsApp mit Zimmerkontext oeffnen.'
    },
    inbox: {
      conversations: 'Unterhaltungen',
      activeThreads: '{count} aktive Vorgänge',
      guest: 'Gast',
      staff: 'Team',
      noConversations: 'Noch keine Unterhaltungen.',
      noConversationsDescription: 'Gästegespräche erscheinen, sobald Nachrichten empfangen werden.',
      noMessages: 'Noch keine Nachrichten',
      noPhone: 'Keine Telefonnummer',
      replyPlaceholder: 'Dem Gast antworten...',
      roomUnknown: 'Unbekanntes Zimmer',
      original: 'Original',
      staffTranslation: 'Übersetzung für die Rezeption',
      hideTranslation: 'Übersetzung ausblenden',
      showTranslation: 'Übersetzung anzeigen',
      unreadTotal: '{count} ungelesen',
      newCount: '{count} new',
      newConversation: 'Neu',
      needsAttention: 'Achtung',
      humanTotal: '{count} brauchen Mensch',
      needsHuman: 'Needs human',
      needsHumanFilter: 'Needs human',
      noNeedsHuman: 'Keine Unterhaltungen benoetigen menschliche Aufmerksamkeit.',
      receptionAttentionRequired: 'Aufmerksamkeit der Rezeption erforderlich',
      humanReason: 'Grund: {reason}',
      humanReasons: {
        low_confidence: 'niedrige Sicherheit',
        complaint_detected: 'Beschwerde erkannt',
        emergency_detected: 'Notfall erkannt',
        fallback_response: 'Fallback-Antwort',
        human_requested: 'Mensch angefordert',
        technical_issue_detected: 'sensibles technisches Problem'
      }
    },
    tickets: {
      count: '{count} Tickets',
      noTickets: 'Noch keine Tickets.',
      noTicketsDescription: 'Vom Backend erstellte Tickets erscheinen hier.',
      noMatchingTickets: 'Keine Tickets für diese Filter.',
      tryAnotherFilter: 'Versuchen Sie einen anderen Status, eine andere Priorität oder Kategorie.',
      noRoom: 'Kein Zimmer',
      noData: 'Keine Daten',
      noDescription: 'Keine Beschreibung',
      openedNow: 'Gerade geöffnet',
      openedMinutes: 'Seit {count} Min. offen',
      openedHours: 'Seit {count} Std. offen',
      openedDays: 'Seit {count} T. offen'
    },
    filters: {
      status: 'Status',
      priority: 'Priorität',
      category: 'Kategorie',
      all: 'Alle'
    },
    stats: {
      open: 'Offen',
      inProgress: 'In Bearbeitung',
      completedToday: 'Heute abgeschlossen',
      urgent: 'Dringend'
    },
    knowledge: {
      demoHotel: 'Demo-Hotel',
      loadingHotel: 'Hotel wird geladen...',
      loading: 'Laden',
      usefulCategories: 'Nützliche Kategorien',
      key: 'Schlüssel',
      value: 'Wert',
      saved: 'Gespeichert',
      savedEntry: 'Wissensdatenbank gespeichert.',
      addedEntry: 'Eintrag hinzugefügt.',
      deletedEntry: 'Eintrag gelöscht.'
    },
    analytics: {
      filters: {
        today: 'Heute',
        sevenDays: '7 Tage',
        thirtyDays: '30 Tage'
      },
      kpis: {
        managedMessages: 'Bearbeitete Nachrichten',
        ticketsCreated: 'Erstellte Tickets',
        resolutionRate: 'Loesungsrate',
        aiAutomation: 'KI-Automatisierung'
      },
      kpiHints: {
        managedMessages: 'Gaestegespraeche, die von Staynex bearbeitet wurden.',
        ticketsCreated: 'Generierte operative Anfragen.',
        resolutionRate: 'Abgeschlossene Tickets im Vergleich zu erstellten Tickets.',
        aiAutomation: 'Antworten ohne menschlichen Eingriff geloest.'
      },
      sections: {
        operationalOverview: 'Operative Uebersicht',
        guestIntelligence: 'Gaeste-Intelligence',
        businessImpact: 'Business Impact'
      },
      descriptions: {
        operationalOverview: 'Operatives Volumen und Teamleistung.',
        guestIntelligence: 'Von Staynex erkannte Gaestemuster.',
        businessImpact: 'Geschaetzter Einfluss auf Effizienz und Service.'
      },
      metrics: {
        messagesByDay: 'Nachrichten pro Tag',
        createdVsResolved: 'Tickets erstellt vs geloest',
        departmentTickets: 'Tickets nach Abteilung',
        detectedLanguages: 'Erkannte Sprachen',
        frequentCategories: 'Haeufigste Kategorien',
        peakHours: 'Spitzenzeiten'
      },
      impact: {
        timeSaved: 'Geschaetzte Zeitersparnis',
        instantReplies: 'Sofortantworten',
        urgentDetected: 'Erkannte dringende Vorfaelle',
        activeRooms: 'Zimmer mit meiste Aktivitaet'
      },
      created: 'Erstellt',
      resolved: 'Geloest',
      mockNotice: 'Mock-Daten fuer Demo. Bereit fuer Supabase Analytics.'
    },
    aiLogs: {
      filters: {
        all: 'Alle',
        housekeeping: 'Housekeeping',
        maintenance: 'Wartung',
        reception: 'Rezeption',
        knowledgeBase: 'Knowledge Base',
        ticketsOnly: 'Nur Tickets',
        lowConfidence: 'Niedrige Sicherheit'
      },
      stats: {
        logsToday: 'Logs heute',
        ticketsCreated: 'Erstellte Tickets',
        avgConfidence: 'Durchschn. Sicherheit',
        knowledgeHits: 'Knowledge Base Hits'
      },
      columns: {
        date: 'Datum',
        language: 'Sprache',
        intent: 'Erkannter Intent',
        room: 'Zimmer',
        ticket: 'Ticket',
        category: 'Kategorie',
        confidence: 'Confidence',
        guestMessage: 'Gaestenachricht',
        aiResponse: 'KI-Antwort'
      },
      searchPlaceholder: 'Nach Zimmer, Nachricht oder Intent suchen...',
      results: '{count} Logs',
      loading: 'AI Logs werden geladen...',
      empty: 'Noch keine AI Logs.',
      noMatches: 'Keine Logs fuer diese Filter.',
      ticketCreated: 'Created',
      noTicket: 'No ticket',
      detailTitle: 'Debug-Detail',
      selectLog: 'Waehlen Sie ein Log, um technische Details zu sehen.',
      closeDetail: 'Detail schliessen',
      unknown: 'Unbekannt',
      errors: {
        title: 'AI Logs konnten nicht geladen werden',
        loadFailed: 'Fehler beim Laden der AI Logs'
      }
    },
    qrRooms: {
      room: 'Zimmer',
      whatsappNumber: 'WhatsApp-Nummer',
      downloadQr: 'QR herunterladen',
      copyLink: 'Link kopieren',
      copied: 'Kopiert',
      openWhatsapp: 'WhatsApp oeffnen',
      qrAlt: 'QR fuer Zimmer {room}',
      missingWhatsappNumber: 'TWILIO_WHATSAPP_FROM konfigurieren'
    },
    settings: {
      knowledgeDescription: 'Bearbeiten Sie Hotelinformationen, mit denen Staynex Gästen antwortet.'
    }
  }
};
