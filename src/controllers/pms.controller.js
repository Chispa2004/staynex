import { scheduleReservationAutomations } from '../services/automation.service.js';
import { logReservationConfirmationEmail } from '../services/email-mock.service.js';
import { createOrUpdateReservation } from '../services/reservation.service.js';

const hasGuestIdentifier = (body) => Boolean(
  body.guest_phone
  || body.guest_email
  || body.guest_name
);

const validateReservationPayload = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.pms_reservation_id || typeof body.pms_reservation_id !== 'string') {
    return 'pms_reservation_id is required';
  }

  if (!hasGuestIdentifier(body)) {
    return 'At least one guest identifier is required: guest_phone, guest_email or guest_name';
  }

  return null;
};

export const handleReservationCreated = async (req, res, next) => {
  try {
    const validationError = validateReservationPayload(req.body);

    if (validationError) {
      return res.status(400).json({
        ok: false,
        error: validationError
      });
    }

    const { reservation } = await createOrUpdateReservation({
      ...req.body,
      pms_provider: req.body.pms_provider || 'mock'
    });
    const automationEvents = await scheduleReservationAutomations(reservation);

    logReservationConfirmationEmail(reservation);

    return res.status(200).json({
      ok: true,
      reservation,
      automation_events: automationEvents
    });
  } catch (error) {
    return next(error);
  }
};
