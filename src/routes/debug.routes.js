import { Router } from 'express';
import {
  handleGetAiLogs,
  handleGetReservations
} from '../controllers/debug.controller.js';
import {
  requireInternalApiToken,
  requirePlatformAdmin,
  requireTestRoutesEnabled
} from '../middleware/security.middleware.js';

export const createDebugRouter = ({
  platformAdminGuard = requirePlatformAdmin,
  controllers = {
    handleGetAiLogs,
    handleGetReservations
  }
} = {}) => {
  const router = Router();
  const debugGuards = [requireTestRoutesEnabled, requireInternalApiToken, platformAdminGuard];

  router.get('/ai-logs', ...debugGuards, controllers.handleGetAiLogs);
  router.get('/reservations', ...debugGuards, controllers.handleGetReservations);

  return router;
};

export default createDebugRouter();
