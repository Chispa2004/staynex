const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),lab=process.env.PENDING_LAB_DIR||path.join(root,'.npm-cache/pending-tickets-lab');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|CI)$/i.test(key)));
Object.assign(env,{SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',NEXT_MANUAL_SIG_HANDLE:'true',NODE_OPTIONS:`--require "${path.join(root,'scripts/ci/isolate.cjs').replaceAll('\\','/')}"`});
const next=path.join(root,'dashboard/node_modules/next/dist/bin/next');
if(process.argv[2]==='build') {
  const d=require('./fixtures/accessibility-lab.cjs').prepare(root,lab);
  const file=path.join(d,'lib/lab-fixture.js');
  let data=fs.readFileSync(file,'utf8');
  data+=`
rows.guests=[{id:id(500),hotel_id:hotel.id,name:'Huésped sintético'}];rows.messages=[];
rows.tickets=Array.from({length:507},(_,n)=>({id:id(2000+n),hotel_id:hotel.id,guest_id:id(500),conversation_id:id(100),title:'Petición de toallas · '+n,description:'Dos toallas. Datos ficticios, sin transporte.',room_number:'201',priority:'normal',category:'housekeeping',status:'open',created_at:'2026-01-01T12:00:00Z'}));
rows.tickets[500]={...rows.tickets[500],title:'Fuga de agua · revisión urgente',priority:'urgent',created_at:new Date().toISOString()};
rows.tickets[501]={...rows.tickets[501],title:'Aire acondicionado sin funcionar',priority:'high',status:'in_progress',created_at:new Date().toISOString()};
rows.tickets[502]={...rows.tickets[502],title:'Consulta pendiente de confirmar',priority:'normal',status:'pending',created_at:new Date().toISOString()};
rows.tickets[503]={...rows.tickets[503],title:'Solicitud completada',priority:'urgent',status:'completed'};
rows.tickets[504]={...rows.tickets[504],title:'Solicitud cancelada',priority:'urgent',status:'cancelled'};
rows.tickets[505]={...rows.tickets[505],title:'Solicitud cerrada',priority:'urgent',status:'closed'};
rows.tickets[506]={...rows.tickets[506],title:'Toallas SIMULADAS',priority:'high',conversation_id:id(99),created_at:new Date().toISOString()};
rows.messages=[{id:id(999),hotel_id:hotel.id,conversation_id:id(99),metadata:{demo:true},sender_type:'guest',content:'Ejemplo sin envío',created_at:new Date().toISOString()}];
`;
  fs.writeFileSync(file,data);
  process.exit(spawnSync(process.execPath,[next,'build'],{cwd:d,env,stdio:'inherit'}).status??1);
}
if(process.argv[2]==='start') {
  process.chdir(path.join(lab,'dashboard'));process.env=env;require('./ci/isolate.cjs');
  process.argv=[process.execPath,next,'start','-p',process.env.PORT||process.argv[3]||'3370','-H','127.0.0.1'];require(next);
}
