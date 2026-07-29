import { processGuestMessage } from '../services/staynex.service.js';
import { getHotelById } from '../services/hotel.service.js';

const buildLocalTestGuestKey = (hotelId) => `local-test:${hotelId}`;

export const handleTestMessage = async (req, res, next) => {
  try {
    const { message } = req.body;
    const hotelId = req.explicitHotelId;

    if (!message || !hotelId) {
      return res.status(400).json({
        error: 'message and hotelId are required'
      });
    }

    if (req.body?.phone || req.body?.to || req.body?.replyTo) {
      return res.status(400).json({
        error: 'Test messages do not accept arbitrary phone targets'
      });
    }

    const hotel = await getHotelById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        error: 'Hotel not found'
      });
    }

    const result = await processGuestMessage({
      hotel,
      message,
      phone: buildLocalTestGuestKey(hotel.id),
      sendReply: false,
      replyTo: null,
      channel: 'local-test'
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
