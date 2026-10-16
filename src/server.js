import 'dotenv/config';
import express from 'express';
import {createTransitionControl,installTransitionEndpoints} from './middleware/transition-control.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import pmsRoutes from './routes/pms.routes.js';
import testRoutes from './routes/test.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import debugRoutes from './routes/debug.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import { validateEnvironment } from './config/env.js';
import { logger } from './utils/logger.js';
import {
  requireInternalApiToken,
  areTestRoutesEnabled,
  requestIdMiddleware
} from './middleware/security.middleware.js';

const app = express();
const port = process.env.PORT || 3000;

validateEnvironment({ exitOnError: true });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(requestIdMiddleware);

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'staynex-backend',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'staynex-backend',
    status: 'healthy',
    requestId: req.requestId
  });
});

const transition=createTransitionControl({initialMode:process.env.TRANSITION_ADMISSION_MODE||'open',
  instance:process.env.RAILWAY_REPLICA_ID||'unknown',revision:process.env.RAILWAY_GIT_COMMIT_SHA||'unknown'});
installTransitionEndpoints(app,transition,requireInternalApiToken);
for(const [router,group] of [[whatsappRoutes,'whatsapp'],[pmsRoutes,'pms'],[integrationsRoutes,'pms'],[messagesRoutes,'messages'],[testRoutes,'test'],[debugRoutes,'debug']]) transition.install(router,group);

app.use('/webhooks', whatsappRoutes);
app.use('/webhooks/pms', pmsRoutes);
app.use('/', testRoutes);
app.use('/messages', messagesRoutes);
app.use('/integrations', integrationsRoutes);

if (areTestRoutesEnabled()) {
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

const server=app.listen(port, () => {
  logger.info(`Staynex backend listening on port ${port}`);
});

process.once('SIGTERM',()=>{
  transition.restrict('all');
  logger.info('transition_shutdown_requested',transition.snapshot());
  server.close(()=>logger.info('transition_http_closed',transition.snapshot()));
  // No forced exit, claim reset or requeue. Platform termination is an external
  // deadline and may leave uncertain outcomes; HTTP closure alone is not drain.
});
