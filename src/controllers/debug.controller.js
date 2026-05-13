import { getRecentAiLogs } from '../services/ai-log.service.js';

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
