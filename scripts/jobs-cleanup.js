import 'dotenv/config';
import { cleanupExpiredGuestData } from '../src/jobs/cleanupExpiredGuestData.js';

const hasFlag = (name) => process.argv.includes(name);

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

const main = async () => {
  const dryRun = hasFlag('--dry-run') || process.env.DRY_RUN === 'true';
  const hotelId = getArgValue('--hotel-id');
  const limit = Number(getArgValue('--limit') || process.env.GDPR_CLEANUP_LIMIT || 500);
  const result = await cleanupExpiredGuestData({
    hotelId,
    dryRun,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 500
  });

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
