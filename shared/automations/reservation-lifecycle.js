import { createHash } from 'node:crypto';
import {
  AUTOMATION_RUNTIME_VERSION,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES,
  RESERVATION_DATE_DEPENDENCIES,
  getReservationDateDependenciesForAutomation,
  normalizeAutomationType,
  normalizeReservationDateDependencies
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

const isValidDateParts = ({ year, month, day }) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const formatDateParts = ({ year, month, day }) => (
  isValidDateParts({ year, month, day })
    ? [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-')
    : null
);

const parseDateParts = ({ year, month, day }) => formatDateParts({
  year: Number(year),
  month: Number(month),
  day: Number(day)
});

const isValidIsoTime = ({
  hour,
  minute,
  second = '0',
  offset = null
}) => {
  const hourValue = Number(hour);
  const minuteValue = Number(minute);
  const secondValue = Number(second);

  if (
    !Number.isInteger(hourValue)
    || !Number.isInteger(minuteValue)
    || !Number.isInteger(secondValue)
    || hourValue < 0
    || hourValue > 23
    || minuteValue < 0
    || minuteValue > 59
    || secondValue < 0
    || secondValue > 59
  ) {
    return false;
  }

  if (!offset || offset.toUpperCase() === 'Z') {
    return true;
  }

  const offsetMatch = offset.match(/^[+-](\d{2}):(\d{2})$/);
  if (!offsetMatch) {
    return false;
  }

  const offsetHour = Number(offsetMatch[1]);
  const offsetMinute = Number(offsetMatch[2]);

  return Number.isInteger(offsetHour)
    && Number.isInteger(offsetMinute)
    && offsetHour >= 0
    && offsetHour <= 23
    && offsetMinute >= 0
    && offsetMinute <= 59;
};

export const normalizeReservationStayDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    return parseDateParts({
      year: isoDate[1],
      month: isoDate[2],
      day: isoDate[3]
    });
  }

  const slashDate = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashDate) {
    return parseDateParts({
      year: slashDate[1],
      month: slashDate[2],
      day: slashDate[3]
    });
  }

  const isoTimestamp = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$/i);
  if (isoTimestamp) {
    if (!isValidIsoTime({
      hour: isoTimestamp[4],
      minute: isoTimestamp[5],
      second: isoTimestamp[6],
      offset: isoTimestamp[7]
    })) {
      return null;
    }

    return parseDateParts({
      year: isoTimestamp[1],
      month: isoTimestamp[2],
      day: isoTimestamp[3]
    });
  }

  const european = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (european) {
    return parseDateParts({
      year: european[3],
      month: european[2],
      day: european[1]
    });
  }

  return null;
};

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
    arrival_date: normalizeReservationStayDate(reservation.arrival_date || reservation.check_in || reservation.checkIn),
    departure_date: normalizeReservationStayDate(reservation.departure_date || reservation.check_out || reservation.checkOut),
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

export const getReservationDateChangedFields = (previousReservation = null, currentReservation = null) => {
  const previous = canonicalReservationSnapshot(previousReservation);
  const current = canonicalReservationSnapshot(currentReservation);

  if (!previous || !current) {
    return [];
  }

  return [
    previous.arrival_date !== current.arrival_date ? RESERVATION_DATE_DEPENDENCIES.ARRIVAL : null,
    previous.departure_date !== current.departure_date ? RESERVATION_DATE_DEPENDENCIES.DEPARTURE : null
  ].filter(Boolean);
};

export const getDateChangeReason = (fields = []) => {
  const normalized = normalizeReservationDateDependencies(fields);
  const hasArrival = normalized.includes(RESERVATION_DATE_DEPENDENCIES.ARRIVAL);
  const hasDeparture = normalized.includes(RESERVATION_DATE_DEPENDENCIES.DEPARTURE);

  if (hasArrival && hasDeparture) {
    return 'reservation_stay_dates_changed';
  }

  if (hasArrival) {
    return 'reservation_arrival_changed';
  }

  if (hasDeparture) {
    return 'reservation_departure_changed';
  }

  return 'reservation_dates_changed';
};

export const buildReservationScheduleFingerprint = ({
  reservation = {},
  automationType = null,
  dependencies = null
} = {}) => {
  const resolvedDependencies = normalizeReservationDateDependencies(
    dependencies || getReservationDateDependenciesForAutomation(automationType)
  );

  if (resolvedDependencies.length === 0) {
    return null;
  }

  const snapshot = canonicalReservationSnapshot(reservation);
  const dateValues = Object.fromEntries(resolvedDependencies.map((dependency) => [
    dependency,
    dependency === RESERVATION_DATE_DEPENDENCIES.ARRIVAL
      ? snapshot?.arrival_date || null
      : snapshot?.departure_date || null
  ]));

  if (Object.values(dateValues).some((value) => !value)) {
    return null;
  }

  return createHash('sha256')
    .update(JSON.stringify({
      version: 'reservation-schedule-fingerprint-v1',
      dependencies: resolvedDependencies,
      dates: dateValues
    }))
    .digest('hex')
    .slice(0, 32);
};

export const getMessageReservationDateDependencies = (message = {}) => (
  normalizeReservationDateDependencies(
    message.metadata?.reservation_date_dependencies
    || message.metadata?.reservationDateDependencies
    || getReservationDateDependenciesForAutomation(
      message.metadata?.canonical_automation_type
        || normalizeAutomationType(message.automation_type).canonicalType
        || message.automation_type
    )
  )
);

export const getMessageReservationScheduleFingerprint = (message = {}) => (
  message.metadata?.reservation_schedule_fingerprint
  || message.metadata?.reservationScheduleFingerprint
  || null
);

export const evaluateMessageScheduleStaleness = ({
  message = {},
  reservation = {}
} = {}) => {
  const dependencies = getMessageReservationDateDependencies(message);

  if (dependencies.length === 0) {
    return {
      dateDependent: false,
      stale: false,
      unverifiable: false,
      reason: null,
      dependencies,
      expectedFingerprint: null,
      storedFingerprint: null
    };
  }

  const expectedFingerprint = buildReservationScheduleFingerprint({
    reservation,
    automationType: message.metadata?.canonical_automation_type || message.automation_type,
    dependencies
  });
  const storedFingerprint = getMessageReservationScheduleFingerprint(message);

  if (!expectedFingerprint || !storedFingerprint) {
    return {
      dateDependent: true,
      stale: true,
      unverifiable: true,
      reason: 'reservation_schedule_unverifiable',
      dependencies,
      expectedFingerprint,
      storedFingerprint
    };
  }

  return {
    dateDependent: true,
    stale: expectedFingerprint !== storedFingerprint,
    unverifiable: false,
    reason: expectedFingerprint === storedFingerprint ? null : 'reservation_schedule_stale',
    dependencies,
    expectedFingerprint,
    storedFingerprint
  };
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
  const changedFields = getReservationDateChangedFields(previous, current);
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
      changedFields,
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
      changedFields,
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
    changedFields,
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
  reconciledAt = null,
  reconciliationEventId = null,
  changedFields = [],
  supersededMessageId = null,
  replacementMessageId = null,
  previousScheduleFingerprint = null,
  currentScheduleFingerprint = null,
  ruleVersion = null
} = {}) => ({
  reconciliation: {
    action,
    reason,
    source,
    source_event_id: sourceEventId,
    event_key: eventKey,
    reconciliation_event_id: reconciliationEventId,
    changed_fields: normalizeReservationDateDependencies(changedFields),
    superseded_message_id: supersededMessageId,
    replacement_message_id: replacementMessageId,
    previous_schedule_fingerprint: previousScheduleFingerprint,
    current_schedule_fingerprint: currentScheduleFingerprint,
    rule_version: ruleVersion,
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
