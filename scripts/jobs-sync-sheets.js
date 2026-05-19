import 'dotenv/config';
import { syncPlatformGoogleSheets } from '../src/services/platform-sheets-sync.service.js';

const run = async () => {
  const result = await syncPlatformGoogleSheets();
  console.log(JSON.stringify(result, null, 2));
};

run().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exit(1);
});
