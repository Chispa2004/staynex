const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const lab=process.env.ACCESSIBILITY_LAB_DIR||path.join(root,'.npm-cache/accessibility-production-lab');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|CI)$/i.test(key)));
Object.assign(env,{SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',NEXT_MANUAL_SIG_HANDLE:'true',NODE_OPTIONS:`--require "${path.join(root,'scripts/ci/isolate.cjs').replaceAll('\\','/')}"`});
const next=path.join(root,'dashboard/node_modules/next/dist/bin/next');
if(process.argv[2]==='build'){
  const d=require('./fixtures/accessibility-lab.cjs').prepare(root,lab);
  process.exit(spawnSync(process.execPath,[next,'build'],{cwd:d,env,stdio:'inherit'}).status??1);
}
if(process.argv[2]==='start'){
  process.chdir(path.join(lab,'dashboard'));process.env=env;require('./ci/isolate.cjs');
  process.argv=[process.execPath,next,'start','-p','3364','-H','127.0.0.1'];require(next);
}
