import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fields from '../shared/onboarding/hotel-fields.js';
import * as whatsapp from '../shared/onboarding/whatsapp-dependency.js';
import * as creation from '../dashboard/lib/hotel-creation.js';
import { submitHotelCreation, confirmedOnboardingResult } from '../dashboard/lib/hotel-creation-client.js';
import * as location from '../shared/location/hotel-location-integrity.js';
import * as pilot from '../dashboard/lib/pilot-onboarding.js';
import * as pms from '../shared/pms/safe-connection.js';
import * as health from '../dashboard/lib/system-health.js';
import { createOnboardingStore } from './fixtures/onboarding-store.js';

assert.equal(process.env.SEND_AUTOMATIONS,'false');
const require=createRequire(new URL('../dashboard/package.json',import.meta.url));
const swc=require('next/dist/build/swc');
const compile=async(path,mocks)=>{
  const {code}=await swc.transform(readFileSync(new URL(path,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
  const module={exports:{}};
  new Function('require','module','exports',code)(id=>id.endsWith('/whatsapp-dependency.js')?whatsapp:mocks[id]||require(id),module,module.exports);
  return module.exports;
};
const next={NextResponse:{json:(body,options)=>Response.json(body,options)}};
const key='00000000-0000-4000-8000-000000000001';
const valid={name:'Hotel sintético',country_code:'ES',city:'Madrid',timezone:'Europe/Madrid',admin_email:'admin@example.invalid'};
const request=(body,method='POST',hotel='hotel-onboarding-a')=>new Request('http://localhost/api/test',{method,headers:{'content-type':'application/json','Idempotency-Key':key,'x-staynex-hotel-id':hotel},...(method==='GET'?{}:{body:JSON.stringify(body)})});
let calls=[],authorized=true;
const result={hotel:{id:'created'},hotelUser:{id:'access',hotel_id:'created',role:'admin'},state:{id:'state',hotel_id:'created',onboarding_completed:false}};
const supabase={rpc:async(name,args)=>{calls.push({name,args});return {data:structuredClone(result),error:null};}};
const context=async()=>{if(!authorized)throw Object.assign(new Error('Access denied'),{status:403});return {supabase,user:{id:key,email:'owner@example.invalid'},canCreateWorkspaces:true};};
const platform=await compile('../dashboard/app/api/platform/hotels/route.js',{
  'next/server':next,'@/lib/hotel-creation':creation,'@/lib/platform':{getPlatformContext:context,writePlatformAuditLog:async()=>{}},
  '../../../../../shared/location/hotel-location-integrity.js':location,'../../../../../shared/onboarding/hotel-fields.js':fields
});
const workspace=await compile('../dashboard/app/api/workspaces/route.js',{
  'next/server':next,'@/lib/current-hotel':{getCurrentHotelForRequest:context},'@/lib/hotel-creation':creation,
  '../../../../shared/onboarding/hotel-fields.js':fields
});
for(const body of [null,[],{},...['name','country_code','city','timezone','admin_email'].flatMap(field=>[undefined,'','  ',42,{},null].map(value=>({...valid,[field]:value}))),
  {...valid,timezone:'Mars/City'},{...valid,admin_email:'a@b'},{...valid,whatsapp_number:'local-test'},{...valid,check_in_time:'25:99'},
  {...valid,name:'x'.repeat(121)},{...valid,support_email:'bad'},{...valid,logo_url:'javascript:alert(1)'}]) {
  const response=await platform.POST(request(body));assert([400,422].includes(response.status),JSON.stringify(body));
  assert(Object.keys((await response.json()).fields).length);
}
assert.equal(calls.length,0,'invalid direct requests perform no writes');
const malformed=new Request('http://localhost',{method:'POST',body:'{'});
assert.equal((await platform.POST(malformed)).status,400);assert.equal(calls.length,0);
console.log('PASS invalid creation/direct requests, types/formats/limits and field errors before writes');
authorized=false;
for(const route of [platform,workspace])assert.equal((await route.POST(request(valid))).status,403);
assert.equal(calls.length,0);authorized=true;
for(const route of [platform,workspace])assert.equal((await route.POST(request({...valid,ai_auto_reply_enabled:true,metadata:{live_automation_gates_verified:true}}))).status,201);
assert.equal(calls.length,2);assert.equal(calls[0].args.p_hotel.name,valid.name);
assert.equal(calls[0].args.p_hotel.metadata,undefined);assert.equal(calls[0].args.p_hotel.ai_auto_reply_enabled,undefined);
assert.equal(calls[1].args.p_mode,'workspace');assert.equal(calls[1].args.p_email,'owner@example.invalid');
console.log('PASS authorized handlers call one atomic contract, separate initial creation from live flags');

const store=createOnboardingStore();
const current={'getCurrentHotelForRequest':store.context};
const onboarding=await compile('../dashboard/lib/onboarding.js',{'./current-hotel':current,'./pilot-onboarding.js':pilot,'../../shared/pms/safe-connection.js':pms,'./system-health.js':health});
const audit={writeEnterpriseAuditLog:async()=>{}};
const state=await compile('../dashboard/app/api/onboarding/state/route.js',{'next/server':next,'@/lib/onboarding':onboarding,'@/lib/pilot-onboarding':pilot,'@/lib/enterprise-audit':audit,'../../../../../shared/location/hotel-location-integrity.js':location,'../../../../../shared/onboarding/hotel-fields.js':fields});
const profile=await compile('../dashboard/app/api/onboarding/hotel/route.js',{'next/server':next,'@/lib/current-hotel':current,'@/lib/enterprise-audit':audit,'../../../../../shared/location/hotel-location-integrity.js':location,'../../../../../shared/onboarding/hotel-fields.js':fields});
const finish=()=>state.PATCH(request({onboarding_completed:true,current_step:'readiness'},'PATCH'));
assert.equal((await finish()).status,422);assert.equal(store.writes.length,0);
assert.equal((await state.PATCH(request({onboarding_completed:'false'},'PATCH'))).status,400);
assert.equal((await state.PATCH(request({hotelId:'another',onboarding_completed:true},'PATCH'))).status,403);
assert.equal((await state.PATCH(request({onboarding_completed:true},'PATCH','other'))).status,403);
for(const role of ['receptionist','blocked']){store.role=role;assert.equal((await finish()).status,403);assert.equal((await profile.PATCH(request({name:'Valid'},'PATCH'))).status,403);}
store.role='admin';
for(const name of ['',{},'  ',null])assert.equal((await profile.PATCH(request({name},'PATCH'))).status,422);
assert.equal(store.writes.length,0);
console.log('PASS completion cannot bypass readiness, role/hotel scope or profile validation');

store.tables.hotel_users[0].status='active';
store.tables.hotels[0].whatsapp_number='+34000000000';
store.tables.hotel_knowledge.push({id:'knowledge',hotel_id:store.tables.hotels[0].id,key:'arrival',value:'Entrada a las 15:00',is_active:true});
const before=structuredClone(store.tables.hotels);
store.failNextWrite=true;assert.equal((await finish()).status,503);
assert.equal(store.tables.hotel_onboarding_state[0].onboarding_completed,false);
let completed=await finish();assert.equal(completed.status,200);
const body=await completed.json();assert.equal(body.state.onboarding_completed,true);assert(body.state.onboarding_completed_at);
assert.equal(confirmedOnboardingResult(body,store.tables.hotels[0].id,true).redirectHref,'/dashboard/health');
assert.deepEqual(store.tables.hotels,before,'completion never activates hotel flags');
await state.PATCH(request({current_step:'users',onboarding_completed:false,completed_steps:['invented']},'PATCH'));
assert.equal(store.tables.hotel_onboarding_state[0].onboarding_completed,true);
assert(!store.tables.hotel_onboarding_state[0].completed_steps.includes('invented'));
assert.equal((await finish()).status,200);
console.log('PASS persisted completion, failure/recovery, correct destination, existing completed hotel and late progress');

const originalFrom=store.supabase.from;
store.supabase.from=table=>table==='hotel_onboarding_state'?{select(){return this;},eq(){return this;},limit(){return this;},maybeSingle:async()=>({error:{message:'hotel_onboarding_state missing'}})}:originalFrom(table);
const missing=await (await state.GET(request(null,'GET'))).json();assert.equal(missing.schemaReady,false);assert.equal(missing.state.onboarding_completed,false);
assert.equal((await finish()).status,503);
store.supabase.from=originalFrom;
const originalRows=store.tables.hotel_onboarding_state.splice(0);const writes=store.writes.length;
const pending=await (await state.GET(request(null,'GET'))).json();assert.equal(pending.state.onboarding_completed,false);assert.equal(store.writes.length,writes);
store.tables.hotel_onboarding_state.push(...originalRows);
const failing=originalFrom('hotel_users');
store.supabase.from=table=>table==='hotel_users'?new Proxy(failing,{get(target,prop){return prop==='then'?(resolve)=>Promise.resolve({error:{message:'synthetic unavailable'}}).then(resolve):typeof target[prop]==='function'?()=>store.supabase.from(table):target[prop];}}):originalFrom(table);
assert.equal((await finish()).status,503);store.supabase.from=originalFrom;
console.log('PASS missing schema, missing state and unavailable dependency never fake completion; GET is read-only');

const memory=new Map();const storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const seen=[];let lost=true;
const transport=async(url,options)=>{seen.push(options.headers['Idempotency-Key']);if(lost){lost=false;throw new Error('response lost AFTER commit');}return Response.json({ok:true,...result});};
await assert.rejects(submitHotelCreation({mode:'platform',actorId:'actor-a',form:valid,storage,uuid:()=>key,fetchImpl:transport}));
assert.equal(memory.size,1);
await submitHotelCreation({mode:'platform',actorId:'actor-a',form:valid,storage,uuid:()=>{throw Error('must reuse');},fetchImpl:transport});
assert.deepEqual(seen,[key,key]);assert.equal(memory.size,0);
await assert.rejects(submitHotelCreation({mode:'platform',actorId:'actor-a',form:valid,storage,uuid:()=>key,fetchImpl:async()=>Response.json({ok:true,hotel:{id:'incomplete'}})}));assert.equal(memory.size,1);
for(const invalid of [{}, {...body,state:null},{...body,hotel:{id:'other'}},{...body,state:{...body.state,onboarding_completed:false}}])assert.throws(()=>confirmedOnboardingResult(invalid,body.hotel.id,true));
assert.equal(valid.name,'Hotel sintético');
console.log('PASS browser contract preserves retry key after lost/incomplete response and rejects false completion');
// The saved draft is scoped to the signed-in actor. Recover the original
// operation explicitly after edits/reload, never invent a fresh operation.
let recoveryCalls=0;
await assert.rejects(submitHotelCreation({mode:'platform',actorId:'actor-a',form:{...valid,name:'Changed draft'},storage,uuid:()=>key,fetchImpl:async()=>{recoveryCalls++;}}),e=>e.needsRecovery===true);
assert.equal(recoveryCalls,0);
await submitHotelCreation({mode:'platform',actorId:'actor-a',recover:true,form:{},storage,fetchImpl:async(_url,options)=>{
  assert.equal(JSON.parse(options.body).name,valid.name);assert.equal(options.headers['Idempotency-Key'],key);
  return Response.json({ok:true,...result});
}});
await assert.rejects(submitHotelCreation({mode:'platform',actorId:'actor-a',form:valid,storage,uuid:()=>key,fetchImpl:async()=>{throw Error('uncertain');}}));
await submitHotelCreation({mode:'platform',actorId:'actor-b',form:{...valid,name:'Other actor'},storage,uuid:()=> '00000000-0000-4000-8000-000000000002',fetchImpl:async(_url,options)=>{
  assert.equal(JSON.parse(options.body).name,'Other actor');assert.notEqual(options.headers['Idempotency-Key'],key);return Response.json({ok:true,...result});
}});
assert.equal(memory.size,1,'another account cannot consume the pending draft');
console.log('PASS explicit recovery preserves original request and isolates browser journal by actor');

// Execute the actual event callbacks, including their error branches and router
// calls. This supplements the real HTTP handlers and the interactive browser run.
const wizardSource=readFileSync(new URL('../dashboard/components/onboarding/OnboardingWizard.js',import.meta.url),'utf8');
const callback=(source,name,nextName,bindings)=>{
  const start=source.indexOf(`  const ${name} = `), end=source.indexOf(`  const ${nextName} = `,start);
  assert(start>=0 && end>start);
  const expression=source.slice(start,end).trim().replace(`const ${name} = `,'').replace(/;$/,'');
  return new Function(...Object.keys(bindings),'return '+expression)(...Object.values(bindings));
};
for(const scenario of ['success','incomplete','foreign','rejected','network']) {
  const events=[],notices=[],errors=[],routes=[];
  const responseBody=scenario==='incomplete'?{ok:true}:scenario==='foreign'?{...body,hotel:{id:'other'}}:body;
  const saveProgress=callback(wizardSource,'saveProgress','selectStep',{
    currentStep:'hotel',canManage:true,hotel:body.hotel,completedBlocks:[],
    setFieldErrors(){},setSaving(){},setError:value=>errors.push(value),setSuccess:value=>notices.push(value),setState(){},setCurrentStep(){},
    getAuthHeaders:async()=>({}),confirmedOnboardingResult,sanitizeError:value=>value,CustomEvent,
    window:{dispatchEvent:event=>events.push(event.detail)},
    fetch:async()=>{if(scenario==='network')throw Error('synthetic timeout');return Response.json(scenario==='rejected'?{error:'Requisito pendiente'}:responseBody,{status:scenario==='rejected'?422:200});}
  });
  const complete=callback(wizardSource,'completeConfiguration','handleHotelSaved',{profileDirty:false,saving:false,saveProgress,router:{push:path=>routes.push(path)}});
  await complete();
  if(scenario==='success') {assert.deepEqual(routes,['/dashboard/health']);assert.equal(events[0].state.hotel_id,body.hotel.id);assert.equal(events[0].completionConfirmed,true);assert(notices.some(Boolean));}
  else {assert.equal(routes.length,0);assert.equal(events.length,0);assert(errors.some(Boolean));}
  const dirty=callback(wizardSource,'completeConfiguration','handleHotelSaved',{profileDirty:true,saving:false,saveProgress:()=>{throw Error('unsaved profile must block completion');},router:{push(){throw Error();}}});
  await dirty();
}
const setupSource=readFileSync(new URL('../dashboard/components/onboarding/StepHotelSetup.js',import.meta.url),'utf8');
const saveStart=setupSource.indexOf('  const save = async'),saveEnd=setupSource.indexOf('\n  return (',saveStart);
const saveExpression=setupSource.slice(saveStart,saveEnd).trim().replace('const save = ','').replace(/;$/,'');
const draft={...valid};let profileSaved=0;const profileErrors=[];
const saveBindings={canEdit:true,setSaving(){},setMessage:value=>profileErrors.push(value),setFieldErrors(){},form:draft,hotel:body.hotel,
  validateHotelFields:fields.validateHotelFields,hotelFormInput:fields.hotelFormInput,getAuthHeaders:async()=>({}),sanitizeError:value=>value,
  onSaved:()=>profileSaved++,fetch:async()=>Response.json({error:'Error sintético al guardar'},{status:503})};
await new Function(...Object.keys(saveBindings),'return '+saveExpression)(...Object.values(saveBindings))({preventDefault(){}});
assert.deepEqual(draft,valid);assert.equal(profileSaved,0);assert(profileErrors.some(value=>value?.type==='error'));
console.log('PASS real UI callbacks: confirmed redirect, error/timeout/incomplete responses stay, dirty profile blocks, failed save retains draft');
console.log('8 onboarding validation/completion behavior groups passed');
