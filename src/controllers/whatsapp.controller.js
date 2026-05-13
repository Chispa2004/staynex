import { findHotelByWhatsappNumber } from '../services/supabase.service.js';
import { processGuestMessage } from '../services/staynex.service.js';
import { logger } from '../utils/logger.js';

const emptyTwilioResponse = '<Response></Response>';

export const handleIncomingWhatsApp = async (req, res, next) => {
  try {
    const inboundMessage = req.body.Body?.trim();
    const guestWhatsappNumber = req.body.From;
    const hotelWhatsappNumber = req.body.To;

    if (!inboundMessage || !guestWhatsappNumber || !hotelWhatsappNumber) {
      return res.status(400).json({
        error: 'Invalid Twilio WhatsApp payload'
      });
    }

    const hotel = await findHotelByWhatsappNumber(hotelWhatsappNumber);

    if (!hotel) {
      logger.warn('No hotel found for incoming WhatsApp number', {
        hotelWhatsappNumber
      });

      res.type('text/xml');
      return res.status(200).send(emptyTwilioResponse);
    }

    const result = await processGuestMessage({
      hotel,
      message: inboundMessage,
      phone: guestWhatsappNumber,
      sendReply: true,
      replyTo: guestWhatsappNumber,
      channel: 'twilio-whatsapp'
    });

    logger.info('WhatsApp message processed', {
      hotelId: hotel.id,
      guestId: result.guest.id,
      conversationId: result.conversation.id,
      intent: result.ai.intent,
      ticketId: result.ticket?.id || null
    });

    res.type('text/xml');
    return res.status(200).send(emptyTwilioResponse);
  } catch (error) {
    return next(error);
  }
};
