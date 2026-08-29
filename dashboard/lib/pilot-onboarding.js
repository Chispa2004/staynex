import { evaluateHotelLocationTimezoneIntegrity } from '../../shared/location/hotel-location-integrity.js';
import { getGuestMemoryPilotStatus } from '../../shared/guest-memory/feature-flag.js';
import { getPilotAiSafetyReadiness } from '../../shared/pilot/ai-safety.js';
import { canAccessPlatform } from './permissions.js';
import { getPmsProvider, isPmsProviderLiveApi } from './pms-providers.js';

export const PILOT_STATUS = Object.freeze({
  COMPLETED: 'COMPLETADO',
  ACTION_REQUIRED: 'ACCIÓN NECESARIA',
  WAITING_EXTERNAL: 'ESPERANDO EXTERNO',
  OPTIONAL: 'OPCIONAL'
});

export const PILOT_STATUS_KEY = Object.freeze({
  COMPLETED: 'completed',
  ACTION_REQUIRED: 'action_required',
  WAITING_EXTERNAL: 'waiting_external',
  OPTIONAL: 'optional'
});

export const PILOT_STATUS_META = Object.freeze({
  [PILOT_STATUS.COMPLETED]: { key: PILOT_STATUS_KEY.COMPLETED, tone: 'emerald' },
  [PILOT_STATUS.ACTION_REQUIRED]: { key: PILOT_STATUS_KEY.ACTION_REQUIRED, tone: 'amber' },
  [PILOT_STATUS.WAITING_EXTERNAL]: { key: PILOT_STATUS_KEY.WAITING_EXTERNAL, tone: 'sky' },
  [PILOT_STATUS.OPTIONAL]: { key: PILOT_STATUS_KEY.OPTIONAL, tone: 'slate' }
});

export const PILOT_ONBOARDING_STEPS = Object.freeze([
  { id: 'hotel', label: 'HOTEL', title: 'Hotel', ctaLabel: 'Configurar hotel' },
  { id: 'users', label: 'USUARIOS', title: 'Usuarios', ctaLabel: 'Gestionar usuarios', href: '/dashboard/settings/users' },
  { id: 'pms', label: 'PMS', title: 'PMS', ctaLabel: 'Configurar PMS', href: '/dashboard/settings/pms' },
  { id: 'whatsapp', label: 'WHATSAPP', title: 'WhatsApp', ctaLabel: 'Configurar WhatsApp' },
  { id: 'knowledge', label: 'KNOWLEDGE', title: 'Knowledge', ctaLabel: 'Configurar Knowledge', href: '/dashboard/knowledge' },
  { id: 'readiness', label: 'PILOT READINESS', title: 'Pilot Readiness', ctaLabel: 'Revisar readiness', href: '/dashboard/health' }
]);

const LEGACY_STEP_MAP = Object.freeze({
  hotel_setup: 'hotel',
  pms_connection: 'pms',
  whatsapp_setup: 'whatsapp',
  knowledge_base: 'knowledge',
  ai_concierge: 'readiness',
  automations: 'readiness',
  test_flow: 'readiness',
  completion: 'readiness'
});

const CONFIGURATION_REDIRECT = '/dashboard/health';
const protectedConfigRoles = new Set(['owner', 'admin', 'manager']);
const goLivePmsStatuses = new Set(['configured', 'connected', 'healthy', 'synced', 'success', 'active']);
const blockedPmsStatuses = new Set(['archived', 'disabled', 'failed', 'not_configured']);

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizedStatus = (status) => String(status || '').trim().toLowerCase();

const normalizeRows = (rows) => (Array.isArray(rows) ? rows : []);

const safeMetadata = (hotel = {}) => {
  if (!hotel?.metadata) {
    return {};
  }

  if (typeof hotel.metadata === 'string') {
    try {
      return JSON.parse(hotel.metadata) || {};
    } catch {
      return {};
    }
  }

  return typeof hotel.metadata === 'object' ? hotel.metadata : {};
};

const isTruthyFlag = (value) => value === true || value === 'true';

const isActiveRow = (row = {}) => normalizedStatus(row.status || 'active') !== 'disabled'
  && row.active !== false
  && row.enabled !== false
  && row.is_active !== false;

const statusResult = ({
  id,
  title,
  status,
  description,
  actionLabel,
  href = null,
  step = id,
  details = [],
  readyForConfiguration = false,
  readyForGoLive = false,
  source = 'datos reales'
}) => ({
  id,
  title,
  status,
  statusKey: PILOT_STATUS_META[status]?.key || PILOT_STATUS_KEY.ACTION_REQUIRED,
  tone: PILOT_STATUS_META[status]?.tone || 'amber',
  description,
  actionLabel,
  href,
  step,
  details,
  readyForConfiguration: Boolean(readyForConfiguration),
  readyForGoLive: Boolean(readyForGoLive),
  source
});

export const normalizePilotOnboardingStep = (step) => {
  const normalized = String(step || '').trim();
  const mapped = LEGACY_STEP_MAP[normalized] || normalized;

  return PILOT_ONBOARDING_STEPS.some((item) => item.id === mapped)
    ? mapped
    : PILOT_ONBOARDING_STEPS[0].id;
};

export const normalizePilotCompletedSteps = (steps = []) => [
  ...new Set(normalizeRows(steps).map(normalizePilotOnboardingStep))
];

export const canModifyPilotProtectedConfig = ({ role = null, platformRole = 'none', fallback = false } = {}) => {
  if (fallback || platformRole === 'support') {
    return false;
  }

  return protectedConfigRoles.has(role)
    || canAccessPlatform(platformRole, 'platform_console')
    || ['super_admin', 'platform_admin', 'internal_only'].includes(platformRole);
};

export const evaluatePilotHotelProfile = (hotel = {}) => {
  const location = evaluateHotelLocationTimezoneIntegrity(hotel || {});
  const nameReady = hasText(hotel.name);
  const ready = nameReady && location.ready;
  const missing = [
    !nameReady ? 'Nombre del hotel' : null,
    !location.countryCode ? 'País' : null,
    !location.city ? 'Ciudad' : null,
    !location.timezone ? 'Zona horaria válida' : null,
    !['verified', 'manual_override'].includes(location.timezoneIntegrityStatus) ? 'Validación de zona horaria' : null
  ].filter(Boolean);

  return statusResult({
    id: 'hotel',
    title: 'Hotel',
    status: ready ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: ready
      ? 'Perfil, ciudad y zona horaria están validados para el piloto.'
      : `Falta revisar: ${missing.join(', ') || 'perfil del hotel'}.`,
    actionLabel: 'Configurar hotel',
    readyForConfiguration: ready,
    readyForGoLive: ready,
    details: [
      { label: 'Nombre', value: nameReady ? 'Configurado' : 'Pendiente' },
      { label: 'País', value: location.countryCode || 'Pendiente' },
      { label: 'Ciudad', value: location.city || 'Pendiente' },
      { label: 'Zona horaria', value: location.timezone || 'Pendiente' },
      {
        label: 'Validación',
        value: ['verified', 'manual_override'].includes(location.timezoneIntegrityStatus)
          ? location.timezoneIntegrityStatus === 'verified' ? 'Verificada' : 'Override manual'
          : 'Pendiente'
      }
    ]
  });
};

export const evaluatePilotUsers = (users = []) => {
  const activeUsers = normalizeRows(users).filter((user) => normalizedStatus(user.status || 'active') === 'active');
  const managers = activeUsers.filter((user) => (
    ['owner', 'admin', 'manager'].includes(user.role)
    && (hasText(user.email) || hasText(user.user_id) || hasText(user.id))
  ));
  const ready = managers.length > 0;

  return statusResult({
    id: 'users',
    title: 'Usuarios',
    status: ready ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: ready
      ? 'Hay al menos un admin o manager activo para operar el piloto.'
      : 'Añade al menos un admin o manager activo antes de avanzar.',
    actionLabel: 'Gestionar usuarios',
    href: '/dashboard/settings/users',
    readyForConfiguration: ready,
    readyForGoLive: ready,
    details: [
      { label: 'Admins/managers activos', value: managers.length },
      { label: 'Recepción', value: activeUsers.some((user) => user.role === 'receptionist') ? 'Configurada' : 'Opcional durante setup' }
    ]
  });
};

const pmsConnectionEnabled = (connection = {}) => (
  connection.enabled !== false && !blockedPmsStatuses.has(normalizedStatus(connection.sync_status))
);

const pmsCredentialsReady = (connection = {}) => Boolean(
  connection.credential_configured
  || connection.has_client_secret
  || connection.api_key_configured
  || connection.metadata?.credential_configured
);

export const isRealPilotPmsConnection = (connection = {}) => {
  if (!pmsConnectionEnabled(connection) || !pmsCredentialsReady(connection)) {
    return false;
  }

  const provider = getPmsProvider(connection.provider);
  const liveApi = isPmsProviderLiveApi(provider)
    || connection.connection_mode === 'live_api'
    || connection.metadata?.connection_mode === 'live_api'
    || connection.metadata?.setup_status === 'live_api';
  const syncStatus = normalizedStatus(connection.sync_status || 'configured');

  return liveApi && (goLivePmsStatuses.has(syncStatus) || !syncStatus);
};

export const evaluatePilotPms = ({
  pmsConnections = [],
  preferredProvider = 'ubikos'
} = {}) => {
  const connections = normalizeRows(pmsConnections).filter(pmsConnectionEnabled);
  const realConnection = connections.find(isRealPilotPmsConnection);
  const ubikosConnection = connections.find((connection) => connection.provider === 'ubikos');

  if (realConnection) {
    const provider = getPmsProvider(realConnection.provider);

    return statusResult({
      id: 'pms',
      title: 'PMS',
      status: PILOT_STATUS.COMPLETED,
      description: `${provider?.name || realConnection.provider || 'PMS'} está configurado con conexión real de lectura.`,
      actionLabel: 'Configurar PMS',
      href: '/dashboard/settings/pms',
      readyForConfiguration: true,
      readyForGoLive: true,
      details: [
        { label: 'Proveedor', value: provider?.name || realConnection.provider || 'PMS' },
        { label: 'Estado', value: realConnection.sync_status || 'Configurado' },
        { label: 'Modo', value: 'Lectura PMS' }
      ]
    });
  }

  if (preferredProvider === 'ubikos' || ubikosConnection) {
    return statusResult({
      id: 'pms',
      title: 'PMS',
      status: PILOT_STATUS.WAITING_EXTERNAL,
      description: 'Pendiente de acceso/documentación API de Ubikos.',
      actionLabel: 'Configurar PMS',
      href: '/dashboard/settings/pms',
      readyForConfiguration: true,
      readyForGoLive: false,
      details: [
        { label: 'Proveedor previsto', value: 'Ubikos' },
        { label: 'Estado', value: 'Esperando información externa' },
        { label: 'Escritura PMS', value: 'OFF' },
        { label: 'Webhooks PMS', value: 'OFF inicial' }
      ]
    });
  }

  if (connections.length) {
    const connection = connections[0];
    const provider = getPmsProvider(connection.provider);

    return statusResult({
      id: 'pms',
      title: 'PMS',
      status: PILOT_STATUS.WAITING_EXTERNAL,
      description: `${provider?.name || connection.provider || 'PMS'} necesita activación técnica antes de go-live.`,
      actionLabel: 'Configurar PMS',
      href: '/dashboard/settings/pms',
      readyForConfiguration: true,
      readyForGoLive: false,
      details: [
        { label: 'Proveedor', value: provider?.name || connection.provider || 'PMS' },
        { label: 'Estado', value: connection.sync_status || 'Pendiente' },
        { label: 'Modo', value: connection.connection_mode || connection.metadata?.connection_mode || 'Configuración manual' }
      ]
    });
  }

  return statusResult({
    id: 'pms',
    title: 'PMS',
    status: PILOT_STATUS.ACTION_REQUIRED,
    description: 'Selecciona o guarda el PMS que usará el hotel piloto.',
    actionLabel: 'Configurar PMS',
    href: '/dashboard/settings/pms',
    readyForConfiguration: false,
    readyForGoLive: false,
    details: [
      { label: 'Proveedor', value: 'Pendiente' },
      { label: 'Estado', value: 'Sin configuración' }
    ]
  });
};

export const evaluatePilotWhatsapp = (hotel = {}) => {
  const metadata = safeMetadata(hotel);
  const waitingExternal = ['waiting_external', 'pending_twilio', 'pending_staynex'].includes(
    normalizedStatus(hotel.whatsapp_setup_status || metadata.whatsapp_setup_status)
  );
  const configured = hasText(hotel.whatsapp_number);

  if (configured) {
    return statusResult({
      id: 'whatsapp',
      title: 'WhatsApp',
    status: PILOT_STATUS.COMPLETED,
    description: 'Número de WhatsApp guardado para el hotel. No se muestran tokens ni secretos.',
    actionLabel: 'Configurar WhatsApp',
    step: 'hotel',
    readyForConfiguration: true,
    readyForGoLive: true,
      details: [
        { label: 'Número', value: 'Guardado' },
        { label: 'Twilio', value: metadata.whatsapp_business_verified ? 'Verificado' : 'Confirmar antes de go-live' }
      ]
    });
  }

  if (waitingExternal) {
    return statusResult({
      id: 'whatsapp',
      title: 'WhatsApp',
    status: PILOT_STATUS.WAITING_EXTERNAL,
    description: 'La configuración requiere intervención Staynex/Twilio antes del go-live.',
    actionLabel: 'Configurar WhatsApp',
    step: 'hotel',
    readyForConfiguration: true,
    readyForGoLive: false,
      details: [
        { label: 'Número', value: 'Pendiente' },
        { label: 'Twilio', value: 'Esperando configuración externa' }
      ]
    });
  }

  return statusResult({
    id: 'whatsapp',
    title: 'WhatsApp',
    status: PILOT_STATUS.ACTION_REQUIRED,
    description: 'Añade un número usable de WhatsApp y confirma el setup operativo.',
    actionLabel: 'Configurar WhatsApp',
    step: 'hotel',
    readyForConfiguration: false,
    readyForGoLive: false,
    details: [
      { label: 'Número', value: 'Pendiente' },
      { label: 'Twilio', value: 'Pendiente' }
    ]
  });
};

const isUsableKnowledgeEntry = (entry = {}) => (
  isActiveRow(entry)
  && (
    hasText(entry.value)
    || hasText(entry.description)
    || hasText(entry.title)
    || hasText(entry.key)
  )
);

export const evaluatePilotKnowledge = ({
  knowledgeEntries = [],
  localKnowledge = []
} = {}) => {
  const activeHotelKnowledge = normalizeRows(knowledgeEntries).filter(isUsableKnowledgeEntry);
  const activeLocalKnowledge = normalizeRows(localKnowledge).filter(isUsableKnowledgeEntry);
  const activeCount = activeHotelKnowledge.length + activeLocalKnowledge.length;
  const ready = activeCount > 0;

  return statusResult({
    id: 'knowledge',
    title: 'Knowledge',
    status: ready ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: ready
      ? 'Hay contenido Knowledge activo para empezar el piloto.'
      : 'Añade al menos una fuente o item activo antes de go-live.',
    actionLabel: 'Configurar Knowledge',
    href: '/dashboard/knowledge',
    readyForConfiguration: ready,
    readyForGoLive: ready,
    details: [
      { label: 'Items activos', value: activeCount },
      { label: 'Autogeneración', value: 'No aplicada' }
    ]
  });
};

const evaluateFlagGate = ({
  id,
  title,
  ready,
  completedDescription,
  missingDescription,
  actionLabel = 'Revisar readiness',
  source = 'configuración'
}) => statusResult({
  id,
  title,
  status: ready ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
  description: ready ? completedDescription : missingDescription,
  actionLabel,
  href: '/dashboard/health',
  readyForConfiguration: ready,
  readyForGoLive: ready,
  details: [
    { label: 'Estado', value: ready ? 'Validado' : 'Pendiente' }
  ],
  source
});

export const evaluatePilotGuestMemory = (env = process.env) => {
  const guestMemory = getGuestMemoryPilotStatus(env);
  const off = !guestMemory.enabled;

  return statusResult({
    id: 'guest_memory',
    title: 'Guest Memory OFF',
    status: off ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: off
      ? 'Guest Memory está OFF para el piloto.'
      : 'Guest Memory debe estar OFF para este piloto.',
    actionLabel: 'Revisar readiness',
    href: '/dashboard/health',
    readyForConfiguration: off,
    readyForGoLive: off,
    details: [
      { label: 'Guest Memory', value: off ? 'OFF' : 'ON' }
    ],
    source: guestMemory.envVar
  });
};

export const evaluatePilotSendAutomations = (env = process.env) => {
  const off = env?.SEND_AUTOMATIONS !== 'true';

  return statusResult({
    id: 'send_automations',
    title: 'Envíos automáticos',
    status: off ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: off
      ? 'Los envíos automáticos siguen desactivados para la configuración piloto.'
      : 'Desactiva SEND_AUTOMATIONS antes de operar el piloto.',
    actionLabel: 'Revisar readiness',
    href: '/dashboard/health',
    readyForConfiguration: off,
    readyForGoLive: off,
    details: [
      { label: 'Automations', value: off ? 'OFF' : 'ON' }
    ],
    source: 'SEND_AUTOMATIONS'
  });
};

const metadataOrEnvFlag = ({ hotel, env, metadataKeys = [], envKeys = [] }) => {
  const metadata = safeMetadata(hotel);

  return metadataKeys.some((key) => isTruthyFlag(metadata[key]))
    || envKeys.some((key) => env?.[key] === 'true');
};

export const evaluatePilotSecurityBaseline = ({ hotel = {}, env = process.env } = {}) => evaluateFlagGate({
  id: 'security_baseline',
  title: 'Security baseline',
  ready: metadataOrEnvFlag({
    hotel,
    env,
    metadataKeys: ['security_baseline_passed', 'pilot_security_baseline_passed'],
    envKeys: ['PILOT_SECURITY_BASELINE_PASSED']
  }),
  completedDescription: 'La base de seguridad del piloto está marcada como validada.',
  missingDescription: 'Marca la base de seguridad como validada antes de go-live.',
  source: 'metadata/env'
});

export const evaluatePilotHumanFallback = ({ hotel = {}, env = process.env } = {}) => {
  const safety = getPilotAiSafetyReadiness({ hotel, env });
  const ready = safety.humanFallback.ready;

  return statusResult({
    id: 'human_fallback',
    title: 'Human Fallback',
    status: ready ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: ready
      ? 'Takeover, atención humana y gate central están activos para inbound.'
      : 'El fallback humano necesita runtime, UI de takeover y gate central.',
    actionLabel: 'Revisar Inbox',
    href: '/dashboard/inbox',
    readyForConfiguration: ready,
    readyForGoLive: ready,
    details: [
      { label: 'Fuente durable', value: safety.humanFallback.source },
      { label: 'Gate central', value: safety.runtime.centralGate },
      { label: 'Histórico', value: safety.runtime.resumeReprocessesHistory ? 'Reprocesa' : 'No reprocesa' }
    ],
    source: safety.humanFallback.source
  });
};

export const evaluatePilotKillSwitch = ({ hotel = {}, env = process.env } = {}) => {
  const safety = getPilotAiSafetyReadiness({ hotel, env });
  const ready = safety.killSwitch.ready;

  return statusResult({
    id: 'kill_switch',
    title: 'Kill Switch',
    status: ready ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: ready
      ? `Kill Switch operativo. Estado hotel: ${safety.hotelStatus.enabled ? 'ON' : 'OFF'}.`
      : 'Configura el estado HOTEL AI AUTO-REPLY ON/OFF antes del piloto.',
    actionLabel: 'Revisar Kill Switch',
    href: '/dashboard/health',
    readyForConfiguration: ready,
    readyForGoLive: ready,
    details: [
      { label: 'Hotel', value: safety.hotelStatus.label },
      { label: 'Global', value: safety.globalStatus.label },
      { label: 'Fuente', value: safety.hotelStatus.source }
    ],
    source: safety.hotelStatus.source
  });
};

export const buildPilotReadinessBlock = ({
  hotelBlock,
  usersBlock,
  pmsBlock,
  whatsappBlock,
  knowledgeBlock,
  guestMemoryBlock,
  sendAutomationsBlock,
  securityBaselineBlock,
  humanFallbackBlock,
  killSwitchBlock
}) => {
  const checks = [
    hotelBlock,
    usersBlock,
    pmsBlock,
    whatsappBlock,
    knowledgeBlock,
    guestMemoryBlock,
    securityBaselineBlock,
    sendAutomationsBlock,
    humanFallbackBlock,
    killSwitchBlock
  ];
  const readyForGoLive = checks.every((item) => item.readyForGoLive);

  return statusResult({
    id: 'readiness',
    title: 'Pilot Readiness',
    status: readyForGoLive ? PILOT_STATUS.COMPLETED : PILOT_STATUS.ACTION_REQUIRED,
    description: readyForGoLive
      ? 'Todos los gates obligatorios están listos para go-live.'
      : 'Revisa los gates pendientes antes de declarar go-live.',
    actionLabel: 'Revisar readiness',
    href: '/dashboard/health',
    readyForConfiguration: checks.every((item) => (
      ['pms', 'whatsapp'].includes(item.id)
        ? item.readyForConfiguration || item.status === PILOT_STATUS.WAITING_EXTERNAL
        : ['security_baseline', 'human_fallback', 'kill_switch'].includes(item.id)
          ? true
          : item.readyForConfiguration
    )),
    readyForGoLive,
    details: checks.map((item) => ({
      id: item.id,
      label: item.title,
      value: item.status,
      tone: item.tone,
      description: item.description,
      actionLabel: item.actionLabel,
      href: item.href,
      step: item.step
    }))
  });
};

export const buildPilotOnboardingSummary = ({
  hotel = {},
  users = [],
  pmsConnections = [],
  knowledgeEntries = [],
  localKnowledge = [],
  env = process.env,
  preferredPmsProvider = null,
  role = null,
  platformRole = 'none',
  fallback = false
} = {}) => {
  const metadata = safeMetadata(hotel);
  const resolvedPreferredPmsProvider = preferredPmsProvider
    || metadata.pilot_pms_provider
    || metadata.pms_provider
    || hotel.pms_provider
    || 'ubikos';
  const hotelBlock = evaluatePilotHotelProfile(hotel);
  const usersBlock = evaluatePilotUsers(users);
  const pmsBlock = evaluatePilotPms({ pmsConnections, preferredProvider: resolvedPreferredPmsProvider });
  const whatsappBlock = evaluatePilotWhatsapp(hotel);
  const knowledgeBlock = evaluatePilotKnowledge({ knowledgeEntries, localKnowledge });
  const guestMemoryBlock = evaluatePilotGuestMemory(env);
  const sendAutomationsBlock = evaluatePilotSendAutomations(env);
  const securityBaselineBlock = evaluatePilotSecurityBaseline({ hotel, env });
  const humanFallbackBlock = evaluatePilotHumanFallback({ hotel, env });
  const killSwitchBlock = evaluatePilotKillSwitch({ hotel, env });
  const readinessBlock = buildPilotReadinessBlock({
    hotelBlock,
    usersBlock,
    pmsBlock,
    whatsappBlock,
    knowledgeBlock,
    guestMemoryBlock,
    sendAutomationsBlock,
    securityBaselineBlock,
    humanFallbackBlock,
    killSwitchBlock
  });
  const blocks = [
    hotelBlock,
    usersBlock,
    pmsBlock,
    whatsappBlock,
    knowledgeBlock,
    readinessBlock
  ];
  const readyForConfiguration = hotelBlock.readyForConfiguration
    && usersBlock.readyForConfiguration
    && pmsBlock.readyForConfiguration
    && whatsappBlock.readyForConfiguration
    && knowledgeBlock.readyForConfiguration
    && guestMemoryBlock.readyForConfiguration
    && sendAutomationsBlock.readyForConfiguration;
  const readyForGoLive = readinessBlock.readyForGoLive;

  return {
    mode: 'pilot_onboarding',
    statuses: PILOT_STATUS,
    blocks,
    readinessChecks: readinessBlock.details,
    gates: {
      guestMemory: guestMemoryBlock,
      sendAutomations: sendAutomationsBlock,
      securityBaseline: securityBaselineBlock,
      humanFallback: humanFallbackBlock,
      killSwitch: killSwitchBlock
    },
    readyForConfiguration,
    readyForGoLive,
    readyLabels: {
      configuration: readyForConfiguration ? 'READY FOR CONFIGURATION' : 'NO LISTO PARA CONFIGURACIÓN',
      goLive: readyForGoLive ? 'READY FOR GO-LIVE' : 'NO LISTO PARA GO-LIVE'
    },
    completion: {
      canCompleteConfiguration: readyForConfiguration,
      redirectHref: CONFIGURATION_REDIRECT
    },
    permissions: {
      canModifyProtectedConfig: canModifyPilotProtectedConfig({ role, platformRole, fallback })
    }
  };
};

export const getPilotCompletionRedirect = (summary = {}) => (
  summary.readyForConfiguration ? CONFIGURATION_REDIRECT : '/dashboard/onboarding'
);
