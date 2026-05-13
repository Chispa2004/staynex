import { processGuestMessage } from '../services/staynex.service.js';

export const handleTestMessage = async (req, res, next) => {
  try {
    const { message, phone } = req.body;

    if (!message || !phone) {
      return res.status(400).json({
        error: 'message and phone are required'
      });
    }

    const result = await processGuestMessage({
      message,
      phone,
      sendReply: false,
      channel: 'local-test'
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
