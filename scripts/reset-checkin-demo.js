import {
  CHECKIN_DEMO_HOTEL,
  CHECKIN_DEMO_RESET_CONFIRMATION,
  seedCheckinDemoScenario
} from '../src/services/demo-data.service.js';

const readArg = (name) => {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const main = async () => {
  if (process.env.SEND_AUTOMATIONS === 'true') {
    throw new Error('Refusing to seed demo data while SEND_AUTOMATIONS=true');
  }

  const confirm = readArg('--confirm') || process.env.CHECKIN_DEMO_RESET_CONFIRM || null;
  const summary = await seedCheckinDemoScenario({ confirm });

  console.log(JSON.stringify({
    ok: true,
    action: 'reset_checkin_demo',
    hotel: CHECKIN_DEMO_HOTEL,
    confirmationRequired: CHECKIN_DEMO_RESET_CONFIRMATION,
    summary
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    action: 'reset_checkin_demo',
    hotel: CHECKIN_DEMO_HOTEL,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
});
