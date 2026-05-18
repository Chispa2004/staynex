import net from 'node:net';
import tls from 'node:tls';
import { logger } from '../utils/logger.js';

const normalize = (value) => String(value || '').trim();

const getEmailMode = () => {
  const mode = normalize(process.env.EXPERIENCE_PROVIDER_EMAIL_MODE || 'mock').toLowerCase();
  return mode === 'live' || mode === 'send' ? 'live' : 'mock';
};

const getSmtpConfig = () => ({
  host: normalize(process.env.SMTP_HOST),
  port: Number(process.env.SMTP_PORT || 587),
  user: normalize(process.env.SMTP_USER),
  pass: normalize(process.env.SMTP_PASS),
  from: normalize(process.env.SMTP_FROM || process.env.EMAIL_FROM || 'Staynex <no-reply@staynex.ai>')
});

const getSafeSmtpSummary = () => {
  const config = getSmtpConfig();

  return {
    provider: 'smtp',
    host: config.host || null,
    port: config.port || null,
    user: config.user || null,
    from: config.from || null,
    mode: getEmailMode(),
    secure: Number(config.port) === 465,
    startTls: Number(config.port) !== 465,
    authConfigured: Boolean(config.user && config.pass),
    passwordConfigured: Boolean(config.pass)
  };
};

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

const createSmtpSession = ({ host, port }) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (socket) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      resolve(socket);
    }
  };
  const socket = Number(port) === 465
    ? tls.connect({ host, port, servername: host }, () => finish(socket))
    : net.connect({ host, port });
  const timeout = setTimeout(() => {
    settled = true;
    socket.destroy();
    reject(new Error('smtp_connection_timeout'));
  }, 20000);

  socket.once('error', (error) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
  });

  if (Number(port) !== 465) {
    socket.once('connect', () => finish(socket));
  }
});

const createSmtpReader = (socket) => {
  let buffer = '';

  return () => new Promise((resolve, reject) => {
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      if (/^\d{3}\s/.test(lastLine)) {
        socket.off('data', onData);
        socket.off('error', onError);
        const response = buffer;
        buffer = '';
        resolve(response);
      }
    };
    const onError = (error) => {
      socket.off('data', onData);
      socket.off('error', onError);
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
    const response = await read();
    assertSmtpOk(response, accepted);
    return response;
  } catch (error) {
    error.command = command;
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

const sendSmtpMail = async ({ to, subject, text }) => {
  const config = getSmtpConfig();

  if (!config.host || !config.port || !config.from) {
    throw new Error('smtp_not_configured');
  }

  let socket = await createSmtpSession(config);
  let read = createSmtpReader(socket);
  assertSmtpOk(await read());

  await sendCommand({ socket, read, command: 'EHLO staynex.local' });

  if (Number(config.port) !== 465) {
    await sendCommand({ socket, read, command: 'STARTTLS', accepted: ['2'] });
    socket = await upgradeToTls({ socket, host: config.host });
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
  socket.write(`${escapeSmtpData(message)}\r\n.\r\n`);
  assertSmtpOk(await read());
  await sendCommand({ socket, read, command: 'QUIT', accepted: ['2'] }).catch(() => null);
  socket.end();

  return {
    accepted: [envelopeTo],
    envelopeFrom
  };
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
    `Source: Staynex`,
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
    `Commission estimate: ${bookingRequest?.commission_estimate || 0}`,
    '',
    'Original guest message / notes:',
    normalize(bookingRequest?.notes) || 'No notes',
    '',
    'Notes:',
    'Reception must confirm availability before the guest is told the experience is confirmed.'
  ];

  return {
    to: leadEmail,
    subject,
    text: lines.join('\n'),
    reference,
    mode: getEmailMode()
  };
};

export const sendExperienceProviderLeadEmail = async (emailPayload) => {
  if (!emailPayload?.to) {
    return {
      status: 'skipped',
      reason: 'missing_provider_email',
      payload: emailPayload
    };
  }

  const mode = getEmailMode();
  if (mode !== 'live') {
    logger.info('experience_provider_lead_email_prepared', {
      to: emailPayload.to,
      subject: emailPayload.subject,
      mode
    });

    return {
      status: 'draft',
      reason: 'mock_mode',
      payload: {
        ...emailPayload,
        mode
      }
    };
  }

  try {
    const smtpResult = await sendSmtpMail(emailPayload);

    logger.info('experience_provider_lead_email_sent', {
      to: emailPayload.to,
      subject: emailPayload.subject,
      reference: emailPayload.reference
    });

    return {
      status: 'sent',
      reason: 'live_smtp_sent',
      payload: {
        ...emailPayload,
        mode
      },
      transport: {
        provider: 'smtp',
        accepted: smtpResult.accepted,
        envelopeFrom: smtpResult.envelopeFrom
      }
    };
  } catch (error) {
    const smtpSummary = getSafeSmtpSummary();
    const errorPayload = {
      type: 'smtp_send_failed',
      to: emailPayload.to,
      subject: emailPayload.subject,
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT,
      smtpUser: process.env.SMTP_USER,
      mode: process.env.EXPERIENCE_PROVIDER_EMAIL_MODE,
      smtpConfig: smtpSummary
    };

    logger.error('experience_provider_lead_email_failed', errorPayload);
    console.error('experience_provider_lead_email_failed', errorPayload);

    return {
      status: 'failed',
      reason: error.message || 'smtp_send_failed',
      payload: {
        ...emailPayload,
        mode
      }
    };
  }
};
