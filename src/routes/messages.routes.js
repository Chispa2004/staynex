import { Router } from 'express';
import {
  handleSendMessage,
  handleTranslateMessage
} from '../controllers/messages.controller.js';

const router = Router();

router.post('/send', handleSendMessage);
router.post('/translate', handleTranslateMessage);

export default router;
