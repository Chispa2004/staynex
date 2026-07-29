import { Router } from 'express';
import { handleReservationCreated } from '../controllers/pms.controller.js';
import {
  requireExplicitHotelId,
  requireInternalApiToken
} from '../middleware/security.middleware.js';

const router = Router();

router.post('/reservation-created', requireInternalApiToken, requireExplicitHotelId, handleReservationCreated);

export default router;
