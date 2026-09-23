// Scoped onboarding phrases, registered with the existing dashboard translator.
export const onboardingPhrases = [
  [
    "Volver al asistente",
    "Return to setup"
  ],
  [
    "Preparación del hotel",
    "Hotel readiness"
  ],
  [
    "Guarda los cambios y vuelve al asistente para actualizar los requisitos. Abrir esta pantalla no los completa.",
    "Save your changes and return to setup to refresh requirements. Opening this page does not complete them."
  ],
  [
    "Preparación de la configuración",
    "Configuration readiness"
  ],
  [
    "Preparación de la demo",
    "Demo readiness"
  ],
  [
    "Preparación de automatizaciones en vivo",
    "Live automation readiness"
  ],
  [
    "Configurar información del hotel",
    "Configure hotel information"
  ],
  [
    "Consultar Salud",
    "View health"
  ],
  [
    "Pide a un administrador del hotel que complete este requisito.",
    "Ask a hotel administrator to complete this requirement."
  ]
];
export const onboardingEnglishPhrases = {
  "Knowledge": "Información del hotel",
  "Pilot Readiness": "Preparación del hotel",
  "Security baseline": "Controles de seguridad",
  "Human Fallback": "Atención humana",
  "Kill Switch": "Control de respuestas automáticas",
  "Observability": "Disponibilidad de información operativa",
  "Failure Rehearsal": "Ensayo de fallos",
  "Active users": "Usuarios activos",
  "Invited users": "Usuarios invitados",
  "Add hotel user": "Añadir usuario del hotel",
  "Choose whether this user is an Admin or Receptionist.": "Elige el perfil de administración o recepción.",
  "Email": "Correo electrónico",
  "Role": "Rol",
  "Status": "Estado",
  "Admin": "Administrador",
  "Receptionist": "Recepción",
  "active": "Activo",
  "invited": "Invitado",
  "disabled": "Desactivado",
  "Awaiting acceptance": "Pendiente de aceptación",
  "Legacy role": "Rol anterior",
  "Can configure the hotel, PMS, users, experiences and settings.": "Puede configurar el hotel, PMS, usuarios, experiencias y ajustes.",
  "Can manage Inbox, tickets, reservations, experience bookings, experiences and local knowledge.": "Puede gestionar Inbox, tickets, reservas, experiencias e información local.",
  "Existing advanced role. It can be changed to Admin or Receptionist from this screen.": "Rol avanzado existente. En esta pantalla puede cambiarse a administración o recepción.",
  "User invitation created locally.": "Asignación invitada guardada. Coordina el acceso con Staynex: esta pantalla no envía la invitación.",
  "User assignment updated.": "Asignación de usuario actualizada.",
  "User disabled.": "Usuario desactivado.",
  "Could not update user": "No se pudo guardar el usuario. Reintenta.",
  "Could not invite user": "No se pudo guardar la invitación. Reintenta.",
  "Could not load users": "No se pudieron cargar los usuarios.",
  "Refresh": "Actualizar",
  "Resend": "Reenviar",
  "Disable": "Desactivar",
  "Set default": "Marcar predeterminado",
  "Default": "Predeterminado"
};

export const readinessSpanishPhrases = {
  "hotel location timezone integrity": "Ubicación y zona horaria",
  "pms connected": "Configuración PMS",
  "pms sync healthy": "Sincronización PMS",
  "whatsapp connected": "Número de WhatsApp",
  "whatsapp business verified": "Verificación de WhatsApp Business",
  "webhook healthy": "Recepción de eventos",
  "ai concierge active": "Disponibilidad de IA",
  "translation active": "Traducción",
  "guest intelligence active": "Señales del huésped",
  "revenue ai active": "Contenido para recomendaciones",
  "automations preview ready": "Automatizaciones en modo de prueba",
  "provider email ready": "Correo a proveedores",
  "resend domain verified": "Verificación del dominio de correo",
  "google sheets sync": "Informes externos",
  "gdpr cleanup ready": "Conservación de datos",
  "academy completed": "Formación del equipo",
  "users configured": "Usuarios activos",
  "roles configured": "Roles de usuarios",
  "no critical errors": "Incidencias urgentes",
  "pms intelligence active": "Contexto PMS",
  "copilot active": "Copilot",
  "marketplace ready": "Experiencias e información local",
  "healthy": "Requisito acreditado",
  "warning": "Revisar",
  "critical": "Bloqueo crítico",
  "missing": "Pendiente",
  "unknown": "Sin confirmar",
  "Readiness": "Preparación",
  "Healthy checks": "Requisitos acreditados",
  "Warnings": "Avisos",
  "Critical blockers": "Bloqueos críticos",
  "Missing setup": "Configuración pendiente",
  "Recommended actions": "Siguientes pasos",
  "Live mode enabled": "Modo en vivo activo",
  "Ready for live": "Preparado para revisión live",
  "Not ready": "No preparado",
  "Enable Live Mode": "Activar modo en vivo",
  "Live Mode enabled": "Modo en vivo activo",
  "Enabling...": "Activando...",
  "No PMS connection is active.": "No hay una conexión PMS activa.",
  "WhatsApp number is missing.": "Falta el número de WhatsApp.",
  "WhatsApp Business verification is not marked complete.": "La verificación de WhatsApp Business está pendiente.",
  "Staff Academy completion is not marked yet.": "Falta acreditar la formación del equipo.",
  "Add active admin and receptionist users before launch.": "Falta administración o recepción activa antes de operar en vivo.",
  "Marca la base de seguridad como validada antes de go-live.": "El equipo técnico debe verificar y registrar los controles de seguridad antes de operar en vivo.",
  "Revisa los gates pendientes antes de declarar go-live.": "Revisa los requisitos pendientes antes de operar en vivo.",
  "Añade al menos una fuente o item activo antes de go-live.": "Añade contenido activo con información útil del hotel.",
  "Añade al menos un admin o manager activo antes de avanzar.": "Hace falta al menos un administrador o responsable activo. Una invitación pendiente no completa el requisito."
};

Object.assign(onboardingEnglishPhrases, {
  'Hotel users': 'Usuarios del hotel', 'Saving...': 'Guardando...', 'Created': 'Creado',
  'Local invitations are stored now. Email delivery can be added later.': 'Las asignaciones invitadas se guardan, pero esta pantalla no envía correos. Coordina con Staynex la aceptación del acceso.',
  'Email resend will be connected later': 'Envío de invitaciones no disponible. Coordina el acceso con Staynex.'
});

Object.assign(onboardingEnglishPhrases, {'Ready for Configuration':'Preparación de la configuración','Ready for Pilot Demo':'Preparación de la demo','Ready for Live Automations':'Preparación de automatizaciones en vivo'});

Object.assign(onboardingEnglishPhrases, {
  "Connect hotel PMS": "Configurar el PMS del hotel",
  "PMS Connections": "Conexiones PMS",
  "Safe PMS mode": "PMS en modo seguro",
  "Region": "Región",
  "Type": "Tipo",
  "Readiness": "Preparación",
  "No connection saved yet.": "Todavía no hay una configuración guardada.",
  "PMS management is available to hotel admins and platform admins.": "Un administrador del hotel o de Staynex debe gestionar esta configuración.",
  "Test Connection": "Comprobar conexión",
  "Sync Now": "Sincronizar ahora",
  "Sync locked": "Sincronización bloqueada",
  "Connect": "Configurar",
  "Start setup": "Preparar configuración",
  "Manage": "Gestionar",
  "Disconnect": "Desconectar",
  "Setup available": "Configuración disponible",
  "Live API": "API disponible; requiere verificación",
  "Store PMS credentials per hotel, test read-only access, and sync reservations into Staynex without touching folios, charges or room assignments.": "Guarda la configuración del PMS de este hotel. La comprobación de acceso y la sincronización son operaciones independientes; guardar no acredita una conexión verificada.",
  "Staynex only authenticates, reads reservations and imports them through the existing reservation token flow. Apaleo is live today; Pluriel, Ubikos and other PMS adapters are prepared as beta or coming-soon connectors without writing back to folios, charges or room assignments.": "Staynex es una capa sobre el PMS. Los conectores pendientes requieren intervención de Staynex y del proveedor. No se modifican folios, cargos ni asignaciones de habitación desde este recorrido."
});

Object.assign(onboardingEnglishPhrases, {'Manage connection':'Gestionar configuración'});

for (const pair of [['Título','Title'],['Clave','Key'],['Categoría','Category'],['Contenido','Content'],['Buscar información del hotel','Search hotel information'],['Filtrar por categoría','Filter by category'],['Todas las categorías','All categories']]) onboardingPhrases.push(pair);

Object.assign(onboardingEnglishPhrases, { 'Active': 'Activo', 'Inactive': 'Inactivo', 'Deactivate': 'Desactivar', 'Activate': 'Activar' });

Object.assign(onboardingEnglishPhrases, {
  'Hotel country, city and timezone integrity are verified.': 'País, ciudad y zona horaria verificados.',
  'PMS sync should be refreshed before launch.': 'Falta verificar una sincronización reciente del PMS.',
  'PMS sync is recent.': 'La sincronización del PMS es reciente.',
  'WhatsApp number is configured.': 'El número de WhatsApp está guardado.',
  'WhatsApp Business verification should be confirmed.': 'Falta confirmar la verificación de WhatsApp Business.',
  'WhatsApp Business is verified.': 'WhatsApp Business consta como verificado.',
  'No recent inbound webhook activity detected.': 'No se han detectado eventos de entrada recientes.',
  'Inbound activity has been received.': 'Se ha recibido actividad de entrada.',
  'AI Concierge is ready but should be tested.': 'Falta comprobar el funcionamiento de IA en un ensayo autorizado.',
  'AI Concierge has handled conversations.': 'Constan conversaciones atendidas por IA.',
  'Translation layer is enabled.': 'La capa de traducción está habilitada.',
  'Guest Intelligence needs conversation signals.': 'No constan señales de conversaciones para este requisito.',
  'Guest Intelligence has signals.': 'Constan señales de conversaciones.',
  'Add experiences or local knowledge.': 'Falta contenido de experiencias o información local.',
  'Revenue AI has catalog signals.': 'Consta contenido de catálogo para recomendaciones.',
  'Automations are safe for preview mode.': 'Automatizaciones disponibles en modo de prueba.',
  'Provider email has no failures.': 'No constan fallos de correo a proveedores.',
  'Provider email failures detected.': 'Constan fallos de correo a proveedores.',
  'Confirm Resend domain verification before live provider email.': 'Falta confirmar el dominio de correo antes de autorizar envíos.',
  'Run Google Sheets sync before external reporting.': 'Falta acreditar la sincronización de informes externos.',
  'Google Sheets has a sync timestamp.': 'Consta una fecha de sincronización de informes.',
  'Confirm GDPR retention policy.': 'Falta confirmar las reglas de conservación de datos.',
  'GDPR retention policy is configured.': 'Consta configuración de conservación de datos.',
  'Academy completion should be confirmed.': 'Falta acreditar la formación del equipo.',
  'Academy is marked complete.': 'La formación consta como completada.',
  'Add active admin and receptionist users.': 'Hace falta administración y recepción con acceso activo.',
  'Admin and receptionist users are active.': 'Hay administración y recepción con acceso activo.',
  'Hotel role model is configured.': 'El modelo de roles está configurado.',
  'No urgent operational blockers detected.': 'No constan incidencias operativas urgentes.',
  'Urgent operational tickets are open.': 'Hay incidencias operativas urgentes abiertas.',
  'PMS Intelligence should be verified.': 'Falta verificar el contexto operativo del PMS.',
  'PMS Intelligence is active.': 'El contexto operativo del PMS está disponible.',
  'AI Copilot is available for reception.': 'Copilot está disponible para recepción.',
  'Add marketplace or local recommendations.': 'Faltan experiencias o recomendaciones locales.',
  'Marketplace/local recommendations are ready.': 'Hay experiencias o recomendaciones locales disponibles.',
  'Branding management': 'Perfil del hotel', 'Workspace identity': 'Datos del hotel',
  'Hotel name': 'Nombre del hotel', 'Brand name': 'Marca', 'Country code': 'Código de país',
  'City': 'Ciudad', 'Timezone': 'Zona horaria', 'Brand color': 'Color principal',
  'Secondary color': 'Color secundario', 'Support email': 'Correo de soporte',
  'Verify timezone': 'Verificar zona horaria', 'Manual override': 'Confirmación manual',
  'Save branding': 'Guardar datos del hotel', 'PMS status': 'Configuración PMS',
  'No PMS connection configured.': 'No hay una configuración PMS guardada.',
  'Reset invitation': 'Restablecer invitación', 'Disable': 'Deshabilitar',
  'Hotel profile': 'Perfil del hotel', 'AI': 'IA', 'Staff': 'Equipo',
  'Security': 'Seguridad', 'Operations': 'Operación', 'Automations': 'Automatizaciones'
});
