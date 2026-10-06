const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),lab=path.join(root,'.npm-cache/dashboard-demo-lab');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|CI)$/i.test(k)));
Object.assign(env,{SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',NEXT_MANUAL_SIG_HANDLE:'true',NODE_OPTIONS:`--require "${path.join(root,'scripts/ci/isolate.cjs').replaceAll('\\','/')}"`});
const next=path.join(root,'dashboard/node_modules/next/dist/bin/next');
if(process.argv[2]==='build') {
  const d=require('./fixtures/accessibility-lab.cjs').prepare(root,lab);
  const put=(file,s)=>{const p=path.join(d,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
  // These are entirely synthetic records in a local copied app. Reuse the fixed
  // presentation ID to exercise the exact allowlist; never connect to Supabase.
  fs.appendFileSync(path.join(d,'lib/lab-fixture.js'),`
hotel.id='1ef60a40-b65f-4bff-9bd3-22654e5029f2';hotel.slug='hotel-demo-checkin';hotel.name='Hotel QA demo · datos sintéticos';
for(const m of messages)m.hotel_id=hotel.id;
for(const c of threads){c.hotel_id=hotel.id;c.aiState.hotel_id=hotel.id;c.room_number=c.guest.current_room;}
for(const list of Object.values(rows))for(const row of list)row.hotel_id=hotel.id;
export const getOnboardingState=async()=>({hotel_id:hotel.id,onboarding_completed:true});
`);
  for(const name of ['executive-dashboard','current-hotel']) {
    let s=fs.readFileSync(path.join(root,'dashboard/app/api',name,'route.js'),'utf8').replace("from '@/lib/current-hotel'","from '@/lib/lab-fixture'");
    if(name==='current-hotel')s=s.replace("from '@/lib/onboarding'","from '@/lib/lab-fixture'");
    put('app/api/'+name+'/route.js',s);
  }
  put('lib/dashboard-messages.js',fs.readFileSync(path.join(root,'dashboard/lib/dashboard-messages.js'),'utf8').replace("from './inbox'","from './lab-fixture'"));
  process.exit(spawnSync(process.execPath,[next,'build'],{cwd:d,env,stdio:'inherit'}).status??1);
}
if(process.argv[2]==='start'){
  process.chdir(path.join(lab,'dashboard'));process.env=env;require('./ci/isolate.cjs');
  process.argv=[process.execPath,next,'start','-p','3372','-H','127.0.0.1'];require(next);
}
