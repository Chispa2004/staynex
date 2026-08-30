import {
  PILOT_AI_GATE_REASONS,
  buildSuppressedAiResponse,
  getGlobalAiAutoReplyStatus,
  getHotelAiAutoReplyStatus,
  getPilotAiSafetyReadiness,
  shouldAiAutoRespond
} from './ai-safety.js';
import {
  PILOT_JOURNEY_CERTIFICATION,
  PILOT_JOURNEY_STATUSES,
  PILOT_LIVE_SEND_BLOCKERS
} from '../automations/pilot-journeys.js';

export const PILOT_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  ACTION_REQUIRED: 'ACTION REQUIRED',
  BLOCKED: 'BLOCKED'
});

export const PILOT_FAILURE_REHEARSAL_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_TESTABLE_YET: 'NOT TESTABLE YET'
});

export const PILOT_LIVE_AUTOMATION_BLOCKERS = Object.freeze([
  'Quiet Hours/send-time runtime',
  'outbound atomic delivery',
  'real WhatsApp',
  'real PMS',
  'monitoring',
  'Kill Switch',
  'Human Fallback'
]);

const STATUS_RANK = Object.freeze({
  [PILOT_HEALTH_STATUS.HEALTHY]: 0,
  [PILOT_HEALTH_STATUS.DEGRADED]: 1,
  [PILOT_HEALTH_STATUS.ACTION_REQUIRED]: 2,
  [PILOT_HEALTH_STATUS.BLOCKED]: 3
});

const SECRET_PATTERN = /(secret|token|password|authorization|bearer\s+|basic\s+|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|twilio_auth|openai|sk-[a-z0-9_-]+|AC[a-z0-9]{20,}|SG\.[a-z0-9_-]+)/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_PATTERN = /https?:\/\/\S+/gi;
const PHONE_FIELD_PATTERN = /(phone|telefono|whatsapp_number|send_to|recipient)/i;
const OPEN_STATUSES = new Set(['open', 'active', 'needs_human', 'pending', 'new']);
const RESOLVED_TICKET_STATUSES = new Set(['closed', 'completed', 'resolved']);
const PMS_DISABLED_STATUSES = new Set(['archived', 'disabled', 'not_configured']);
const PMS_FAILED_STATUSES = new Set(['failed', 'error', 'degraded']);
const AUTOMATION_PROBLEM_STATUSES = new Set(['failed', 'retry', 'dead_letter']);
const AUTOMATION_BLOCKED_STATUSES = new Set(['blocked', 'skipped']);

const safeArray = (value) => (Array.isArray(value) ? value : []);

const safeObject = (value) => {
  if (!value) return {};

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof value === 'object' && !Array.isArray(value) ? value : {};
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const nowIso = () => new Date().toISOString();

const parseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const hoursSince = (value, now = new Date()) => {
  const date = parseDate(value);
  const reference = parseDate(now) || new Date();
  if (!date) return null;

  const hours = (reference.getTime() - date.getTime()) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
};

const isStale = (value, maxHours, now = new Date()) => {
  const hours = hoursSince(value, now);
  return hours === null || hours > maxHours;
};

const safeCount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const includesUnsafeText = (value) => {
  const text = JSON.stringify(value || {});
  return SECRET_PATTERN.test(text) || (PHONE_FIELD_PATTERN.test(text) && PHONE_PATTERN.test(text));
};

export const sanitizePilotOperationalMessage = (value, fallback = 'Detalle operativo ocultado por seguridad.') => {
  if (!value) return null;

  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;

  if (SECRET_PATTERN.test(text)) {
    return fallback;
  }

  return text
    .replace(new RegExp(PHONE_PATTERN.source, 'g'), '[telefono oculto]')
    .replace(URL_PATTERN, '[url oculta]')
    .slice(0, 180);
};

const component = ({
  id,
  label,
  status = PILOT_HEALTH_STATUS.HEALTHY,
  why,
  action = null,
  href = null,
  details = {}
}) => ({
  id,
  label,
  status,
  why,
  action,
  href,
  details
});

const worstPilotStatus = (statuses = []) => statuses.reduce((worst, status) => (
  (STATUS_RANK[status] ?? 0) > (STATUS_RANK[worst] ?? 0) ? status : worst
), PILOT_HEALTH_STATUS.HEALTHY);

const isEnabledPmsConnection = (connection = {}) => (
  connection.enabled !== false
  && !PMS_DISABLED_STATUSES.has(normalizeStatus(connection.sync_status || connection.status))
);

const isOpenTicket = (ticket = {}) => !RESOLVED_TICKET_STATUSES.has(normalizeStatus(ticket.status || 'open'));

const isHumanAttentionConversation = (conversation = {}) => {
  const metadata = safeObject(conversation.metadata || conversation.state_metadata);
  const mode = normalizeStatus(
    metadata.conversation_ai_mode
    || conversation.conversation_ai_mode
    || conversation.ai_mode
  );

  return normalizeStatus(conversation.status) === 'needs_human'
    || Boolean(conversation.needs_human)
    || Boolean(conversation.requires_human)
    || ['human_takeover', 'ai_paused', 'escalation_lock', 'human'].includes(mode);
};

const isHumanAttentionState = (state = {}) => {
  const metadata = safeObject(state.state_metadata);
  const mode = normalizeStatus(
    metadata.conversation_ai_mode
    || state.conversation_ai_mode
    || state.ai_mode
  );

  return ['human_takeover', 'ai_paused', 'escalation_lock', 'human'].includes(mode)
    || Boolean(state.human_takeover)
    || Boolean(metadata.human_takeover)
    || normalizeStatus(state.escalation_level).includes('reception');
};

const isWhatsappMessage = (message = {}) => (
  normalizeStatus(message.channel) === 'whatsapp'
  || normalizeStatus(message.provider) === 'twilio'
  || normalizeStatus(message.ai_provider) === 'twilio'
  || normalizeStatus(message.metadata?.provider) === 'twilio'
);

const isAiProviderFailure = (log = {}) => {
  const metadata = safeObject(log.metadata);
  const status = normalizeStatus(log.status || log.provider_status || metadata.status);

  return status === 'failed'
    || status === 'error'
    || Boolean(log.openai_error)
    || Boolean(log.provider_error)
    || Boolean(metadata.openai_error)
    || Boolean(metadata.provider_error)
    || normalizeStatus(log.ai_provider || log.provider) === 'openai_error';
};

const buildBackendComponent = ({ dataIssues = [] } = {}) => {
  if (safeArray(dataIssues).length) {
    return component({
      id: 'backend',
      label: 'Backend',
      status: PILOT_HEALTH_STATUS.DEGRADED,
      why: 'La UI esta disponible, pero parte del health no se pudo cargar.',
      action: 'Revisar el request id y repetir health.',
      details: {
        healthEndpoint: '/health',
        degradedSources: dataIssues.map((issue) => issue.label).filter(Boolean)
      }
    });
  }

  return component({
    id: 'backend',
    label: 'Backend',
    status: PILOT_HEALTH_STATUS.HEALTHY,
    why: '/health disponible y request ids activos.',
    action: 'Mantener revision diaria.',
    details: {
      healthEndpoint: '/health',
      requestIds: true
    }
  });
};

const buildPmsComponent = ({ pmsConnections = [], now = new Date() } = {}) => {
  const activePms = safeArray(pmsConnections).find(isEnabledPmsConnection);

  if (!activePms) {
    return component({
      id: 'pms',
      label: 'PMS',
      status: PILOT_HEALTH_STATUS.ACTION_REQUIRED,
      why: 'No hay PMS activo para el hotel piloto.',
      action: 'Configurar o verificar PMS antes de operar con datos reales.',
      href: '/dashboard/settings/pms',
      details: {
        configured: false,
        enabled: false,
        lastSyncAt: null,
        staleSync: true,
        lastError: null
      }
    });
  }

  const lastSyncAt = activePms.last_sync_at || activePms.lastSyncAt || null;
  const lastError = sanitizePilotOperationalMessage(activePms.last_sync_error || activePms.lastSyncError);
  const failed = PMS_FAILED_STATUSES.has(normalizeStatus(activePms.sync_status || activePms.status)) || Boolean(lastError);
  const staleSync = isStale(lastSyncAt, 48, now);
  const status = failed
    ? PILOT_HEALTH_STATUS.DEGRADED
    : staleSync
      ? PILOT_HEALTH_STATUS.ACTION_REQUIRED
      : PILOT_HEALTH_STATUS.HEALTHY;

  return component({
    id: 'pms',
    label: 'PMS',
    status,
    why: failed
      ? `El PMS esta configurado, pero el ultimo sync fallo: ${lastError || 'error seguro registrado'}.`
      : staleSync
        ? 'El PMS esta configurado, pero el ultimo sync no es reciente.'
        : 'PMS configurado y sync reciente.',
    action: status === PILOT_HEALTH_STATUS.HEALTHY ? 'Mantener revision diaria.' : 'Revisar conexion PMS y confirmar datos recientes.',
    href: '/dashboard/settings/pms',
    details: {
      configured: true,
      enabled: activePms.enabled !== false,
      provider: activePms.provider || 'PMS',
      lastSyncAt,
      staleSync,
      lastError
    }
  });
};

const buildWhatsappComponent = ({ hotel = {}, scheduledMessages = [], env = process.env } = {}) => {
  const metadata = safeObject(hotel.metadata);
  const configured = Boolean(hotel.whatsapp_number || metadata.whatsapp_configured || metadata.whatsapp_business_verified);
  const inboundReady = Boolean(configured && (env.TWILIO_AUTH_TOKEN || metadata.twilio_webhook_validated || metadata.whatsapp_inbound_ready));
  const outboundReady = Boolean(configured && (env.TWILIO_WHATSAPP_FROM || metadata.whatsapp_outbound_ready));
  const failedOutbound = safeArray(scheduledMessages).filter((message) => (
    isWhatsappMessage(message)
    && AUTOMATION_PROBLEM_STATUSES.has(normalizeStatus(message.status))
  ));
  const lastError = failedOutbound
    .map((message) => sanitizePilotOperationalMessage(
      message.error_message
      || message.last_error
      || message.metadata?.error
      || message.metadata?.twilio_error
      || message.status
    ))
    .find(Boolean);

  if (!configured) {
    return component({
      id: 'whatsapp',
      label: 'WhatsApp',
      status: PILOT_HEALTH_STATUS.ACTION_REQUIRED,
      why: 'WhatsApp no esta configurado para el hotel.',
      action: 'Configurar WhatsApp antes de usar un hotel real.',
      details: {
        configured: false,
        inboundReadiness: false,
        outboundReadiness: false,
        recentSafeError: null
      }
    });
  }

  if (failedOutbound.length) {
    return component({
      id: 'whatsapp',
      label: 'WhatsApp',
      status: PILOT_HEALTH_STATUS.DEGRADED,
      why: `Hay fallos recientes de entrega WhatsApp: ${lastError || 'error seguro registrado'}.`,
      action: 'Revisar Inbox y estado Twilio sin reenviar automaticamente.',
      href: '/dashboard/inbox',
      details: {
        configured,
        inboundReadiness: inboundReady,
        outboundReadiness: outboundReady,
        recentSafeError: lastError,
        failedOutbound: failedOutbound.length
      }
    });
  }

  return component({
    id: 'whatsapp',
    label: 'WhatsApp',
    status: inboundReady && outboundReady ? PILOT_HEALTH_STATUS.HEALTHY : PILOT_HEALTH_STATUS.ACTION_REQUIRED,
    why: inboundReady && outboundReady
      ? 'WhatsApp configurado para inbound y outbound.'
      : 'WhatsApp esta guardado, pero falta confirmar inbound/outbound antes de live.',
    action: inboundReady && outboundReady ? 'Mantener prueba diaria.' : 'Confirmar webhook inbound y remitente outbound.',
    details: {
      configured,
      inboundReadiness: inboundReady,
      outboundReadiness: outboundReady,
      recentSafeError: null
    }
  });
};

const buildAiComponent = ({ hotel = {}, conversationStates = [], aiLogs = [], env = process.env } = {}) => {
  const safety = getPilotAiSafetyReadiness({ hotel, env });
  const gate = shouldAiAutoRespond({
    hotel,
    conversationState: null,
    env
  });
  const providerFailures = safeArray(aiLogs).filter(isAiProviderFailure);
  const providerConfigured = Boolean(env.OPENAI_API_KEY || env.USE_MOCK_AI === 'true' || safeObject(hotel.metadata).openai_provider_configured || aiLogs.length);
  const humanFallbackUsable = Boolean(safety.humanFallback.ready);
  const humanAttentionStates = safeArray(conversationStates).filter(isHumanAttentionState);

  if (!humanFallbackUsable) {
    return component({
      id: 'ai',
      label: 'AI',
      status: PILOT_HEALTH_STATUS.ACTION_REQUIRED,
      why: 'El fallback humano no esta disponible.',
      action: 'Revisar Inbox takeover y gate central.',
      href: '/dashboard/inbox',
      details: {
        autoReplyEnabled: Boolean(safety.hotelStatus.enabled),
        globalKill: safety.globalStatus.allowed === false,
        hotelKill: safety.hotelStatus.allowed === false,
        providerAvailable: providerConfigured,
        humanFallbackUsable
      }
    });
  }

  if (!providerConfigured || providerFailures.length) {
    return component({
      id: 'ai',
      label: 'AI',
      status: PILOT_HEALTH_STATUS.DEGRADED,
      why: providerFailures.length
        ? 'OpenAI esta degradado o ha fallado; la respuesta automatica debe escalar.'
        : 'Proveedor AI no confirmado para live.',
      action: 'Mantener Inbox manual y revisar escalaciones.',
      href: '/dashboard/inbox',
      details: {
        autoReplyEnabled: Boolean(safety.hotelStatus.enabled),
        globalKill: safety.globalStatus.allowed === false,
        hotelKill: safety.hotelStatus.allowed === false,
        providerAvailable: providerConfigured && providerFailures.length === 0,
        providerFailures: providerFailures.length,
        humanFallbackUsable,
        suppressedResponse: buildSuppressedAiResponse({ reason: PILOT_AI_GATE_REASONS.AI_PROVIDER_FAILURE }).intent
      }
    });
  }

  if (!gate.allowed) {
    return component({
      id: 'ai',
      label: 'AI',
      status: PILOT_HEALTH_STATUS.DEGRADED,
      why: safety.globalStatus.allowed === false
        ? 'Kill switch global activo; operacion manual disponible.'
        : 'Kill switch del hotel apagado o sin configurar; operacion manual disponible.',
      action: 'Confirmar estado del kill switch antes de demo/live.',
      href: '/dashboard/health',
      details: {
        autoReplyEnabled: Boolean(safety.hotelStatus.enabled),
        globalKill: safety.globalStatus.allowed === false,
        hotelKill: safety.hotelStatus.allowed === false,
        providerAvailable: true,
        humanFallbackUsable,
        conversationsNeedingHuman: humanAttentionStates.length
      }
    });
  }

  return component({
    id: 'ai',
    label: 'AI',
    status: PILOT_HEALTH_STATUS.HEALTHY,
    why: 'Auto-reply habilitado, proveedor disponible y fallback humano usable.',
    action: 'Revisar escalaciones diariamente.',
    href: '/dashboard/inbox',
    details: {
      autoReplyEnabled: true,
      globalKill: false,
      hotelKill: false,
      providerAvailable: true,
      humanFallbackUsable,
      conversationsNeedingHuman: humanAttentionStates.length
    }
  });
};

const buildAutomationComponent = ({ scheduledMessages = [], env = process.env } = {}) => {
  const certifiedJourneys = PILOT_JOURNEY_CERTIFICATION.filter((journey) => (
    journey.status === PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW
  ));
  const automationProblems = safeArray(scheduledMessages).filter((message) => AUTOMATION_PROBLEM_STATUSES.has(normalizeStatus(message.status)));
  const blockedMessages = safeArray(scheduledMessages).filter((message) => AUTOMATION_BLOCKED_STATUSES.has(normalizeStatus(message.status)));
  const sendAutomationsOn = env.SEND_AUTOMATIONS === 'true';

  if (automationProblems.length) {
    return component({
      id: 'automations',
      label: 'Automations',
      status: PILOT_HEALTH_STATUS.DEGRADED,
      why: 'Hay automatizaciones fallidas o en retry; no deben reenviarse automaticamente.',
      action: 'Revisar motivo en Automations/Test Center.',
      href: '/dashboard/automations',
      details: {
        sendAutomations: sendAutomationsOn ? 'ON' : 'OFF',
        previewRuntimeHealthy: certifiedJourneys.length >= 4,
        liveSendExplicitlyOff: !sendAutomationsOn,
        certifiedJourneys: certifiedJourneys.length,
        automationProblems: automationProblems.length,
        blockedMessages: blockedMessages.length
      }
    });
  }

  if (certifiedJourneys.length < 4) {
    return component({
      id: 'automations',
      label: 'Automations',
      status: PILOT_HEALTH_STATUS.ACTION_REQUIRED,
      why: 'No estan certificados los cuatro journeys piloto para preview.',
      action: 'Revisar matriz de certificacion.',
      href: '/dashboard/automations',
      details: {
        sendAutomations: sendAutomationsOn ? 'ON' : 'OFF',
        previewRuntimeHealthy: false,
        liveSendExplicitlyOff: !sendAutomationsOn,
        certifiedJourneys: certifiedJourneys.length
      }
    });
  }

  if (!sendAutomationsOn) {
    return component({
      id: 'automations',
      label: 'Automations',
      status: PILOT_HEALTH_STATUS.BLOCKED,
      why: 'Live send esta desactivado por diseno; preview runtime saludable.',
      action: 'Mantener SEND_AUTOMATIONS=false hasta cerrar gates live.',
      href: '/dashboard/automations',
      details: {
        sendAutomations: 'OFF',
        previewRuntimeHealthy: true,
        liveSendExplicitlyOff: true,
        certifiedJourneys: certifiedJourneys.length,
        certifiedJourneyStatus: PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW,
        blockersBeforeLive: PILOT_LIVE_SEND_BLOCKERS
      }
    });
  }

  return component({
    id: 'automations',
    label: 'Automations',
    status: PILOT_HEALTH_STATUS.ACTION_REQUIRED,
    why: 'SEND_AUTOMATIONS esta ON; faltan gates live antes de permitir envio real.',
    action: 'Apagar live send o completar gates live.',
    href: '/dashboard/automations',
    details: {
      sendAutomations: 'ON',
      previewRuntimeHealthy: true,
      liveSendExplicitlyOff: false,
      certifiedJourneys: certifiedJourneys.length,
      blockersBeforeLive: PILOT_LIVE_AUTOMATION_BLOCKERS
    }
  });
};

const buildOperationsComponent = ({ tickets = [], conversations = [], conversationStates = [] } = {}) => {
  const openTickets = safeArray(tickets).filter(isOpenTicket);
  const urgentTickets = openTickets.filter((ticket) => normalizeStatus(ticket.priority) === 'urgent');
  const conversationsNeedingHuman = [
    ...safeArray(conversations).filter(isHumanAttentionConversation),
    ...safeArray(conversationStates).filter(isHumanAttentionState)
  ];

  if (urgentTickets.length) {
    return component({
      id: 'operations',
      label: 'Operations',
      status: PILOT_HEALTH_STATUS.ACTION_REQUIRED,
      why: `${urgentTickets.length} ticket urgente sigue abierto.`,
      action: 'Resolver ticket urgente antes de declarar piloto estable.',
      href: '/dashboard/tickets',
      details: {
        openTickets: openTickets.length,
        urgentTickets: urgentTickets.length,
        conversationsNeedingHuman: conversationsNeedingHuman.length
      }
    });
  }

  if (conversationsNeedingHuman.length || openTickets.length) {
    return component({
      id: 'operations',
      label: 'Operations',
      status: PILOT_HEALTH_STATUS.DEGRADED,
      why: conversationsNeedingHuman.length
        ? `${conversationsNeedingHuman.length} conversacion necesita atencion humana.`
        : `${openTickets.length} ticket abierto necesita seguimiento.`,
      action: 'Abrir Inbox/Tickets y resolver manualmente.',
      href: conversationsNeedingHuman.length ? '/dashboard/inbox' : '/dashboard/tickets',
      details: {
        openTickets: openTickets.length,
        urgentTickets: 0,
        conversationsNeedingHuman: conversationsNeedingHuman.length
      }
    });
  }

  return component({
    id: 'operations',
    label: 'Operations',
    status: PILOT_HEALTH_STATUS.HEALTHY,
    why: 'No hay tickets urgentes ni conversaciones pendientes de humano.',
    action: 'Mantener revision diaria.',
    details: {
      openTickets: 0,
      urgentTickets: 0,
      conversationsNeedingHuman: 0
    }
  });
};

export const buildPilotHealthSnapshot = ({
  hotel = {},
  pmsConnections = [],
  tickets = [],
  conversations = [],
  conversationStates = [],
  scheduledMessages = [],
  aiLogs = [],
  dataIssues = [],
  env = process.env,
  now = new Date()
} = {}) => {
  const components = [
    buildBackendComponent({ dataIssues }),
    buildPmsComponent({ pmsConnections, now }),
    buildWhatsappComponent({ hotel, scheduledMessages, env }),
    buildAiComponent({ hotel, conversationStates, aiLogs, env }),
    buildAutomationComponent({ scheduledMessages, env }),
    buildOperationsComponent({ tickets, conversations, conversationStates })
  ];
  const overallStatus = worstPilotStatus(components.map((item) => item.status));
  const demoStatusComponents = components.filter((item) => (
    item.id !== 'automations' || item.details?.previewRuntimeHealthy !== true
  ));
  const demoBlockingComponents = demoStatusComponents.filter((item) => [
    PILOT_HEALTH_STATUS.BLOCKED,
    PILOT_HEALTH_STATUS.ACTION_REQUIRED
  ].includes(item.status));
  const previewRuntimeHealthy = components.find((item) => item.id === 'automations')?.details?.previewRuntimeHealthy === true;
  const readyForPilotDemo = previewRuntimeHealthy && demoBlockingComponents.length === 0;
  const demoStatus = worstPilotStatus(demoStatusComponents.map((item) => item.status));
  const readyForLiveAutomations = false;
  const why = components
    .filter((item) => item.status !== PILOT_HEALTH_STATUS.HEALTHY)
    .map((item) => `${item.label}: ${item.status} - ${item.why}`);

  return {
    scope: 'pilot_health',
    generatedAt: nowIso(),
    status: overallStatus,
    demoStatus,
    readyForPilotDemo,
    readyForLiveAutomations,
    why,
    components,
    liveAutomationBlockers: PILOT_LIVE_AUTOMATION_BLOCKERS,
    safeForUi: !includesUnsafeText(components),
    noRawProviderErrors: true
  };
};

const scenario = ({
  id,
  scenario: label,
  expectedBehavior,
  humanAction,
  killFallback,
  passCriteria,
  status = PILOT_FAILURE_REHEARSAL_STATUS.PASS
}) => ({
  id,
  scenario: label,
  expectedBehavior,
  humanAction,
  killFallback,
  passCriteria,
  status
});

export const buildPilotFailureRehearsalMatrix = ({ overrides = {} } = {}) => {
  const rows = [
    scenario({
      id: 'pms_down',
      scenario: 'PMS down',
      expectedBehavior: 'Staynex UI sigue disponible; health marca PMS degradado o accion requerida; no se inventan datos PMS frescos.',
      humanAction: 'Operar con ultimo dato conocido claramente identificado y revisar conexion PMS.',
      killFallback: 'Automations/live actions permanecen seguras; sin default hotel.',
      passCriteria: 'El operador identifica fallo PMS sin secretos ni datos cruzados.'
    }),
    scenario({
      id: 'openai_down',
      scenario: 'OpenAI down',
      expectedBehavior: 'No se inventa respuesta AI; inbound queda en Inbox con atencion humana requerida.',
      humanAction: 'Responder manualmente desde Inbox.',
      killFallback: 'Fallback humano activo; AI count = 0 ante fallo proveedor.',
      passCriteria: 'Sin respuesta automatica inventada y sin llamada real al proveedor en test.'
    }),
    scenario({
      id: 'whatsapp_outbound_failure',
      scenario: 'WhatsApp outbound failure',
      expectedBehavior: 'Error visible operacionalmente; sin loop infinito ni duplicado guest-facing.',
      humanAction: 'Revisar Inbox/estado Twilio y decidir accion manual.',
      killFallback: 'Error seguro, sin raw Twilio secrets/errors.',
      passCriteria: 'Fallo categorizado y sin reenvio automatico.'
    }),
    scenario({
      id: 'unsupported_guest_question',
      scenario: 'unsupported guest question',
      expectedBehavior: 'No se alucina un dato del hotel; se escala o pide atencion humana.',
      humanAction: 'Recepcion responde con informacion verificada.',
      killFallback: 'Se usan senales existentes de fallback/escalacion.',
      passCriteria: 'Sin dato inventado y takeover disponible.'
    }),
    scenario({
      id: 'human_takeover',
      scenario: 'Human Takeover',
      expectedBehavior: 'Inbound sigue llegando; AI reply count = 0 mientras takeover esta ON.',
      humanAction: 'Recepcion responde manualmente y libera takeover cuando proceda.',
      killFallback: 'Release no reprocesa historico; siguiente inbound puede usar AI.',
      passCriteria: 'Sin respuesta retroactiva automatica.'
    }),
    scenario({
      id: 'kill_switch',
      scenario: 'Kill Switch',
      expectedBehavior: 'Hotel/global kill OFF bloquea automaticos; Inbox y operacion manual siguen vivos.',
      humanAction: 'Mantener operacion manual hasta reactivar con decision humana.',
      killFallback: 'AI auto reply = 0; sin efectos automaticos guest-facing.',
      passCriteria: 'Gate central bloquea y conserva manual operation.'
    }),
    scenario({
      id: 'automation_blocked',
      scenario: 'automation blocked/problematic',
      expectedBehavior: 'Decision preview se salta o bloquea; no live send con SEND_AUTOMATIONS=false.',
      humanAction: 'Revisar razon en Automations/Test Center.',
      killFallback: 'Sin duplicar queue ni enviar al guest.',
      passCriteria: 'Bloqueo visible, no send real, no duplicado.'
    })
  ];

  return rows.map((row) => ({
    ...row,
    ...(overrides[row.id] || {})
  }));
};

export const summarizePilotFailureRehearsal = (rows = buildPilotFailureRehearsalMatrix()) => {
  const matrix = safeArray(rows);
  const hasFail = matrix.some((row) => row.status === PILOT_FAILURE_REHEARSAL_STATUS.FAIL);
  const hasNotTestable = matrix.some((row) => row.status === PILOT_FAILURE_REHEARSAL_STATUS.NOT_TESTABLE_YET);
  const status = hasFail
    ? PILOT_FAILURE_REHEARSAL_STATUS.FAIL
    : hasNotTestable
      ? PILOT_FAILURE_REHEARSAL_STATUS.NOT_TESTABLE_YET
      : PILOT_FAILURE_REHEARSAL_STATUS.PASS;

  return {
    status,
    passed: matrix.filter((row) => row.status === PILOT_FAILURE_REHEARSAL_STATUS.PASS).length,
    failed: matrix.filter((row) => row.status === PILOT_FAILURE_REHEARSAL_STATUS.FAIL).length,
    notTestableYet: matrix.filter((row) => row.status === PILOT_FAILURE_REHEARSAL_STATUS.NOT_TESTABLE_YET).length,
    total: matrix.length,
    rows: matrix
  };
};
