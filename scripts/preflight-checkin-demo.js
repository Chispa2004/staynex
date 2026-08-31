import {
  CHECKIN_DEMO_HOTEL,
  getCheckinDemoPreflight
} from '../src/services/demo-data.service.js';

const main = async () => {
  const report = await getCheckinDemoPreflight();

  console.log(JSON.stringify({
    ok: report.readyForPilotDemo,
    action: 'preflight_checkin_demo',
    hotel: CHECKIN_DEMO_HOTEL,
    optionalTables: report.optionalTables,
    report
  }, null, 2));

  if (!report.readyForPilotDemo) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    action: 'preflight_checkin_demo',
    hotel: CHECKIN_DEMO_HOTEL,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
});
