import { Router } from 'express';
import { handleTestMessage } from '../controllers/test.controller.js';

const router = Router();

router.post('/test-message', handleTestMessage);

export default router;
