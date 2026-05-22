import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { logger } from '../utils/logger.js';

const normalize = (value) => String(value || '').trim();
const normalizePassword = (value) => normalize(value).replace(/\s+/g, '');

const getEmailMode = () => {
  const mode = normalize(process.env.EXPERIENCE_PROVIDER_EMAIL_MODE || 'mock').toLowerCase();
  return mode === 'live' || mode === 'send' ? 'live' : 'mock';
};

const getEmailProvider = () => {
  const provider = normalize(process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (provider === 'resend' || provider === 'smtp') return provider;
  return normalize(process.env.RESEND_API_KEY) ? 'resend' : 'smtp';
};

const parseBoolean = (value) => {
  const normalized = normalize(value).toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const getSmtpPort = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  return Number.isFinite(port) && port > 0 ? port : 587;
};

const getSmtpSecure = (port = getSmtpPort()) => {
  if (Number(port) === 465) return true;

  const explicitSecure = parseBoolean(process.env.SMTP_SECURE);
  if (explicitSecure !== null) return explicitSecure;

  if (Number(port) === 587) return false;

  return false;
};

const getTimeoutMs = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const resolveProviderSmtpConfig = () => {
  const port = getSmtpPort();
  const secure = getSmtpSecure(port);
  const user = normalize(process.env.SMTP_USER);
  const pass = normalizePassword(process.env.SMTP_PASS);

  return {
    host: normalize(process.env.SMTP_HOST),
    port,
    secure,
    auth: user || pass ? {
      user,
      pass
    } : null,
    user,
    pass,
    from: normalize(process.env.SMTP_FROM || process.env.EMAIL_FROM || 'Staynex <no-reply@staynex.ai>'),
    connectionTimeout: getTimeoutMs('SMTP_CONNECTION_TIMEOUT_MS', 30000),
    greetingTimeout: getTimeoutMs('SMTP_GREETING_TIMEOUT_MS', 30000),
    socketTimeout: getTimeoutMs('SMTP_SOCKET_TIMEOUT_MS', 30000),
    retryDelayMs: getTimeoutMs('SMTP_RETRY_DELAY_MS', 2000),
    timeouts: {
      connectionTimeout: getTimeoutMs('SMTP_CONNECTION_TIMEOUT_MS', 30000),
      greetingTimeout: getTimeoutMs('SMTP_GREETING_TIMEOUT_MS', 30000),
      socketTimeout: getTimeoutMs('SMTP_SOCKET_TIMEOUT_MS', 30000)
    },
    startTls: !secure
  };
};

const getSmtpConfig = () => resolveProviderSmtpConfig();

export const resolveProviderResendConfig = () => ({
  provider: 'resend',
  apiKey: normalize(process.env.RESEND_API_KEY),
  from: normalize(process.env.RESEND_FROM || process.env.EMAIL_FROM || process.env.SMTP_FROM || 'Staynex <no-reply@staynex.ai>'),
  mode: getEmailMode()
});

const getSafeSmtpSummary = () => {
  const config = getSmtpConfig();

  return {
    provider: 'smtp',
    host: config.host || null,
    port: config.port || null,
    secure: Boolean(config.secure),
    user: config.user || null,
    from: config.from || null,
    mode: getEmailMode(),
    startTls: !config.secure,
    legacyStartTlsFlagsIgnored: Boolean(process.env.SMTP_STARTTLS || process.env.SMTP_TLS || process.env.SMTP_USE_STARTTLS),
    authConfigured: Boolean(config.user && config.pass),
    passwordConfigured: Boolean(config.pass),
    connectionTimeout: config.connectionTimeout,
    greetingTimeout: config.greetingTimeout,
    socketTimeout: config.socketTimeout
  };
};

const getSafeResendSummary = () => {
  const config = resolveProviderResendConfig();

  return {
    provider: 'resend',
    apiKeyConfigured: Boolean(config.apiKey),
    from: config.from || null,
    mode: config.mode
  };
};

const getProviderSmtpTransportHash = () => {
  const summary = getSafeSmtpSummary();
  const hashInput = {
    host: summary.host,
    port: summary.port,
    secure: summary.secure,
    smtpUser: summary.user,
    smtpFrom: summary.from,
    connectionTimeout: summary.connectionTimeout,
    greetingTimeout: summary.greetingTimeout,
    socketTimeout: summary.socketTimeout,
    mode: summary.mode
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashInput))
    .digest('hex')
    .slice(0, 16);
};

const getProviderResendTransportHash = () => {
  const summary = getSafeResendSummary();
  const hashInput = {
    provider: summary.provider,
    resendFrom: summary.from,
    apiKeyConfigured: summary.apiKeyConfigured,
    mode: summary.mode
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashInput))
    .digest('hex')
    .slice(0, 16);
};

const getProviderEmailTransportHash = (provider = getEmailProvider()) => (
  provider === 'resend'
    ? getProviderResendTransportHash()
    : getProviderSmtpTransportHash()
);

const extractEmailAddress = (value = '') => {
  const match = String(value).match(/<([^>]+)>/);
  return normalize(match?.[1] || value);
};

const base64 = (value) => Buffer.from(String(value), 'utf8').toString('base64');

const escapeSmtpData = (value = '') => String(value)
  .replace(/\r?\n/g, '\r\n')
  .replace(/^\./gm, '..');

const encodeHeader = (value = '') => {
  const text = String(value);
  return /^[\x00-\x7F]*$/.test(text)
    ? text
    : `=?UTF-8?B?${base64(text)}?=`;
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const textToHtml = (value = '') => escapeHtml(value)
  .split(/\r?\n\r?\n/g)
  .map((paragraph) => `<p>${paragraph.replace(/\r?\n/g, '<br>')}</p>`)
  .join('\n');

const createTimeoutError = ({ message, code = 'ETIMEDOUT', stage = null, command = null }) => {
  const error = new Error(message);
  error.code = code;
  error.stage = stage;
  error.command = command || undefined;
  return error;
};

const createSmtpSession = ({ host, port, secure, connectionTimeout, socketTimeout }) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (socket) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      socket.setTimeout(socketTimeout, () => {
        const error = createTimeoutError({
          message: 'smtp_socket_timeout',
          stage: 'socket'
        });
        socket.destroy(error);
      });
      resolve(socket);
    }
  };
  const socket = secure
    ? tls.connect({ host, port, servername: host }, () => finish(socket))
    : net.connect({ host, port });
  const timeout = setTimeout(() => {
    settled = true;
    const error = createTimeoutError({
      message: 'smtp_connection_timeout',
      stage: 'connect'
    });
    socket.destroy(error);
    reject(error);
  }, connectionTimeout);

  socket.once('error', (error) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
  });

  if (!secure) {
    socket.once('connect', () => finish(socket));
  }
});

const createSmtpReader = (socket) => {
  let buffer = '';

  return ({ timeoutMs = 30000, stage = 'read', command = null } = {}) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(createTimeoutError({
        message: 'smtp_read_timeout',
        stage,
        command
      }));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      if (/^\d{3}\s/.test(lastLine)) {
        cleanup();
        const response = buffer;
        buffer = '';
        resolve(response);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    socket.on('data', onData);
    socket.once('error', onError);
  });
};

const assertSmtpOk = (response, accepted = ['2', '3']) => {
  const code = String(response || '').slice(0, 3);
  if (!accepted.some((prefix) => code.startsWith(prefix))) {
    const error = new Error(`smtp_unexpected_response_${code || 'unknown'}`);
    error.code = `SMTP_${code || 'UNKNOWN'}`;
    error.responseCode = code ? Number(code) : undefined;
    error.response = response;
    throw error;
  }
};

const sendCommand = async ({ socket, read, command, accepted }) => {
  try {
    socket.write(`${command}\r\n`);
    const response = await read({ stage: 'command', command });
    assertSmtpOk(response, accepted);
    return response;
  } catch (error) {
    error.command = command;
    error.smtpMaybeSent = error.smtpMaybeSent || command === 'DATA';
    throw error;
  }
};

const upgradeToTls = async ({ socket, host }) => new Promise((resolve, reject) => {
  const secureSocket = tls.connect({
    socket,
    servername: host
  }, () => resolve(secureSocket));

  secureSocket.once('error', reject);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeoutError = (error) => (
  error?.code === 'ETIMEDOUT'
  || /timeout/i.test(error?.message || '')
);

const connectAndAuthenticateSmtp = async (config) => {
  let socket = await createSmtpSession(config);
  let read = createSmtpReader(socket);
  assertSmtpOk(await read({ timeoutMs: config.greetingTimeout, stage: 'greeting' }));

  await sendCommand({ socket, read, command: 'EHLO staynex.local' });

  if (!config.secure) {
    await sendCommand({ socket, read, command: 'STARTTLS', accepted: ['2'] });
    socket = await upgradeToTls({ socket, host: config.host });
    socket.setTimeout(config.socketTimeout, () => {
      const error = createTimeoutError({
        message: 'smtp_socket_timeout',
        stage: 'socket_tls'
      });
      socket.destroy(error);
    });
    read = createSmtpReader(socket);
    await sendCommand({ socket, read, command: 'EHLO staynex.local' });
  }

  if (config.user || config.pass) {
    if (!config.user || !config.pass) {
      throw new Error('smtp_auth_incomplete');
    }

    await sendCommand({ socket, read, command: 'AUTH LOGIN', accepted: ['3'] });
    await sendCommand({ socket, read, command: base64(config.user), accepted: ['3'] });
    await sendCommand({ socket, read, command: base64(config.pass), accepted: ['2'] });
  }

  return { socket, read };
};

export const verifySmtpTransport = async ({ force = false } = {}) => {
  const config = getSmtpConfig();

  if (!config.host || !config.port || !config.from) {
    throw new Error('smtp_not_configured');
  }

  if (!force && verifySmtpTransport.verified) {
    return {
      ok: true,
      cached: true,
      provider: 'smtp',
      config: getSafeSmtpSummary()
    };
  }

  let socket = null;
  let read = null;

  try {
    ({ socket, read } = await connectAndAuthenticateSmtp(config));
    await sendCommand({ socket, read, command: 'QUIT', accepted: ['2'] }).catch(() => null);
    socket.end();
    verifySmtpTransport.verified = true;
    logger.info('smtp_verified', getSafeSmtpSummary());
    return {
      ok: true,
      cached: false,
      provider: 'smtp',
      config: getSafeSmtpSummary()
    };
  } catch (error) {
    logger.error('smtp_verify_failed', {
      ...buildSmtpErrorPayload({ error }),
      smtpConfig: getSafeSmtpSummary()
    });
    throw error;
  } finally {
    if (socket && !socket.destroyed) {
      socket.end();
    }
  }
};
verifySmtpTransport.verified = false;

const sendSmtpMailOnce = async ({ to, subject, text }) => {
  const config = getSmtpConfig();

  if (!config.host || !config.port || !config.from) {
    throw new Error('smtp_not_configured');
  }

  const { socket, read } = await connectAndAuthenticateSmtp(config);
  const envelopeFrom = extractEmailAddress(config.from);
  const envelopeTo = extractEmailAddress(to);
  const message = [
    `From: ${config.from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text
  ].join('\r\n');

  await sendCommand({ socket, read, command: `MAIL FROM:<${envelopeFrom}>` });
  await sendCommand({ socket, read, command: `RCPT TO:<${envelopeTo}>` });
  await sendCommand({ socket, read, command: 'DATA', accepted: ['3'] });
  try {
    socket.write(`${escapeSmtpData(message)}\r\n.\r\n`);
    assertSmtpOk(await read({ stage: 'message_body', command: 'DATA' }));
  } catch (error) {
    error.smtpMaybeSent = true;
    throw error;
  }
  await sendCommand({ socket, read, command: 'QUIT', accepted: ['2'] }).catch(() => null);
  socket.end();

  return {
    accepted: [envelopeTo],
    envelopeFrom,
    messageId: `${Date.now()}-${Math.random().toString(16).slice(2)}@staynex`
  };
};

const sendSmtpMail = async (payload) => {
  const config = getSmtpConfig();
  let attempt = 0;

  while (attempt < 2) {
    attempt += 1;

    try {
      await verifySmtpTransport();
      const result = await sendSmtpMailOnce(payload);
      return {
        ...result,
        attempts: attempt
      };
    } catch (error) {
      const canRetry = attempt === 1 && isTimeoutError(error) && !error.smtpMaybeSent;

      logger.warn('smtp_send_attempt_failed', {
        ...buildSmtpErrorPayload({ error }),
        attempt,
        canRetry,
        smtpConfig: getSafeSmtpSummary()
      });

      if (!canRetry) {
        throw error;
      }

      await wait(config.retryDelayMs);
    }
  }

  throw new Error('smtp_send_failed');
};

let resendClient = null;
let resendClientApiKey = null;

const getResendClient = (apiKey) => {
  if (!resendClient || resendClientApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientApiKey = apiKey;
  }

  return resendClient;
};

const sendResendMail = async ({ to, subject, text, html }) => {
  const config = resolveProviderResendConfig();

  if (!config.apiKey || !config.from) {
    const error = new Error('resend_not_configured');
    error.code = 'RESEND_NOT_CONFIGURED';
    throw error;
  }

  const resend = getResendClient(config.apiKey);
  const result = await resend.emails.send({
    from: config.from,
    to,
    subject,
    html: html || textToHtml(text),
    text
  });

  if (result?.error) {
    const error = new Error(result.error.message || 'resend_send_failed');
    error.code = result.error.name || result.error.code || 'RESEND_SEND_FAILED';
    error.response = result.error;
    throw error;
  }

  return {
    accepted: [to],
    messageId: result?.data?.id || null,
    provider: 'resend'
  };
};

const buildSmtpErrorPayload = ({ error }) => ({
  type: 'smtp_send_failed',
  message: error?.message || null,
  code: error?.code || null,
  command: error?.command || null,
  response: error?.response || null,
  responseCode: error?.responseCode || null,
  stack: error?.stack || null,
  stage: error?.stage || null,
  smtpMaybeSent: Boolean(error?.smtpMaybeSent),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpSecure: getSmtpSecure(),
  smtpUser: process.env.SMTP_USER,
  mode: process.env.EXPERIENCE_PROVIDER_EMAIL_MODE
});

const buildResendErrorPayload = ({ error }) => ({
  type: 'resend_send_failed',
  message: error?.message || null,
  code: error?.code || null,
  response: error?.response || null,
  stack: error?.stack || null,
  provider: 'resend',
  resendFrom: process.env.RESEND_FROM || process.env.EMAIL_FROM || null,
  apiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
  mode: process.env.EXPERIENCE_PROVIDER_EMAIL_MODE
});

const getReadableSmtpErrorMessage = (errorPayload = {}) => {
  if (errorPayload.message && errorPayload.message !== 'smtp_send_failed') {
    return errorPayload.message;
  }

  return errorPayload.response
    || errorPayload.code
    || errorPayload.message
    || 'smtp_send_failed';
};

const buildProviderEmailLogContext = ({
  to,
  subject,
  hotelId = null,
  bookingRequestId = null,
  providerId = null,
  providerExperienceId = null,
  emailContext = 'provider_booking',
  emailProvider = getEmailProvider()
} = {}) => {
  const smtp = getSafeSmtpSummary();

  return {
    provider: emailProvider,
    emailContext,
    hotelId,
    bookingRequestId,
    providerId,
    providerExperienceId,
    to,
    subject,
    smtpHost: smtp.host,
    smtpPort: smtp.port,
    secure: smtp.secure,
    mode: smtp.mode,
    transportHash: getProviderEmailTransportHash(emailProvider)
  };
};

const logProviderEmailRuntimeConfig = ({ emailContext, logContext, emailProvider }) => {
  logger.info('provider_email_provider_selected', {
    provider: emailProvider,
    emailContext,
    mode: getEmailMode(),
    transportHash: getProviderEmailTransportHash(emailProvider)
  });

  if (emailProvider === 'resend') {
    const resend = getSafeResendSummary();
    const payload = {
      provider: 'resend',
      resendFrom: resend.from,
      apiKeyConfigured: resend.apiKeyConfigured,
      mode: resend.mode,
      transportHash: getProviderResendTransportHash()
    };

    if (emailContext === 'platform_test') {
      logger.info('platform_test_email_runtime_config', payload);
      logger.info('platform_test_email_transport_hash', {
        ...logContext,
        transportHash: payload.transportHash
      });
      return;
    }

    logger.info('provider_booking_email_runtime_config', payload);
    logger.info('provider_booking_email_transport_hash', {
      ...logContext,
      transportHash: payload.transportHash
    });
    return;
  }

  const smtp = getSafeSmtpSummary();
  const payload = {
    provider: 'smtp',
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    authConfigured: smtp.authConfigured,
    smtpUser: smtp.user,
    smtpFrom: smtp.from,
    connectionTimeout: smtp.connectionTimeout,
    greetingTimeout: smtp.greetingTimeout,
    socketTimeout: smtp.socketTimeout,
    mode: smtp.mode,
    legacyStartTlsFlagsIgnored: smtp.legacyStartTlsFlagsIgnored,
    transportHash: getProviderSmtpTransportHash()
  };

  if (emailContext === 'platform_test') {
    logger.info('platform_test_email_runtime_config', payload);
    logger.info('platform_test_email_transport_hash', {
      ...logContext,
      transportHash: payload.transportHash
    });
    return;
  }

  logger.info('provider_booking_email_runtime_config', payload);
  logger.info('provider_booking_email_transport_hash', {
    ...logContext,
    transportHash: payload.transportHash
  });
};

export const buildExperienceProviderLeadEmail = ({
  hotel,
  guest,
  reservation,
  conversation,
  bookingRequest,
  providerExperience,
  leadEmail
} = {}) => {
  const reference = `STAYNEX-${String(bookingRequest?.id || conversation?.id || Date.now()).slice(0, 8).toUpperCase()}`;
  const hotelName = normalize(hotel?.name) || 'Unknown hotel';
  const providerName = normalize(bookingRequest?.provider_source || providerExperience?.provider_source || providerExperience?.partner_name) || 'Experience provider';
  const subject = `New Staynex experience lead - ${hotelName}`;
  const lines = [
    'New Staynex experience lead',
    '',
    `A guest from ${hotelName} has requested this experience through Staynex. Please contact the guest or hotel to confirm availability and complete the booking.`,
    '',
    `Reference: ${reference}`,
    `Staynex booking request ID: ${normalize(bookingRequest?.id) || 'Not provided'}`,
    `Source: Staynex Partner Network`,
    '',
    `Hotel: ${hotelName}`,
    `Provider: ${providerName}`,
    `Guest name: ${normalize(bookingRequest?.guest_name || reservation?.guest_name || guest?.name) || 'Unknown guest'}`,
    `Room: ${normalize(bookingRequest?.room_number || guest?.current_room || reservation?.room_number) || 'Not provided'}`,
    `Guest phone / WhatsApp: ${normalize(guest?.phone_number || reservation?.guest_phone) || 'Not provided'}`,
    `Experience requested: ${normalize(bookingRequest?.experience_title || providerExperience?.title) || 'Not provided'}`,
    `Date requested: ${normalize(bookingRequest?.requested_date) || 'Not provided'}`,
    `Time requested: ${normalize(bookingRequest?.requested_time) || 'Not provided'}`,
    `Number of guests: ${normalize(bookingRequest?.guests_count) || 'Not provided'}`,
    `Language: ${normalize(guest?.preferred_language || hotel?.default_language) || 'Not provided'}`,
    `Estimated revenue: ${bookingRequest?.estimated_revenue || 0}`,
    `Origin: Staynex Partner Network`,
    '',
    'Original guest message / notes:',
    normalize(bookingRequest?.notes) || 'No notes',
    '',
    'Notes:',
    'This request was generated automatically by Staynex after explicit guest confirmation.',
    'Please confirm availability before the hotel informs the guest that the booking is confirmed.'
  ];

  return {
    to: leadEmail,
    subject,
    text: lines.join('\n'),
    reference,
    mode: getEmailMode()
  };
};

export const sendProviderEmail = async ({
  to,
  subject,
  message,
  text,
  html,
  hotelId = null,
  bookingRequestId = null,
  providerId = null,
  providerExperienceId = null,
  reference = null,
  context = null
} = {}) => {
  const emailContext = context || (bookingRequestId ? 'provider_booking' : 'platform_test');
  const emailProvider = getEmailProvider();
  const emailPayload = {
    to: normalize(to),
    subject: normalize(subject) || 'New Staynex experience lead',
    text: normalize(message ?? text) || 'A new Staynex provider email was created.',
    html: normalize(html),
    reference: reference || (bookingRequestId
      ? `STAYNEX-${String(bookingRequestId).slice(0, 8).toUpperCase()}`
      : `SMTP-TEST-${Date.now()}`),
    mode: getEmailMode(),
    provider: emailProvider
  };
  const logContext = buildProviderEmailLogContext({
    to: emailPayload.to,
    subject: emailPayload.subject,
    hotelId,
    bookingRequestId,
    providerId,
    providerExperienceId,
    emailContext,
    emailProvider
  });

  logProviderEmailRuntimeConfig({ emailContext, logContext, emailProvider });
  logger.info('provider_booking_email_attempt', logContext);

  if (!emailPayload.to) {
    return {
      status: 'skipped',
      reason: 'missing_provider_email',
      smtp: getSafeSmtpSummary(),
      payload: emailPayload
    };
  }

  const mode = getEmailMode();
  if (mode !== 'live') {
    logger.info('experience_provider_lead_email_prepared', logContext);

    return {
      status: 'draft',
      reason: 'mock_mode',
      smtp: getSafeSmtpSummary(),
      payload: {
        ...emailPayload,
        mode
      }
    };
  }

  try {
    const transportResult = emailProvider === 'resend'
      ? await sendResendMail(emailPayload)
      : await sendSmtpMail(emailPayload);

    logger.info('provider_booking_email_success', {
      ...logContext,
      reference: emailPayload.reference,
      messageId: transportResult.messageId,
      accepted: transportResult.accepted,
      attempts: transportResult.attempts || 1
    });

    return {
      status: 'sent',
      reason: emailProvider === 'resend' ? 'live_resend_sent' : 'live_smtp_sent',
      payload: {
        ...emailPayload,
        mode
      },
      smtp: getSafeSmtpSummary(),
      resend: getSafeResendSummary(),
      transport: {
        provider: emailProvider,
        accepted: transportResult.accepted,
        envelopeFrom: transportResult.envelopeFrom || null,
        messageId: transportResult.messageId,
        attempts: transportResult.attempts || 1
      }
    };
  } catch (error) {
    const rawErrorPayload = emailProvider === 'resend'
      ? buildResendErrorPayload({ error })
      : buildSmtpErrorPayload({ error });
    const readableMessage = getReadableSmtpErrorMessage(rawErrorPayload);
    const errorPayload = {
      ...rawErrorPayload,
      message: readableMessage,
      rawMessage: rawErrorPayload.message,
      to: emailPayload.to,
      subject: emailPayload.subject,
      smtpConfig: getSafeSmtpSummary(),
      resendConfig: getSafeResendSummary()
    };

    logger.error('provider_booking_email_failed', {
      ...logContext,
      ...errorPayload,
      errorCode: errorPayload.code,
      errorMessage: readableMessage
    });
    console.error('provider_booking_email_failed', {
      ...logContext,
      ...errorPayload,
      errorCode: errorPayload.code,
      errorMessage: readableMessage
    });

    return {
      status: 'failed',
      reason: readableMessage,
      error: errorPayload,
      smtp: getSafeSmtpSummary(),
      resend: getSafeResendSummary(),
      payload: {
        ...emailPayload,
        mode
      }
    };
  }
};

export const sendExperienceProviderLeadEmail = async (emailPayload) => sendProviderEmail({
  to: emailPayload?.to,
  subject: emailPayload?.subject,
  message: emailPayload?.text || emailPayload?.message,
  html: emailPayload?.html,
  reference: emailPayload?.reference,
  hotelId: emailPayload?.hotelId || null,
  bookingRequestId: emailPayload?.bookingRequestId || null,
  providerId: emailPayload?.providerId || null,
  providerExperienceId: emailPayload?.providerExperienceId || null,
  context: emailPayload?.context || (emailPayload?.bookingRequestId ? 'provider_booking' : 'platform_test')
});

export const sendProviderEmailTest = async ({ to, subject, message }) => {
  const result = await sendProviderEmail({
    to,
    subject: normalize(subject) || 'Staynex provider email test',
    message: normalize(message) || 'This is a Staynex provider email delivery test.',
    reference: `SMTP-TEST-${Date.now()}`,
    context: 'platform_test'
  });

  return {
    success: result.status === 'sent',
    provider: result.transport?.provider || result.payload?.provider || getEmailProvider(),
    status: result.status,
    reason: result.reason,
    messageId: result.transport?.messageId || null,
    accepted: result.transport?.accepted || [],
    error: result.error || null,
    smtp: getSafeSmtpSummary(),
    resend: getSafeResendSummary()
  };
};
