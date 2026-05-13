import { Router } from 'express';
import {
  handleGetAiLogs,
  handleGetReservations
} from '../controllers/debug.controller.js';

const router = Router();

router.get('/ai-logs', handleGetAiLogs);
router.get('/reservations', handleGetReservations);

export default router;
