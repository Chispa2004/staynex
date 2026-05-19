import 'dotenv/config';
import { runPmsIntelligenceRefresh } from '../src/services/pms-intelligence.service.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('--dryRun') || process.env.DRY_RUN === 'true';
const hotelIdArg = process.argv.find((arg) => arg.startsWith('--hotel-id='));
const hotelId = hotelIdArg ? hotelIdArg.split('=').slice(1).join('=').trim() : process.env.HOTEL_ID || null;

const main = async () => {
  const summary = await runPmsIntelligenceRefresh({
    hotelId,
    dryRun
  });

  console.log(JSON.stringify({
    ok: true,
    job: 'pms_intelligence',
    dryRun,
    hotelId,
    summary
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: 'pms_intelligence',
    dryRun,
    hotelId,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exitCode = 1;
});
