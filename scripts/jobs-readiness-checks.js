import 'dotenv/config';
import { getSupabase } from '../src/services/supabase.service.js';
import { runHotelReadinessChecks } from '../src/services/golive-readiness.service.js';

const main = async () => {
  const supabase = getSupabase();
  const { data: hotels, error } = await supabase
    .from('hotels')
    .select('id, name, deleted_at, archived_at, status');

  if (error) {
    throw error;
  }

  const results = [];

  for (const hotel of hotels || []) {
    if (hotel.deleted_at || hotel.archived_at || hotel.status === 'archived') {
      continue;
    }

    const readiness = await runHotelReadinessChecks(hotel.id, { persist: true });
    results.push({
      hotelId: hotel.id,
      hotelName: hotel.name,
      readinessScore: readiness.readiness_score,
      readyForLive: readiness.ready_for_live,
      criticalChecks: readiness.critical_checks
    });
  }

  console.log(JSON.stringify({
    ok: true,
    checkedHotels: results.length,
    results
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
