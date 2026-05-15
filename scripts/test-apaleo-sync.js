import 'dotenv/config';
import { ApaleoConfigurationError, getApaleoAccessToken } from '../src/integrations/apaleo/apaleo-auth.service.js';
import { getReservations } from '../src/integrations/apaleo/apaleo-reservations.service.js';

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
};

const main = async () => {
  try {
    await getApaleoAccessToken();

    const today = new Date();
    const reservations = await getReservations({
      from: today.toISOString().slice(0, 10),
      to: addDays(today, 60),
      status: process.argv[2] || undefined
    });

    console.log(JSON.stringify({
      ok: true,
      configured: true,
      fetched: reservations.length,
      note: reservations.length === 0 ? 'Apaleo is configured, but no reservations were returned for the test window.' : 'Apaleo reservations fetched successfully.'
    }, null, 2));
  } catch (error) {
    if (error instanceof ApaleoConfigurationError) {
      console.log(JSON.stringify({
        ok: true,
        configured: false,
        missing_env: error.missingEnv,
        note: 'Apaleo sync is not configured yet. Add the missing ENV values before testing against Apaleo.'
      }, null, 2));
      return;
    }

    console.error(JSON.stringify({
      ok: false,
      error: error.message
    }, null, 2));
    process.exitCode = 1;
  }
};

main();
