import { Router } from 'express';
import { handleIncomingWhatsApp } from '../controllers/whatsapp.controller.js';

const router = Router();

router.post('/whatsapp', handleIncomingWhatsApp);

export default router;
