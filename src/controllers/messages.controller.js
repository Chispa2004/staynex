import { sendStaffMessage } from '../services/message.service.js';

export const handleSendMessage = async (req, res, next) => {
  try {
    const { conversationId, message, hotelId, staffLanguage } = req.body;

    const result = await sendStaffMessage({
      conversationId,
      message,
      hotelId,
      staffLanguage
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message
      });
    }

    return next(error);
  }
};
