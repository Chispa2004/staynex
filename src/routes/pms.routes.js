import { Router } from 'express';
import { handleReservationCreated } from '../controllers/pms.controller.js';

const router = Router();

router.post('/reservation-created', handleReservationCreated);

export default router;
