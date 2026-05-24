import 'dotenv/config';
import { runPreCheckoutFolioReminder } from '../src/services/pms-folio.service.js';

const hotelIdArg = process.argv.find((arg) => arg.startsWith('--hotel-id='));
const hotelId = hotelIdArg ? hotelIdArg.split('=').slice(1).join('=').trim() : process.env.HOTEL_ID || null;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=').slice(1).join('=')) : 250;

const main = async () => {
  const summary = await runPreCheckoutFolioReminder({
    hotelId,
    limit: Number.isFinite(limit) ? limit : 250
  });

  console.log(JSON.stringify({
    ok: true,
    job: 'pre_checkout_folio_reminder',
    mode: 'preview_only',
    hotelId,
    summary
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: 'pre_checkout_folio_reminder',
    mode: 'preview_only',
    hotelId,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exitCode = 1;
});
