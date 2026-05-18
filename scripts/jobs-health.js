import 'dotenv/config';
import { pmsSyncHealthCheck } from '../src/jobs/pmsSyncHealthCheck.js';
import { messageRetentionHealthCheck } from '../src/jobs/messageRetentionHealthCheck.js';

const main = async () => {
  const [pms, retention] = await Promise.all([
    pmsSyncHealthCheck(),
    messageRetentionHealthCheck()
  ]);

  console.log(JSON.stringify({
    ok: true,
    pms,
    retention
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
