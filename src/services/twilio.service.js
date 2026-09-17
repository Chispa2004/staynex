import twilio from 'twilio';

const toWhatsappAddress = (phoneNumber) => {
  if (!phoneNumber) {
    return phoneNumber;
  }

  return phoneNumber.startsWith('whatsapp:')
    ? phoneNumber
    : `whatsapp:${phoneNumber}`;
};

const getTwilioClient = (options = {}) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials are not configured');
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, options);
};

// Manual sends never retry automatically. Configuration failures occur before
// Messages.create; transport errors after that boundary remain indeterminate.
export const sendManualWhatsAppMessage = async ({ to, body }) => {
  let client;
  try {
    if (!process.env.TWILIO_WHATSAPP_FROM) throw new Error('Missing sender');
    client = getTwilioClient({ timeout: 15000, autoRetry: false });
  } catch {
    throw Object.assign(new Error('Manual provider unavailable'), { manualSendNotAttempted: true });
  }
  return client.messages.create({ from: toWhatsappAddress(process.env.TWILIO_WHATSAPP_FROM), to: toWhatsappAddress(to), body });
};

// Queue dispatch owns retry policy. Never let the SDK replay a POST behind it.
export const sendAutomationWhatsAppMessage = async ({ to, body }) => {
  let client;
  try {
    if (!process.env.TWILIO_WHATSAPP_FROM) throw new Error('Missing sender');
    client = getTwilioClient({ timeout: 15000, autoRetry: false });
  } catch {
    throw Object.assign(new Error('Automation provider unavailable'), { automationSendNotAttempted: true });
  }
  return client.messages.create({ from: toWhatsappAddress(process.env.TWILIO_WHATSAPP_FROM), to: toWhatsappAddress(to), body });
};

export const sendWhatsAppMessage = async ({ to, body }) => {
  if (!process.env.TWILIO_WHATSAPP_FROM) {
    throw new Error('TWILIO_WHATSAPP_FROM is not configured');
  }

  const client = getTwilioClient();

  return client.messages.create({
    from: toWhatsappAddress(process.env.TWILIO_WHATSAPP_FROM),
    to: toWhatsappAddress(to),
    body
  });
};
