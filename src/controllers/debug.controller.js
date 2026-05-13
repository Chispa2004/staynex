import { getRecentAiLogs } from '../services/ai-log.service.js';
import { getRecentReservations } from '../services/reservation.service.js';

export const handleGetAiLogs = async (req, res, next) => {
  try {
    const logs = await getRecentAiLogs({ limit: 50 });

    return res.status(200).json({
      logs
    });
  } catch (error) {
    return next(error);
  }
};

export const handleGetReservations = async (req, res, next) => {
  try {
    const reservations = await getRecentReservations({ limit: 50 });

    return res.status(200).json({
      reservations
    });
  } catch (error) {
    return next(error);
  }
};
