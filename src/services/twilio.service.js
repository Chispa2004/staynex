import twilio from 'twilio';

const toWhatsappAddress = (phoneNumber) => {
  if (!phoneNumber) {
    return phoneNumber;
  }

  return phoneNumber.startsWith('whatsapp:')
    ? phoneNumber
    : `whatsapp:${phoneNumber}`;
};

const getTwilioClient = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials are not configured');
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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
