import { Router } from 'express';
import { handleIncomingWhatsApp } from '../controllers/whatsapp.controller.js';
import { validateTwilioWebhook } from '../middleware/security.middleware.js';

const router = Router();

router.post('/whatsapp', validateTwilioWebhook, handleIncomingWhatsApp);

export default router;
