import { logger } from '../utils/logger.js';

const normalize = (value) => String(value || '').trim();

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
  const subject = `New Staynex experience lead - ${bookingRequest?.experience_title || providerExperience?.title || 'Experience'}`;
  const lines = [
    'New Staynex experience lead',
    '',
    `Reference: ${reference}`,
    `Hotel: ${normalize(hotel?.name) || 'Unknown hotel'}`,
    `Guest: ${normalize(bookingRequest?.guest_name || reservation?.guest_name || guest?.name) || 'Unknown guest'}`,
    `Room: ${normalize(bookingRequest?.room_number || guest?.current_room || reservation?.room_number) || 'Not provided'}`,
    `Phone: ${normalize(guest?.phone_number || reservation?.guest_phone) || 'Not provided'}`,
    `Experience: ${normalize(bookingRequest?.experience_title || providerExperience?.title) || 'Not provided'}`,
    `Requested date: ${normalize(bookingRequest?.requested_date) || 'Not provided'}`,
    `Requested time: ${normalize(bookingRequest?.requested_time) || 'Not provided'}`,
    `Guests: ${normalize(bookingRequest?.guests_count) || 'Not provided'}`,
    `Language: ${normalize(guest?.preferred_language || hotel?.default_language) || 'Not provided'}`,
    `Estimated revenue: ${bookingRequest?.estimated_revenue || 0}`,
    `Commission estimate: ${bookingRequest?.commission_estimate || 0}`,
    '',
    'Guest message / notes:',
    normalize(bookingRequest?.notes) || 'No notes',
    '',
    'Please contact the hotel/reception team to confirm availability before the guest is told the booking is confirmed.'
  ];

  return {
    to: leadEmail,
    subject,
    text: lines.join('\n'),
    reference,
    mode: process.env.EXPERIENCE_PROVIDER_EMAIL_MODE || 'mock'
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

  if ((process.env.EXPERIENCE_PROVIDER_EMAIL_MODE || 'mock') !== 'send') {
    logger.info('experience_provider_lead_email_prepared', {
      to: emailPayload.to,
      subject: emailPayload.subject,
      mode: emailPayload.mode
    });

    return {
      status: 'draft',
      reason: 'mock_mode',
      payload: emailPayload
    };
  }

  // Future-ready: wire SMTP/SendGrid/Postmark here.
  logger.warn('Experience provider email send mode requested but no email transport is configured');
  return {
    status: 'failed',
    reason: 'email_transport_not_configured',
    payload: emailPayload
  };
};
