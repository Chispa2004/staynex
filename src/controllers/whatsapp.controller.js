import { findHotelByWhatsappNumber } from '../services/supabase.service.js';
import {
  prepareInboundGuestMessageForProcessing,
  processGuestMessage
} from '../services/staynex.service.js';
import {
  attachMessageToTwilioInboundClaim,
  claimTwilioInboundMessage,
  completeTwilioInboundClaim,
  failTwilioInboundClaim,
  TwilioInboundDedupeError
} from '../services/twilio-inbound-dedupe.service.js';
import { logger } from '../utils/logger.js';
import { maskPhoneForLogs } from '../utils/privacy.js';

const emptyTwilioResponse = '<Response></Response>';

const sendEmptyTwilioAck = (res) => {
  res.type('text/xml');
  return res.status(200).send(emptyTwilioResponse);
};

const getTwilioMessageSid = (body = {}) => body.MessageSid;
const getTwilioAccountSid = (body = {}) => body.AccountSid || null;

export const createIncomingWhatsAppHandler = ({
  findHotelByWhatsappNumberFn = findHotelByWhatsappNumber,
  prepareInboundGuestMessageForProcessingFn = prepareInboundGuestMessageForProcessing,
  processGuestMessageFn = processGuestMessage,
  claimTwilioInboundMessageFn = claimTwilioInboundMessage,
  attachMessageToTwilioInboundClaimFn = attachMessageToTwilioInboundClaim,
  completeTwilioInboundClaimFn = completeTwilioInboundClaim,
  failTwilioInboundClaimFn = failTwilioInboundClaim
} = {}) => async (req, res, next) => {
  let activeClaim = null;
  let activeHotelId = null;

  try {
    const inboundMessage = req.body.Body?.trim();
    const guestWhatsappNumber = req.body.From;
    const hotelWhatsappNumber = req.body.To;

    if (!inboundMessage || !guestWhatsappNumber || !hotelWhatsappNumber) {
      return res.status(400).json({
        error: 'Invalid Twilio WhatsApp payload'
      });
    }

    const hotel = await findHotelByWhatsappNumberFn(hotelWhatsappNumber);

    if (!hotel) {
      logger.warn('No hotel found for incoming WhatsApp number', {
        hotelWhatsappNumber: maskPhoneForLogs(hotelWhatsappNumber)
      });

      return sendEmptyTwilioAck(res);
    }

    activeHotelId = hotel.id;
    const messageSid = getTwilioMessageSid(req.body);
    const accountSid = getTwilioAccountSid(req.body);
    const claimResult = await claimTwilioInboundMessageFn({
      hotelId: hotel.id,
      messageSid,
      accountSid
    });

    activeClaim = claimResult.claim;

    if (claimResult.duplicate) {
      logger.info('Duplicate Twilio inbound webhook ignored', {
        hotelId: hotel.id,
        messageSid: activeClaim?.message_sid || null,
        status: activeClaim?.status || null,
        outcome: claimResult.outcome
      });

      return sendEmptyTwilioAck(res);
    }

    const inboundDedupe = {
      claimId: activeClaim?.id || null,
      messageId: null,
      messageSid: activeClaim?.message_sid || messageSid
    };
    const preparedInbound = await prepareInboundGuestMessageForProcessingFn({
      hotel,
      message: inboundMessage,
      phone: guestWhatsappNumber,
      channel: 'twilio-whatsapp',
      allowHotelContextSwitch: false,
      inboundDedupe
    });

    if (!preparedInbound?.guestMessage?.id) {
      throw new TwilioInboundDedupeError(
        'TWILIO_INBOUND_MESSAGE_PREPARE_FAILED',
        'Twilio inbound message could not be prepared',
        { statusCode: 503 }
      );
    }

    activeClaim = await attachMessageToTwilioInboundClaimFn({
      claimId: activeClaim.id,
      hotelId: hotel.id,
      messageId: preparedInbound.guestMessage.id
    });

    const processingDedupe = {
      ...inboundDedupe,
      messageId: activeClaim?.message_id || preparedInbound.guestMessage.id
    };
    const result = await processGuestMessageFn({
      hotel,
      message: inboundMessage,
      phone: guestWhatsappNumber,
      sendReply: true,
      replyTo: guestWhatsappNumber,
      channel: 'twilio-whatsapp',
      allowHotelContextSwitch: false,
      inboundDedupe: processingDedupe,
      preparedInbound: {
        ...preparedInbound,
        guestMessage: preparedInbound.guestMessage
      }
    });
    activeClaim = await completeTwilioInboundClaimFn({
      claimId: activeClaim?.id,
      hotelId: hotel.id,
      messageId: result.messages?.guest?.id || activeClaim?.message_id || null
    }) || activeClaim;

    logger.info('WhatsApp message processed', {
      hotelId: hotel.id,
      guestId: result.guest?.id || null,
      conversationId: result.conversation?.id || null,
      intent: result.ai?.intent || null,
      ticketId: result.ticket?.id || null
    });

    return sendEmptyTwilioAck(res);
  } catch (error) {
    const isDedupeError = error instanceof TwilioInboundDedupeError;

    if (isDedupeError && !activeClaim?.id) {
      return res.status(error.statusCode || 400).json({
        ok: false,
        error: error.publicMessage || 'Invalid Twilio inbound request'
      });
    }

    if (activeClaim?.id && activeHotelId) {
      try {
        await failTwilioInboundClaimFn({
          claimId: activeClaim.id,
          hotelId: activeHotelId,
          failureCode: error?.code || 'PROCESSING_FAILED'
        });
      } catch (claimError) {
        logger.warn('Twilio inbound claim failure status update failed', {
          hotelId: activeHotelId,
          claimId: activeClaim.id,
          code: claimError?.code || 'CLAIM_UPDATE_FAILED'
        });
      }
    }

    return next(error);
  }
};

export const handleIncomingWhatsApp = createIncomingWhatsAppHandler();
