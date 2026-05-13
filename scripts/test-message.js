import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { processGuestMessage } from '../src/services/staynex.service.js';
import { logger } from '../src/utils/logger.js';

validateEnvironment({ exitOnError: true });

const [, , customMessage, customPhone] = process.argv;
const message = customMessage || 'Hola, estoy en la habitación 204 y necesito dos toallas';
const phone = customPhone || '+34600000000';

try {
  const result = await processGuestMessage({
    message,
    phone,
    sendReply: false,
    channel: 'script-local-test'
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (error) {
  logger.error('Local Staynex test failed', {
    message: error.message
  });
  process.exit(1);
}
