import { Router } from 'express';
import { handleGetAiLogs } from '../controllers/debug.controller.js';

const router = Router();

router.get('/ai-logs', handleGetAiLogs);

export default router;
