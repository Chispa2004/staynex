import { Router } from 'express';
import {
  handleSendMessage,
  handleTranslateMessage
} from '../controllers/messages.controller.js';
import { requireInternalApiToken } from '../middleware/security.middleware.js';

const router = Router();

router.post('/send', requireInternalApiToken, handleSendMessage);
router.post('/translate', requireInternalApiToken, handleTranslateMessage);

export default router;
