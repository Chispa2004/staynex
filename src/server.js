import 'dotenv/config';
import express from 'express';
import whatsappRoutes from './routes/whatsapp.routes.js';
import pmsRoutes from './routes/pms.routes.js';
import testRoutes from './routes/test.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import debugRoutes from './routes/debug.routes.js';
import { validateEnvironment } from './config/env.js';
import { logger } from './utils/logger.js';

const app = express();
const port = process.env.PORT || 3000;

validateEnvironment({ exitOnError: true });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'staynex-backend',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true
  });
});

app.use('/webhooks', whatsappRoutes);
app.use('/webhooks/pms', pmsRoutes);
app.use('/', testRoutes);
app.use('/messages', messagesRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.use('/debug', debugRoutes);
}

app.use((err, req, res, next) => {
  logger.error('Unhandled request error', {
    message: err.message,
    stack: err.stack
  });

  res.status(500).json({
    error: 'Internal server error'
  });
});

app.listen(port, () => {
  logger.info(`Staynex backend listening on port ${port}`);
});
