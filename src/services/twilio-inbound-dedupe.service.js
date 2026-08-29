import { getSupabase } from './supabase.service.js';

export const TWILIO_INBOUND_DEDUPE_TABLE = 'twilio_inbound_message_claims';

export const TWILIO_INBOUND_DEDUPE_STATUS = {
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  FAILED: 'failed'
};

const TWILIO_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const UNIQUE_VIOLATION_CODE = '23505';

export class TwilioInboundDedupeError extends Error {
  constructor(code, message, { statusCode = 400 } = {}) {
    super(message);
    this.name = 'TwilioInboundDedupeError';
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = message;
  }
}

const nowIso = () => new Date().toISOString();

const normalizeBoundedId = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';

  return TWILIO_ID_PATTERN.test(normalized) ? normalized : null;
};

export const normalizeTwilioMessageSid = (value) => normalizeBoundedId(value);

export const normalizeTwilioAccountSid = (value) => normalizeBoundedId(value);

export const assertValidTwilioMessageSid = (messageSid) => {
  const normalized = normalizeTwilioMessageSid(messageSid);

  if (!normalized) {
    throw new TwilioInboundDedupeError(
      'TWILIO_MESSAGE_SID_REQUIRED',
      'Twilio MessageSid is required'
    );
  }

  return normalized;
};

const isUniqueViolation = (error) => (
  error?.code === UNIQUE_VIOLATION_CODE
  || /duplicate key value violates unique constraint/i.test(error?.message || '')
);

const safeFailureCode = (value) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]/g, '_')
    .slice(0, 64);

  return normalized || 'PROCESSING_FAILED';
};

const getClaimByHotelMessageSid = async ({ client, hotelId, messageSid }) => {
  const { data, error } = await client
    .from(TWILIO_INBOUND_DEDUPE_TABLE)
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('message_sid', messageSid)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getClaimByAccountMessageSid = async ({ client, accountSid, messageSid }) => {
  if (!accountSid) {
    return null;
  }

  const { data, error } = await client
    .from(TWILIO_INBOUND_DEDUPE_TABLE)
    .select('*')
    .eq('twilio_account_sid', accountSid)
    .eq('message_sid', messageSid)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const outcomeFromExistingClaim = async ({ client, existingClaim, hotelId, messageSid, accountSid }) => {
  if (!existingClaim) {
    throw new TwilioInboundDedupeError(
      'TWILIO_INBOUND_CLAIM_CONFLICT_UNRESOLVED',
      'Twilio inbound duplicate claim could not be resolved',
      { statusCode: 503 }
    );
  }

  if (existingClaim.hotel_id !== hotelId) {
    return {
      outcome: 'cross_tenant_duplicate',
      duplicate: true,
      claim: existingClaim
    };
  }

  if (
    existingClaim.twilio_account_sid
    && accountSid
    && existingClaim.twilio_account_sid !== accountSid
  ) {
    return {
      outcome: 'account_mismatch_duplicate',
      duplicate: true,
      claim: existingClaim
    };
  }

  return {
    outcome: existingClaim.status === TWILIO_INBOUND_DEDUPE_STATUS.FAILED
      ? 'failed_consumed'
      : 'duplicate',
    duplicate: true,
    claim: existingClaim
  };
};

export const claimTwilioInboundMessage = async ({
  hotelId,
  messageSid,
  accountSid = null,
  client = getSupabase()
}) => {
  if (!hotelId) {
    throw new TwilioInboundDedupeError(
      'TWILIO_INBOUND_HOTEL_REQUIRED',
      'Twilio inbound tenant context is required'
    );
  }

  const normalizedMessageSid = assertValidTwilioMessageSid(messageSid);
  const normalizedAccountSid = normalizeTwilioAccountSid(accountSid);
  const receivedAt = nowIso();

  const { data: claim, error } = await client
    .from(TWILIO_INBOUND_DEDUPE_TABLE)
    .insert({
      hotel_id: hotelId,
      message_sid: normalizedMessageSid,
      twilio_account_sid: normalizedAccountSid,
      status: TWILIO_INBOUND_DEDUPE_STATUS.PROCESSING,
      attempt_count: 1,
      first_received_at: receivedAt,
      last_received_at: receivedAt
    })
    .select('*')
    .single();

  if (!error) {
    return {
      outcome: 'claimed',
      duplicate: false,
      claim
    };
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const existingByHotel = await getClaimByHotelMessageSid({
    client,
    hotelId,
    messageSid: normalizedMessageSid
  });
  const existingByAccount = await getClaimByAccountMessageSid({
    client,
    accountSid: normalizedAccountSid,
    messageSid: normalizedMessageSid
  });
  const existingClaim = existingByHotel || existingByAccount;

  return outcomeFromExistingClaim({
    client,
    existingClaim,
    hotelId,
    messageSid: normalizedMessageSid,
    accountSid: normalizedAccountSid
  });
};

export const attachMessageToTwilioInboundClaim = async ({
  claimId,
  hotelId,
  messageId,
  client = getSupabase()
}) => {
  if (!claimId || !hotelId || !messageId) {
    throw new TwilioInboundDedupeError(
      'TWILIO_INBOUND_MESSAGE_ATTACH_INVALID',
      'Twilio inbound message claim cannot be updated',
      { statusCode: 503 }
    );
  }

  const { data, error } = await client
    .from(TWILIO_INBOUND_DEDUPE_TABLE)
    .update({
      message_id: messageId,
      last_received_at: nowIso()
    })
    .eq('id', claimId)
    .eq('hotel_id', hotelId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new TwilioInboundDedupeError(
      'TWILIO_INBOUND_MESSAGE_ATTACH_MISSING',
      'Twilio inbound message claim was not found',
      { statusCode: 503 }
    );
  }

  return data;
};

export const completeTwilioInboundClaim = async ({
  claimId,
  hotelId,
  messageId = null,
  client = getSupabase()
}) => {
  if (!claimId || !hotelId) {
    return null;
  }

  const processedAt = nowIso();
  const updates = {
    status: TWILIO_INBOUND_DEDUPE_STATUS.PROCESSED,
    processed_at: processedAt,
    failed_at: null,
    failure_code: null,
    last_received_at: processedAt
  };

  if (messageId) {
    updates.message_id = messageId;
  }

  const { data, error } = await client
    .from(TWILIO_INBOUND_DEDUPE_TABLE)
    .update(updates)
    .eq('id', claimId)
    .eq('hotel_id', hotelId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const failTwilioInboundClaim = async ({
  claimId,
  hotelId,
  failureCode = 'PROCESSING_FAILED',
  client = getSupabase()
}) => {
  if (!claimId || !hotelId) {
    return null;
  }

  const failedAt = nowIso();
  const { data, error } = await client
    .from(TWILIO_INBOUND_DEDUPE_TABLE)
    .update({
      status: TWILIO_INBOUND_DEDUPE_STATUS.FAILED,
      failed_at: failedAt,
      failure_code: safeFailureCode(failureCode),
      last_received_at: failedAt
    })
    .eq('id', claimId)
    .eq('hotel_id', hotelId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};
