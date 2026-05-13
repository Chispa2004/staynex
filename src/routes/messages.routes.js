import { Router } from 'express';
import { handleSendMessage } from '../controllers/messages.controller.js';

const router = Router();

router.post('/send', handleSendMessage);

export default router;
