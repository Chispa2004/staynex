import 'dotenv/config';
import { runPostStayReviewIntelligence } from '../src/services/post-stay-review-intelligence.service.js';

const hotelIdArg = process.argv.find((arg) => arg.startsWith('--hotel-id='));
const hotelId = hotelIdArg ? hotelIdArg.split('=').slice(1).join('=').trim() : process.env.HOTEL_ID || null;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=').slice(1).join('=')) : 250;

const main = async () => {
  const summary = await runPostStayReviewIntelligence({
    hotelId,
    limit: Number.isFinite(limit) ? limit : 250
  });

  console.log(JSON.stringify({
    ok: true,
    job: 'post_stay_review_intelligence',
    mode: 'preview_only',
    hotelId,
    summary
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: 'post_stay_review_intelligence',
    mode: 'preview_only',
    hotelId,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exitCode = 1;
});
