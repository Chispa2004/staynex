// Reusable local runner: exactly the CI environment, no inherited credentials.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));
Object.assign(env,{CI:'true',NEXT_TELEMETRY_DISABLED:'1',SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',AUTOMATION_TEST_SEND_ENABLED:'false',NODE_OPTIONS:'--require "'+path.join(__dirname,'isolate.cjs').replaceAll('\\','/')+'"'});
const result=spawnSync(process.execPath,process.argv.slice(2),{env,stdio:'inherit'});
if(result.error) throw result.error;
// A child terminated by a signal has status=null: it must not turn CI green.
process.exit(result.status??1);
