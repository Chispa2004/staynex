import {
  AUTOMATION_RUNTIME_VERSION,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES
} from './catalog.js';

export const RESERVATION_TERMINAL_AUTOMATION_STATUSES = Object.freeze({
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  DELETED: 'deleted'
});

export const CANONICAL_AUTOMATION_RUNTIME_VERSIONS = Object.freeze([
  AUTOMATION_RUNTIME_VERSION
]);

export const CANCELLABLE_AUTOMATION_MESSAGE_STATUSES = Object.freeze([
  OPERATIONAL_STATUSES.PREVIEW,
  OPERATIONAL_STATUSES.AWAITING_APPROVAL,
  OPERATIONAL_STATUSES.SCHEDULED
]);

export const TERMINAL_AUTOMATION_MESSAGE_STATUSES = Object.freeze([
  OPERATIONAL_STATUSES.SENT,
  OPERATIONAL_STATUSES.CANCELLED,
  OPERATIONAL_STATUSES.FAILED
]);

const TERMINAL_REASON_BY_STATUS = Object.freeze({
  [RESERVATION_TERMINAL_AUTOMATION_STATUSES.CANCELLED]: 'reservation_cancelled',
  [RESERVATION_TERMINAL_AUTOMATION_STATUSES.NO_SHOW]: 'reservation_no_show',
  [RESERVATION_TERMINAL_AUTOMATION_STATUSES.DELETED]: 'reservation_deleted'
});

const STATUS_SYNONYMS = Object.freeze({
  canceled: RESERVATION_TERMINAL_AUTOMATION_STATUSES.CANCELLED,
  cancelled: RESERVATION_TERMINAL_AUTOMATION_STATUSES.CANCELLED,
  no_show: RESERVATION_TERMINAL_AUTOMATION_STATUSES.NO_SHOW,
  no_showed: RESERVATION_TERMINAL_AUTOMATION_STATUSES.NO_SHOW,
  no_showing: RESERVATION_TERMINAL_AUTOMATION_STATUSES.NO_SHOW,
  noshow: RESERVATION_TERMINAL_AUTOMATION_STATUSES.NO_SHOW,
  no_show_guest: RESERVATION_TERMINAL_AUTOMATION_STATUSES.NO_SHOW,
  deleted: RESERVATION_TERMINAL_AUTOMATION_STATUSES.DELETED,
  removed: RESERVATION_TERMINAL_AUTOMATION_STATUSES.DELETED
});

const normalizeText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '');

const runtimeVersionForMessage = (message = {}) => (
  message.runtime_version
  || message.metadata?.runtime_version
  || null
);

export const normalizeReservationLifecycleStatus = (status) => {
  const normalized = normalizeText(status);

  if (!normalized) {
    return null;
  }

  return STATUS_SYNONYMS[normalized] || normalized;
};

export const isReservationTerminalForAutomations = (status) => (
  Object.values(RESERVATION_TERMINAL_AUTOMATION_STATUSES)
    .includes(normalizeReservationLifecycleStatus(status))
);

export const isReservationAutomationEligibleStatus = (status) => (
  !isReservationTerminalForAutomations(status)
);

export const getReservationAutomationTerminalReason = (status) => (
  TERMINAL_REASON_BY_STATUS[normalizeReservationLifecycleStatus(status)] || null
);

export const canonicalReservationSnapshot = (reservation = null) => {
  if (!reservation) {
    return null;
  }

  return {
    id: reservation.id || reservation.reservation_id || null,
    hotel_id: reservation.hotel_id || reservation.hotelId || null,
    status: normalizeReservationLifecycleStatus(reservation.status || reservation.pms_status),
    arrival_date: reservation.arrival_date || reservation.check_in || reservation.checkIn || null,
    departure_date: reservation.departure_date || reservation.check_out || reservation.checkOut || null,
    updated_at: reservation.updated_at || null
  };
};

export const hasReservationDateChanged = (previousReservation = null, currentReservation = null) => {
  const previous = canonicalReservationSnapshot(previousReservation);
  const current = canonicalReservationSnapshot(currentReservation);

  if (!previous || !current) {
    return false;
  }

  return previous.arrival_date !== current.arrival_date
    || previous.departure_date !== current.departure_date;
};

export const evaluateReservationLifecyclePolicy = ({
  previousReservation = null,
  currentReservation = null,
  sourceEventId = null
} = {}) => {
  const previous = canonicalReservationSnapshot(previousReservation);
  const current = canonicalReservationSnapshot(currentReservation);
  const canonicalStatus = current?.status || previous?.status || null;
  const previousStatus = previous?.status || null;
  const currentStatus = current?.status || null;
  const hotelId = current?.hotel_id || previous?.hotel_id || null;
  const reservationId = current?.id || previous?.id || null;
  const terminalReason = getReservationAutomationTerminalReason(currentStatus);
  const statusChanged = previousStatus !== currentStatus;
  const becameTerminal = Boolean(terminalReason)
    && statusChanged;
  const datesChanged = hasReservationDateChanged(previous, current);

  if (terminalReason) {
    return {
      action: 'cancel_pending',
      reason: terminalReason,
      hotelId,
      reservationId,
      previousStatus,
      currentStatus,
      canonicalStatus,
      sourceEventId,
      statusChanged,
      becameTerminal,
      datesChanged
    };
  }

  if (datesChanged) {
    return {
      action: 'future_reschedule',
      reason: 'reservation_dates_changed',
      hotelId,
      reservationId,
      previousStatus,
      currentStatus,
      canonicalStatus,
      sourceEventId,
      statusChanged,
      becameTerminal,
      datesChanged,
      previousArrivalDate: previous?.arrival_date || null,
      currentArrivalDate: current?.arrival_date || null,
      previousDepartureDate: previous?.departure_date || null,
      currentDepartureDate: current?.departure_date || null
    };
  }

  return {
    action: 'none',
    reason: 'reservation_lifecycle_unchanged',
    hotelId,
    reservationId,
    previousStatus,
    currentStatus,
    canonicalStatus,
    sourceEventId,
    statusChanged,
    becameTerminal,
    datesChanged
  };
};

export const isRecognizedAutomationRuntimeVersion = (runtimeVersion) => (
  CANONICAL_AUTOMATION_RUNTIME_VERSIONS.includes(runtimeVersion)
);

export const isCanonicalAutomationScheduledMessage = (message = {}) => (
  Boolean(message.idempotency_key)
  && Boolean(message.execution_mode)
  && isRecognizedAutomationRuntimeVersion(runtimeVersionForMessage(message))
);

export const isCancellableAutomationMessageStatus = (status) => (
  CANCELLABLE_AUTOMATION_MESSAGE_STATUSES.includes(normalizeText(status))
);

export const isTerminalAutomationMessageStatus = (status) => (
  TERMINAL_AUTOMATION_MESSAGE_STATUSES.includes(normalizeText(status))
);

export const buildReconciliationEventKey = ({
  hotelId,
  reservationId,
  reason,
  sourceEventId = null
} = {}) => [
  'reservation_lifecycle',
  hotelId || 'no-hotel',
  reservationId || 'no-reservation',
  reason || 'unknown',
  sourceEventId || 'no-source-event'
].join(':');

export const buildSafeReconciliationMetadata = ({
  reason,
  source = 'reservation_mutation',
  sourceEventId = null,
  eventKey = null,
  previousStatus = null,
  currentStatus = null,
  action = null,
  reconciledAt = null
} = {}) => ({
  reconciliation: {
    action,
    reason,
    source,
    source_event_id: sourceEventId,
    event_key: eventKey,
    previous_status: previousStatus,
    current_status: currentStatus,
    runtime_version: AUTOMATION_RUNTIME_VERSION,
    reconciled_at: reconciledAt
  }
});

export const isLiveExecutionMode = (executionMode) => [
  EXECUTION_MODES.LIVE_LIMITED,
  EXECUTION_MODES.LIVE
].includes(normalizeText(executionMode));
