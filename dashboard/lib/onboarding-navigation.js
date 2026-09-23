import { canAccess, canAccessRouteForContext } from './permissions.js';

// Exact destinations, not prefixes. This gate never grants a route/API permission.
export const ONBOARDING_DESTINATIONS = Object.freeze([
  '/dashboard/onboarding',
  '/dashboard/settings/users',
  '/dashboard/settings/pms',
  '/dashboard/knowledge',
  '/dashboard/health'
]);

export const shouldRedirectToOnboarding = ({ pathname, completed, role, platformRole = 'none' }) => (
  !completed
  && canAccess(role, 'onboarding')
  && !pathname.startsWith('/platform')
  && !(ONBOARDING_DESTINATIONS.includes(pathname) && canAccessRouteForContext(role, pathname, platformRole))
);

const adminHelp = 'Pide a un administrador del hotel que complete este requisito.';
const technicalHelp = 'El equipo técnico de Staynex debe revisar este requisito. Abrir Salud no lo completa ni autoriza envíos.';
const external = {
  guest_memory: 'El equipo técnico de Staynex debe mantener Guest Memory desactivado. Este requisito no se cambia desde el asistente.',
  send_automations: 'El equipo técnico de Staynex debe mantener los envíos automáticos desactivados. Completar la configuración no los activa.',
  security_baseline: 'El equipo técnico de Staynex debe verificar y registrar los controles de seguridad antes de operar en vivo.',
  human_fallback: 'El equipo técnico de Staynex debe verificar la atención humana y su protección en el servidor.',
  failure_rehearsal: 'Staynex y el responsable del hotel deben realizar y documentar el ensayo de fallos. No se acredita pulsando un botón.',
  observability: 'Consulta Salud. Si la información no está disponible, el equipo técnico de Staynex debe resolver la incidencia.',
  kill_switch: 'Consulta el estado en Salud. No es necesario activar respuestas automáticas para completar la configuración.'
};

export const getOnboardingAction = (id, { role, platformRole = 'none', fallback = false } = {}) => {
  const restricted = fallback || platformRole === 'support';
  const editable = (permission) => !restricted && canAccess(role, permission);
  const config = !restricted && (['owner', 'admin', 'manager'].includes(role)
    || ['super_admin', 'platform_admin', 'internal_only'].includes(platformRole));
  const definitions = {
    hotel: { allowed: config, step: 'hotel', label: 'Configurar hotel' },
    whatsapp: { allowed: config, step: 'whatsapp', label: 'Configurar WhatsApp', help: 'Guardar el número no verifica la conexión. Staynex y el proveedor deben confirmar su funcionamiento antes de operar en vivo.' },
    users: { allowed: editable('user_management'), href: '/dashboard/settings/users', label: 'Gestionar usuarios' },
    pms: { allowed: editable('pms_connections_manage'), href: '/dashboard/settings/pms', label: 'Configurar PMS', help: 'Si faltan credenciales o documentación, solicítalas al proveedor con el responsable del hotel. Guardar no verifica una conexión.' },
    knowledge: { allowed: editable('knowledge_base_manage'), href: '/dashboard/knowledge', label: 'Configurar información del hotel' }
  };
  const definition = definitions[id];
  if (definition) return definition.allowed ? definition : { label: null, help: adminHelp };
  return {
    label: canAccessRouteForContext(role, '/dashboard/health', platformRole) ? 'Consultar Salud' : null,
    href: canAccessRouteForContext(role, '/dashboard/health', platformRole) ? '/dashboard/health' : null,
    help: external[id] || technicalHelp
  };
};

// Existing sections in the Platform detail. Technical dependencies have no fake
// completion button; the return from an inspection is the same readiness panel.
export const getPlatformReadinessAction = (type) => {
  if (['hotel_location_timezone_integrity', 'whatsapp_connected'].includes(type)) return {
    href: type === 'whatsapp_connected' ? '#hotel-whatsapp' : '#hotel-profile',
    label: type === 'whatsapp_connected' ? 'Revisar número de WhatsApp' : 'Revisar perfil del hotel',
    help: type === 'whatsapp_connected' ? 'Guardar el número no acredita conexión ni verificación del proveedor.' : 'Guarda país, ciudad y zona horaria y revisa su validación.'
  };
  if (['users_configured', 'roles_configured'].includes(type)) return {
    href: '#hotel-users', label: 'Revisar asignaciones',
    help: 'Revisa los usuarios y sus estados. Las invitaciones pendientes no equivalen a usuarios activos. Las altas se gestionan en Usuarios por un administrador del hotel.'
  };
  if (['pms_connected', 'pms_sync_healthy', 'pms_intelligence_active'].includes(type)) return {
    href: '#hotel-pms', label: 'Revisar conexiones PMS',
    help: 'Un administrador del hotel configura el PMS en su espacio. Staynex y el proveedor deben resolver el acceso y verificar la sincronización; esta vista no conecta el PMS.'
  };
  const help = {
    whatsapp_business_verified: 'Staynex y el proveedor deben confirmar la verificación de WhatsApp Business.',
    webhook_healthy: 'El equipo técnico debe verificar la recepción de eventos con un ensayo autorizado. No se generan mensajes desde esta lista.',
    ai_concierge_active: 'El equipo técnico debe revisar la disponibilidad de IA; no la actives para completar esta lista.',
    translation_active: 'El equipo técnico debe revisar el servicio de traducción si no está disponible.',
    guest_intelligence_active: 'La ausencia de señales requiere revisión técnica; no generes datos ni actives Guest Memory para superar el requisito.',
    revenue_ai_active: 'Un administrador del hotel debe revisar el contenido y catálogo existentes en su espacio.',
    automations_preview_ready: 'El equipo técnico debe conservar el modo de prueba y los envíos desactivados.',
    provider_email_ready: 'Staynex y el proveedor de correo deben revisar la configuración y los errores antes de autorizar envíos.',
    resend_domain_verified: 'El responsable del dominio y Staynex deben confirmar su verificación con el proveedor de correo.',
    google_sheets_sync: 'El equipo técnico debe revisar la integración de informes. No se ejecuta una sincronización desde esta lista.',
    gdpr_cleanup_ready: 'El responsable de privacidad debe confirmar las reglas de conservación. Una limpieza requiere revisión y autorización separadas.',
    academy_completed: 'El responsable del hotel debe completar la formación en Academia y coordinar con Staynex el registro de la evidencia.',
    no_critical_errors: 'El equipo del hotel debe revisar y resolver las incidencias urgentes desde Tickets.',
    copilot_active: 'El equipo técnico debe revisar Copilot si no está disponible, sin activar envíos.',
    marketplace_ready: 'Un administrador del hotel debe revisar experiencias e información local; los proveedores externos requieren coordinación con Staynex.'
  };
  return { label: null, help: help[type] || technicalHelp };
};
