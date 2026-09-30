const path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const lab=path.join(root,'.npm-cache/theme-production-lab');
const mode=process.argv[2];
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|CI)$/i.test(key)));
Object.assign(env,{SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',NEXT_MANUAL_SIG_HANDLE:'true',NODE_OPTIONS:`--require "${path.join(root,'scripts/ci/isolate.cjs').replaceAll('\\','/')}"`});
const d=path.join(lab,'dashboard'), next=path.join(root,'dashboard/node_modules/next/dist/bin/next');
if(mode==='build') {
  require('./fixtures/theme-lab.cjs').prepare(root,lab);
  const result=spawnSync(process.execPath,[next,'build'],{cwd:d,env,stdio:'inherit'});
  process.exit(result.status??1);
} else if(mode==='start') {
  process.chdir(d);process.env=env;require('./ci/isolate.cjs');
  process.argv=[process.execPath,next,'start','-p','3362','-H','127.0.0.1'];require(next);
} else throw Error('Expected build or start');
