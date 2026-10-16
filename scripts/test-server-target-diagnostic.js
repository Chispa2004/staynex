import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as permissions from '../dashboard/lib/permissions.js';
import * as lifecycle from '../shared/hotels/lifecycle.js';

assert.equal(process.env.SEND_AUTOMATIONS, 'false');
assert.equal(process.env.GUEST_MEMORY_ENABLED, 'false');
const require = createRequire(new URL('../dashboard/package.json', import.meta.url));
const swc = require('next/dist/build/swc');
const sdk = require('@supabase/supabase-js');
const dotenv = require('dotenv');
let network = 0;
globalThis.fetch = () => { network++; throw Error('External transport forbidden'); };
const secret = 'synthetic-secret-never-log';
const refA = 'aaaaaaaaaaaaaaaaaaaa', refB = 'bbbbbbbbbbbbbbbbbbbb';
const urlA = `https://${refA}.supabase.co`, urlB = `https://${refB}.supabase.co`;
const defaultEnv = () => ({NODE_ENV:'production', SUPABASE_URL:urlA, SUPABASE_SERVICE_ROLE_KEY:secret,
  NEXT_PUBLIC_SUPABASE_URL:urlB, VERCEL_ENV:'production', VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)});
const compile = async (file, mocks={}, {env=defaultEnv(), logs=[], logThrows=false, source}={}) => {
  const {code} = await swc.transform(source ?? readFileSync(resolve(file),'utf8'), {
    filename:resolve(file), jsc:{target:'es2022',parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
  const module={exports:{}};
  const logger = Object.fromEntries(['info','warn','error','log'].map(level=>[level,(...args)=>{
    if(logThrows) throw Error(secret); logs.push({level,args});
  }]));
  new Function('require','module','exports','process','console',code)(name=>{
    assert(Object.hasOwn(mocks,name),`Unexpected import ${name}`); return mocks[name];
  },module,module.exports,{env},logger);
  return module.exports;
};
const diagnostic = (options) => compile('dashboard/lib/server-target-diagnostic.js',{'server-only':{}},options);
const factory = (env) => compile('dashboard/lib/supabase.js',{'@supabase/supabase-js':sdk},{env});
const event = logs => JSON.parse(logs[0].args[0]);
let groups=0; const pass = text => {groups++; console.log('PASS '+text);};

const env=defaultEnv(), logs=[];
const admin=await factory(env), client=admin.getSupabaseAdmin();
const diag=await diagnostic({env,logs});
env.SUPABASE_URL=urlB; // Evidence is the already constructed client, NOT reread configuration.
diag.recordCurrentHotelServerTarget(client);
assert.deepEqual(event(logs),{event:'staynex_server_supabase_target_v1',client:'dashboard.getSupabaseAdmin.GET_current_hotel',
  environment:'production',deployment:'a'.repeat(40),projectRef:refA});
diag.recordCurrentHotelServerTarget(admin.getSupabaseAdmin()); assert.equal(logs.length,1);
pass('actual SDK client destination, independent of public URL and later env changes; one attempt per module');

// Permanent instrumentation stays bounded during warm-instance reuse.
// Each new instance may emit once; there is no global deployment-wide limit.
for(let i=0;i<100;i++) diag.recordCurrentHotelServerTarget(client);
assert.equal(logs.length,1);
const coldLogs=[], coldDiagnostic=await diagnostic({env:defaultEnv(),logs:coldLogs});
for(let i=0;i<100;i++) coldDiagnostic.recordCurrentHotelServerTarget(client);
assert.equal(coldLogs.length,1);
assert.deepEqual(Object.keys(event(coldLogs)).sort(),['client','deployment','environment','event','projectRef']);
assert.equal(event(coldLogs).projectRef,refA);
assert.equal(network,0);
pass('persistent observability bounded across warm requests; each new instance has its own limit');

// Execute the actual next.config precedence, with synthetic dotenv contents only.
// No environment file is read or written. Real dotenv.populate implements override.
const resolvedEnv=defaultEnv(), seen=[];
await compile('dashboard/next.config.mjs',{
  dotenv:{config(options){seen.push(options);dotenv.populate(resolvedEnv,{
    SUPABASE_URL:options.path==='../.env'?urlB:'https://cccccccccccccccccccc.supabase.co'
  },options);return {parsed:{}};}},
  'node:path':{dirname:()=>resolve('dashboard'),resolve},'node:url':{fileURLToPath:()=>resolve('dashboard/next.config.mjs')}
},{env:resolvedEnv,source:readFileSync('dashboard/next.config.mjs','utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(resolve('dashboard/next.config.mjs')).href))});
assert.deepEqual(seen,[{path:'../.env'},{path:'.env.local',override:true}]);
const overrideLogs=[];
(await diagnostic({logs:overrideLogs})).recordCurrentHotelServerTarget((await factory(resolvedEnv)).getSupabaseAdmin());
assert.equal(event(overrideLogs).projectRef,'cccccccccccccccccccc');assert.equal(resolvedEnv.NEXT_PUBLIC_SUPABASE_URL,urlB);
const publicOnly={...defaultEnv()};delete publicOnly.SUPABASE_URL;
const publicOnlyFactory=await factory(publicOnly);
assert.throws(()=>publicOnlyFactory.getSupabaseAdmin(),/Missing SUPABASE_URL/);
pass('existing config override precedence executed with synthetic contents; no public fallback for server');

for(const value of [undefined,null,42,'',secret,'https://custom.invalid',urlA+'.evil.invalid',
  'http://'+refA+'.supabase.co',`https://${secret}@${refA}.supabase.co`,urlA+'?token='+secret,
  urlA+'/#'+secret,urlA+'/path',urlA+':444',urlA+'/../',urlA+'\n',urlA.replace('https:','HTTPS:')]) {
  const local=[]; (await diagnostic({logs:local})).recordCurrentHotelServerTarget({supabaseUrl:value});
  assert.equal(event(local).projectRef,'not_accredited');
  assert(!JSON.stringify(local).includes(secret)); assert(!JSON.stringify(local).includes('custom.invalid'));
}
for(const value of [urlA,urlA+'/']) {
  const local=[];(await diagnostic({logs:local})).recordCurrentHotelServerTarget({supabaseUrl:value});
  assert.equal(event(local).projectRef,refA);
}
const hostile=[];(await diagnostic({logs:hostile,env:{VERCEL_ENV:secret,VERCEL_GIT_COMMIT_SHA:secret}}))
  .recordCurrentHotelServerTarget({supabaseUrl:urlA});
assert.equal(event(hostile).environment,'unknown');assert.equal(event(hostile).deployment,'unavailable');
assert(!JSON.stringify(hostile).includes(secret));
const withId=[];(await diagnostic({logs:withId,env:{VERCEL_ENV:'preview',VERCEL_DEPLOYMENT_ID:'dpl_'+'a'.repeat(27)}}))
  .recordCurrentHotelServerTarget(client);
assert.equal(event(withId).deployment,'dpl_'+'a'.repeat(27));assert.equal(event(withId).environment,'preview');
pass('missing/malformed/unrecognized destinations and hostile metadata do not leak URLs or secrets');

const throwingLogs=[], broken=await diagnostic({logs:throwingLogs});
assert.doesNotThrow(()=>broken.recordCurrentHotelServerTarget({get supabaseUrl(){throw Error(secret)}}));
broken.recordCurrentHotelServerTarget(client);assert.equal(throwingLogs.length,0);
const logFailure=await diagnostic({logThrows:true});
assert.doesNotThrow(()=>logFailure.recordCurrentHotelServerTarget(client));
pass('getter/logger failure swallowed; no exception output, no repeated attempts');

// A separate backend singleton is not accredited by the Dashboard event.
const backendEnv=defaultEnv();backendEnv.SUPABASE_URL=urlB;
const backend=await compile('src/services/supabase.service.js',{'@supabase/supabase-js':sdk},{env:backendEnv});
const backendClient=backend.getSupabase();backendEnv.SUPABASE_URL=urlA;
assert.equal(backend.getSupabase(),backendClient);assert.equal(new URL(backendClient.supabaseUrl).hostname,`${refB}.supabase.co`);
assert.notEqual(client,backendClient);assert.equal(logs.length,1);
pass('distinct actual server factories: backend singleton remains separate; no backend instrumentation');

// Full GET -> real context -> real assignment resolver, controlled auth and SELECT transport.
const hotel={id:'synthetic-hotel',name:'Synthetic only'}, actor={id:'synthetic-actor',email:'actor@example.invalid'};
const assignment={id:'synthetic-assignment',hotel_id:hotel.id,hotel,user_id:actor.id,email:actor.email,
  role:'admin',status:'active',platform_role:'none',is_default:true};
const routePath='dashboard/app/api/current-hotel/route.js';
const harness=async({rows=[assignment],auth=actor,authError=null,legacy=false,disabledDiagnostic=false,logThrows=false}={})=>{
  const routeLogs=[],calls=[],env=defaultEnv();
  const db=(await factory(env)).getSupabaseAdmin();
  db.auth.getUser=async()=>{calls.push('auth.getUser');return {data:{user:auth},error:authError}};
  db.from=table=>{
    assert(['hotels','hotel_users','hotel_onboarding_state'].includes(table));
    let data=table==='hotel_users'?rows:table==='hotels'?[hotel]:[], single=false;
    const q={select(){calls.push('SELECT '+table);return q},order(){return q},limit(){return q},or(){return q},
      eq(key,value){data=data.filter(row=>row[key]===value);return q},
      in(key,values){data=data.filter(row=>values.includes(row[key]));return q},
      maybeSingle(){single=true;return q},
      then(yes,no){return Promise.resolve({data:single?(data[0]??null):data,error:null}).then(yes,no)}};
    for(const method of ['insert','update','upsert','delete','rpc'])q[method]=()=>{throw Error('Forbidden write')};
    return q;
  };
  db.rpc=()=>{throw Error('Forbidden RPC')};
  const invitations=await compile('dashboard/lib/user-invitations.js',{'../../shared/hotels/lifecycle.js':lifecycle},{env,logs:routeLogs});
  const current=await compile('dashboard/lib/current-hotel.js',{'../../shared/hotels/lifecycle.js':lifecycle,
    './supabase':{getSupabaseAdmin:()=>db},'./permissions':permissions,'./user-invitations':invitations},{env,logs:routeLogs});
  const instrument=disabledDiagnostic?{recordCurrentHotelServerTarget(){}}:await diagnostic({env,logs:routeLogs,logThrows});
  const mocks={'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@/lib/current-hotel':current,'@/lib/permissions':permissions,'@/lib/server-target-diagnostic':instrument,
    '@/lib/enterprise-audit':{writeEnterpriseAuditLog(){throw Error('Forbidden audit write')}},
    '@/lib/onboarding':{getOnboardingState:async()=>({hotel_id:hotel.id,onboarding_completed:false})},
    '../../../../shared/guest-memory/feature-flag.js':{isGuestMemoryEnabled:()=>false}};
  let source=readFileSync(routePath,'utf8');
  if(legacy)source=source.replace("import { recordCurrentHotelServerTarget } from '@/lib/server-target-diagnostic';",'')
    .replace(/    if \(user\?\.id && hotel\?\.id && !accessDenied && !fallback && canAccess\(role, 'dashboard'\)\) \{\r?\n      recordCurrentHotelServerTarget\(supabase\);\r?\n    \}\r?\n/,'');
  const route=await compile(routePath,mocks,{env,logs:routeLogs,source});
  const get=async(headers={authorization:'Bearer synthetic-token','x-staynex-hotel-id':hotel.id})=>{
    const response=await route.GET(new Request('https://synthetic.invalid/api/current-hotel',{headers}));
    return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.json()};
  };
  return {get,routeLogs,calls};
};
const before=await harness({legacy:true}), after=await harness();
const beforeResult=await before.get(), afterResult=await after.get();
assert.deepEqual(afterResult,beforeResult);assert.deepEqual(after.calls,before.calls);
assert.equal(before.routeLogs.length,0);
assert.equal(afterResult.body.hotel.id,hotel.id);assert.equal(after.routeLogs.length,1);
assert(!JSON.stringify(afterResult).includes('staynex_server_supabase_target_v1'));
assert(!JSON.stringify(afterResult).includes(refA));assert(!JSON.stringify(afterResult).includes(secret));
assert(!JSON.stringify(after.routeLogs).includes(actor.id));assert(!JSON.stringify(after.routeLogs).includes(hotel.id));
assert(!JSON.stringify(after.routeLogs).includes(actor.email));
await after.get();assert.equal(after.routeLogs.length,1);
pass('real GET/context/assignment resolver: identical JSON, status, headers and reads; no writes or cookies');

for(const options of [{auth:null},{auth:null,authError:{status:401,message:'synthetic expired'}},{rows:[]},
  {rows:[{...assignment,status:'disabled'}]},{rows:[{...assignment,status:'invited'}]},
  {rows:[{...assignment,hotel:{...hotel,status:'archived',archived_at:'2026-01-01T00:00:00Z'}}]},
  {rows:[{...assignment,role:'blocked'}]}]) {
  const test=await harness(options);const original=await harness({...options,legacy:true});
  assert.deepEqual(await test.get(),await original.get());
  assert(!test.routeLogs.some(row=>JSON.stringify(row).includes('staynex_server_supabase_target_v1')));
}
const missing=await harness();assert.equal((await missing.get({})).status,401);assert.equal(missing.routeLogs.length,0);
const success=await missing.get();assert.equal(success.status,200);assert.equal(missing.routeLogs.length,1);
const lostLog=await harness({logThrows:true});assert.deepEqual(await lostLog.get(),beforeResult);
pass('missing/invalid session, absent/disabled/invited/archived/blocked access: no diagnostic; original results preserved');

// Existing active legacy email assignments still read, but are NEVER attached by this GET.
const unbound=await harness({rows:[{...assignment,user_id:null}]});
assert.equal((await unbound.get()).status,200);
assert(unbound.calls.every(x=>x==='auth.getUser'||x.startsWith('SELECT ')));
const deferred=await harness();const gate=await deferred.get({authorization:'Bearer synthetic','x-staynex-context-only':'1'});
assert.equal(gate.body.onboardingGate.completed,false);
assert.equal(network,0);
pass('legacy unbound assignment not updated; deferred gate preserved; zero external fetch/provider calls');

// Inspect the complete SDK transport, not just a query-builder double. The chosen
// request excludes the optional onboarding gate; no application page is loaded.
const sdkReadJourney = async ({status='active',unbound=false,oldWriterControl=false}={}) => {
  const calls=[],privateLogs=[],env=defaultEnv();
  const transport=async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    const method=options.method||'GET';calls.push({method,path:url.pathname});
    assert.equal(url.origin,urlA,'Only the synthetic Supabase origin is allowed');
    if(method!=='GET')throw Error('Writer reached: synthetic transport rejected mutation');
    if(url.pathname==='/auth/v1/user')return Response.json({...actor,aud:'authenticated'});
    if(url.pathname==='/rest/v1/hotel_users') {
      let rows=[{...assignment,platform_role:'platform_admin',user_id:unbound?null:actor.id,status}];
      const filter=url.searchParams.get('status');
      if(filter==='in.(active)') rows=rows.filter(x=>x.status==='active');
      if(filter==='eq.invited') rows=rows.filter(x=>x.status==='invited');
      return Response.json(rows);
    }
    if(url.pathname==='/rest/v1/hotels')return Response.json([hotel]);
    throw Error('Unexpected SDK request');
  };
  const blockedFetch=globalThis.fetch;
  try {
    globalThis.fetch=transport;
    const actualFactory=await factory(env);
    // These are the production helpers and SDK methods, with only fetch replaced.
    const invites=await compile('dashboard/lib/user-invitations.js',{'../../shared/hotels/lifecycle.js':lifecycle},{env,logs:privateLogs});
    const current=await compile('dashboard/lib/current-hotel.js',{
      '../../shared/hotels/lifecycle.js':lifecycle,'./supabase':actualFactory,
      './permissions':permissions,'./user-invitations':invites},{env,logs:privateLogs});
    const request=new Request('https://synthetic.invalid/api/current-hotel',{headers:{
      authorization:'Bearer synthetic-session','x-staynex-hotel-id':hotel.id,'x-staynex-workspace-path':'/dashboard'}});
    if(oldWriterControl) {
      // Negative control: the same observer catches legacy attachment when readOnly is absent.
      await current.getCurrentHotelForRequest(request).catch(()=>{});
    } else {
      const route=await compile(routePath,{
        'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
        '@/lib/current-hotel':current,'@/lib/permissions':permissions,
        '@/lib/server-target-diagnostic':await diagnostic({env,logs:privateLogs}),
        '@/lib/onboarding':{getOnboardingState(){throw Error('Chosen read must not call gate')}},
        '@/lib/enterprise-audit':{writeEnterpriseAuditLog(){throw Error('No audit writer allowed')}},
        '../../../../shared/guest-memory/feature-flag.js':{isGuestMemoryEnabled:()=>false}
      },{env,logs:privateLogs});
      const response=await route.GET(request);const body=await response.json();
      assert.equal(response.status,200);
      assert.equal(body.accessDenied,status!=='active');
      assert.equal(response.headers.get('set-cookie'),null);
      assert.equal(privateLogs.filter(x=>JSON.stringify(x).includes('staynex_server_supabase_target_v1')).length,status==='active'?1:0);
      assert(calls.every(x=>x.method==='GET'));
      assert.equal(calls.filter(x=>x.path==='/auth/v1/user').length,1);
      assert(!calls.some(x=>x.path.includes('/rpc/')||x.path.includes('/token')));
    }
    return calls;
  } finally {globalThis.fetch=blockedFetch;}
};
await sdkReadJourney();await sdkReadJourney({unbound:true});
await sdkReadJourney({status:'invited',unbound:true});await sdkReadJourney({status:'disabled'});
const writerControl=await sdkReadJourney({status:'invited',unbound:true,oldWriterControl:true});
assert(writerControl.some(x=>x.method==='PATCH'),'Negative control must detect the legacy writer');
pass('full SDK GET journey: Auth user + SELECT only; no refresh, RPC, attachment or audit; negative control detects writer');

if(process.argv.includes('--built')) {
  const files=(dir)=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
  const marker='staynex_server_supabase_target_v1';
  for(const file of files('dashboard/.next/static'))assert(!readFileSync(file).includes(Buffer.from(marker)),file);
  assert(files('dashboard/.next/server').some(file=>readFileSync(file).includes(Buffer.from(marker))));
  const middleware=JSON.parse(readFileSync('dashboard/.next/server/middleware-manifest.json','utf8'));
  assert.deepEqual(middleware.middleware,{});assert.deepEqual(middleware.functions,{});
  pass('built artifact contains event in server output and nowhere in browser static bundles');
}
console.log(`${groups} server target diagnostic groups passed; synthetic only, external calls=${network}`);
