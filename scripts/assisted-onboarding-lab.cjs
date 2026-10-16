// Local-only synthetic Auth/database transport. Never loads credentials or .env.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn,spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),lab=path.join(root,'.npm-cache/assisted-onboarding-lab'),d=path.join(lab,'dashboard');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));
Object.assign(env,{SEND_AUTOMATIONS:'false',GUEST_MEMORY_ENABLED:'false',USE_MOCK_AI:'true',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--require "'+path.join(root,'scripts/ci/isolate.cjs').replaceAll('\\','/')+'"'});
const next=path.join(root,'dashboard/node_modules/next/dist/bin/next');
const put=(file,text)=>{const dest=path.join(d,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);};
if(process.argv[2]==='build'){
 require('./fixtures/density-lab.cjs').prepare(root,lab);
 for(const file of ['app/invite/page.js','app/api/access-invitations/route.js','app/api/platform/hotels/[id]/invitations/route.js','app/api/onboarding/state/route.js','app/api/onboarding/hotel/route.js','app/api/onboarding/information-review/route.js','app/api/knowledge/route.js'])
   put(file,fs.readFileSync(path.join(root,'dashboard',file),'utf8'));
 // Health and users use their real GET handlers, with the same scoped synthetic context.
 for(const [file,end] of [['app/api/health/hotel/route.js','export async function PATCH'],['app/api/settings/users/route.js','export async function POST']]){
  const source=fs.readFileSync(path.join(root,'dashboard',file),'utf8');put(file,source.slice(0,source.indexOf(end)));
 }
 const fallbackPath=path.join(d,'app/api/[...route]/route.js');
 fs.writeFileSync(fallbackPath,"import {getCurrentHotelForRequest} from '@/lib/assisted-lab-server';\n"+fs.readFileSync(fallbackPath,'utf8').replace('const p=new URL(request.url).pathname;','const p=new URL(request.url).pathname;const {hotel}=await getCurrentHotelForRequest(request);'));
 // Authentication and DB are simulated; the invitation/profile/state/knowledge handlers are copied unchanged.
 put('lib/supabase.js',"export {getSupabaseAdmin} from './assisted-lab-server';");
 put('lib/current-hotel.js',"export {getCurrentHotelForRequest} from './assisted-lab-server';");
 put('lib/platform.js',"export {getPlatformContext} from './assisted-lab-server'; export const writePlatformAuditLog=async()=>{};");
 put('lib/enterprise-audit.js',"export const writeEnterpriseAuditLog=async()=>{};");
 put('lib/assisted-lab-server.js',fs.readFileSync(path.join(root,'scripts/fixtures/assisted-lab-server.js'),'utf8'));
 put('lib/supabase-browser.js',fs.readFileSync(path.join(root,'scripts/fixtures/assisted-lab-auth.js'),'utf8'));
 const platformRoute=fs.readFileSync(path.join(root,'dashboard/app/api/platform/hotels/route.js'),'utf8');
 put('app/api/platform/hotels/route.js',`import {NextResponse} from 'next/server';import {getPlatformContext} from '@/lib/assisted-lab-server';import {createHotelAtomically} from '@/lib/hotel-creation';import {readHotelJson} from '../../../../../shared/onboarding/hotel-fields.js';const writePlatformAuditLog=async()=>{};`+platformRoute.slice(platformRoute.indexOf('export async function POST'),platformRoute.indexOf('export async function PATCH')));
 put('app/api/lab-auth/route.js',`import {NextResponse} from 'next/server';export async function POST(request){const body=await request.json();const r=await fetch('http://127.0.0.1:3391/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return NextResponse.json(await r.json(),{status:r.status});}`);
 put('app/api/current-hotel/route.js',`import {NextResponse} from 'next/server';import {getCurrentHotelForRequest} from '@/lib/current-hotel';export async function GET(r){try{const {supabase,...c}=await getCurrentHotelForRequest(r);return NextResponse.json({...c,directoryDeferred:false});}catch{return NextResponse.json({error:'Sesión sintética requerida'},{status:403});}}`);
 put('app/api/workspace-directory/route.js',"export {GET} from '../current-hotel/route';");
 put('app/api/pms-connections/route.js',`import {NextResponse} from 'next/server';import {getCurrentHotelForRequest} from '@/lib/current-hotel';import {PMS_PROVIDER_CATALOG} from '@/lib/pms-providers';export async function GET(r){const c=await getCurrentHotelForRequest(r);return NextResponse.json({ok:true,hotel:c.hotel,hotelId:c.hotel.id,role:c.role,canManage:false,providers:PMS_PROVIDER_CATALOG,connections:[]});}`);
 put('app/lab/page.js',fs.readFileSync(path.join(root,'scripts/fixtures/assisted-lab-page.jsx'),'utf8'));
 // Lab composition uses the production form, not a second implementation.
 const consolePath=path.join(d,'components/PlatformConsoleClient.js');
 fs.writeFileSync(consolePath,fs.readFileSync(consolePath,'utf8').replace('const CreateHotelForm =','export const CreateHotelForm ='));
 const shell=path.join(d,'components/AppShell.js');fs.writeFileSync(shell,fs.readFileSync(shell,'utf8').replace("pathname === '/invite'","pathname === '/invite' || pathname === '/lab'"));
 process.exit(spawnSync(process.execPath,[next,'build'],{cwd:d,env,stdio:'inherit'}).status??1);
}
if(process.argv[2]!=='start')throw Error('Use build or start');
process.env=env;require('./ci/isolate.cjs');
const db=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env});
const sql=input=>execFileSync(db.docker,[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input,env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),q=v=>v===null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
const ident=v=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))throw Error('Invalid identifier');return '"'+v+'"';};
const rows=statement=>JSON.parse(sql('SELECT coalesce(jsonb_agg(x),\'[]\') FROM ('+statement+') x;'));
sql(fs.readFileSync(path.join(root,'scripts/fixtures/assisted-onboarding-schema.sql'),'utf8'));
sql(`ALTER TABLE hotels ADD COLUMN timezone_expected text;ALTER TABLE hotels ADD COLUMN timezone_override_reason text;ALTER TABLE hotels ADD COLUMN timezone_last_checked_at timestamptz;ALTER TABLE hotels ADD COLUMN created_at timestamptz DEFAULT now();
 CREATE TABLE hotel_knowledge(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid,title text,key text,category text,value text,is_active boolean,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE local_knowledge_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid,title text,description text,active boolean,updated_at timestamptz DEFAULT now());
 INSERT INTO auth.users VALUES ('${id(1)}','platform@example.invalid',now(),null),('${id(2)}','owner@example.invalid',now(),null);
 INSERT INTO hotels(id,name,slug,timezone,ai_auto_reply_enabled,hotel_live_mode,metadata) VALUES ('${id(10)}','Staynex laboratorio','lab','Europe/Madrid',false,false,'{}');
 INSERT INTO hotel_users(id,hotel_id,user_id,email,role,status,platform_role) VALUES ('${id(20)}','${id(10)}','${id(1)}','platform@example.invalid','admin','active','platform_admin');`);
for(const file of ['create_hotel_onboarding.sql','add_atomic_hotel_onboarding.sql','add_hotel_access_invitations.sql','guard_explicit_invitation_acceptance.sql','add_hotel_information_review.sql'])sql(fs.readFileSync(path.join(root,'supabase/sql',file),'utf8'));
const stored=new Set(['hotels','hotel_users','hotel_onboarding_state','hotel_access_invitations','hotel_knowledge','local_knowledge_items']);
const rpcNames=new Set(['create_hotel_onboarding_v1','save_hotel_onboarding_v1','manage_hotel_invitation_v1','accept_hotel_invitation_v1','hotel_identity_evidence_v1','hotel_information_review_v1']);
const server=http.createServer(async(req,res)=>{
 let text='';for await(const chunk of req)text+=chunk;
 try{
  const b=JSON.parse(text||'{}');let result;
  if(req.url==='/auth'){
   if(!String(b.email||'').endsWith('@example.invalid'))throw Error('Synthetic addresses only');
   let user=rows('SELECT * FROM auth.users WHERE email='+q(b.email))[0];
   if(b.action==='signup'&&!user){sql('INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'+q(b.email)+')');user=rows('SELECT * FROM auth.users WHERE email='+q(b.email))[0];}
   if(b.action==='verify'&&user){sql('UPDATE auth.users SET email_confirmed_at=now() WHERE id='+q(user.id));user.email_confirmed_at=new Date().toISOString();}
   if(!user)throw Error('Cuenta sintética inexistente');
   result={user,session:b.action==='signup'?null:{access_token:'synthetic:'+user.id,user}};
  }else if(b.op==='user'){
   result={data:{user:rows('SELECT * FROM auth.users WHERE id='+q(String(b.token).replace('synthetic:','')))[0]||null}};
  }else if(b.op==='rpc'){
   if(!rpcNames.has(b.name))throw Error('Unexpected lab RPC');
   const args=Object.entries(b.args).map(([k,v])=>ident(k)+'=>'+q(v)).join(',');
   const output=sql('SET ROLE service_role;SELECT '+ident(b.name)+'('+args+');');
   result={data:b.name==='hotel_identity_evidence_v1'?output.split('\n').filter(Boolean).map(id=>({id})):JSON.parse(output),error:null};
  }else if(b.op==='query'){
   if(!stored.has(b.table)){result={data:b.single?null:[],count:0,error:null};}
   else {
    const where=b.filters.length?' WHERE '+b.filters.map(([op,k,v])=>ident(k)+(op==='eq'?'='+q(v):op==='in'?' IN ('+v.map(q).join(',')+')':op==='is'?' IS '+(v===null?'NULL':'NOT NULL'):op==='neq'?' IS DISTINCT FROM '+q(v):op==='gte'?'>='+q(v):'<'+q(v))).join(' AND '):'';
    let statement='SELECT * FROM '+ident(b.table)+where;
    if(b.patch){
     if(b.mode==='update')statement='UPDATE '+ident(b.table)+' SET '+Object.entries(b.patch).map(([k,v])=>ident(k)+'='+q(v)).join(',')+where+' RETURNING *';
     else statement='INSERT INTO '+ident(b.table)+'('+Object.keys(b.patch).map(ident).join(',')+') VALUES('+Object.values(b.patch).map(q).join(',')+') RETURNING *';
    }
    let data=b.patch?JSON.parse(sql('WITH result AS ('+statement+') SELECT coalesce(jsonb_agg(result),\'[]\') FROM result;')):rows(statement);
    if(b.table==='hotel_users'&&b.select?.includes('hotel:hotels'))data=data.map(u=>({...u,hotel:rows('SELECT * FROM hotels WHERE id='+q(u.hotel_id))[0]}));
    if(b.order)data.sort((a,c)=>String(c[b.order]||'').localeCompare(String(a[b.order]||'')));
    const count=data.length;data=data.slice(0,b.limit||10000);result={data:b.single?data[0]||null:data,count,error:null};
   }
  }else throw Error('Lab operation unavailable');
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 }catch(error){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:null,error:{message:'Synthetic operation failed',code:error.message.includes('42501')?'42501':'SYNTHETIC'}}));}
});
server.listen(3391,'127.0.0.1',()=>{
 console.log('Synthetic PostgreSQL and Auth ready; no external transports. UI http://127.0.0.1:3390/lab');
 const child=spawn(process.execPath,[next,'start','-p','3390','-H','127.0.0.1'],{cwd:d,env,stdio:'inherit'});
 const cleanup=()=>{child.kill();server.close();db.cleanup();};
 process.once('SIGINT',()=>{cleanup();process.exit(0);});process.once('SIGTERM',()=>{cleanup();process.exit(0);});child.once('exit',()=>{server.close();db.cleanup();});
});
