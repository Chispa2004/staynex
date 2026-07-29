import { getRecentAiLogs } from '../services/ai-log.service.js';
import { getRecentReservations } from '../services/reservation.service.js';
import {
  hasReservationAccessTokenForLogs,
  maskPhoneForLogs
} from '../utils/privacy.js';

const redactText = (value) => (value ? '[redacted]' : value);

const redactObject = (record = {}) => Object.fromEntries(
  Object.entries(record || {}).map(([key, value]) => {
    if (/phone|whatsapp/i.test(key)) {
      return [key, maskPhoneForLogs(value)];
    }

    if (/email/i.test(key)) {
      return [key, value ? '[redacted-email]' : value];
    }

    if (/reservation_access_token|reservationAccessToken/i.test(key)) {
      return ['hasReservationAccessToken', hasReservationAccessTokenForLogs(value)];
    }

    if (/token|secret|password|credential|authorization/i.test(key)) {
      return [key, value ? '[redacted]' : value];
    }

    if (/prompt|raw|payload|body|message|response_text|generated_response/i.test(key)) {
      return [key, redactText(value)];
    }

    if (Array.isArray(value)) {
      return [key, value.map((item) => (item && typeof item === 'object' ? redactObject(item) : item))];
    }

    if (value && typeof value === 'object') {
      return [key, redactObject(value)];
    }

    return [key, value];
  })
);

export const sanitizeDebugAiLog = (log) => redactObject(log);
export const sanitizeDebugReservation = (reservation) => redactObject(reservation);

export const handleGetAiLogs = async (req, res, next) => {
  try {
    const logs = await getRecentAiLogs({ limit: 50 });

    return res.status(200).json({
      logs: logs.map(sanitizeDebugAiLog)
    });
  } catch (error) {
    return next(error);
  }
};

export const handleGetReservations = async (req, res, next) => {
  try {
    const reservations = await getRecentReservations({ limit: 50 });

    return res.status(200).json({
      reservations: reservations.map(sanitizeDebugReservation)
    });
  } catch (error) {
    return next(error);
  }
};
