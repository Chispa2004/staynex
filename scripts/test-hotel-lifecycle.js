import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as lifecycle from '../dashboard/lib/hotel-lifecycle.js';
import {isArchivedHotel,hotelOperationsHeld,assertHotelOperationsAvailable} from '../shared/hotels/lifecycle.js';
import {shouldAiAutoRespond} from '../shared/pilot/ai-safety.js';
import {evaluateAutomationDecision} from '../shared/automations/runtime.js';
assert.equal(process.env.SEND_AUTOMATIONS,'false');
const id='00000000-0000-4000-8000-000000000010', actor={id:'00000000-0000-4000-8000-000000000001'};
let calls=[],failure=null,result=null;
const supabase={rpc:async(name,args)=>{calls.push({name,args});return failure?{error:failure}:{data:result||{ok:true,action:args.p_action,hotel:{id:args.p_hotel_id}}};}};
const args={supabase,actor,platformRole:'platform_admin',hotelId:id,confirm:true};
for(const platformRole of ['support','none','owner','receptionist',null])await assert.rejects(lifecycle.archiveHotelWorkspace({...args,platformRole}),e=>e.status===403);
for(const hotelId of ['',null,'hotel-a',id+"' OR TRUE"])await assert.rejects(lifecycle.archiveHotelWorkspace({...args,hotelId}),e=>e.status===400);
for(const confirm of [false,'true',1,null])await assert.rejects(lifecycle.archiveHotelWorkspace({...args,confirm}),e=>e.status===400);
for(const expectedUpdatedAt of [{},'not-a-date'])await assert.rejects(lifecycle.archiveHotelWorkspace({...args,expectedUpdatedAt}),e=>e.status===400);
await assert.rejects(lifecycle.restoreHotelWorkspace(args),e=>e.status===409);assert.equal(calls.length,0);
console.log('PASS lifecycle permission, UUID and explicit confirmation reject without RPC');
await lifecycle.archiveHotelWorkspace(args);assert.equal(calls[0].name,'hotel_lifecycle_v1');assert.equal(calls[0].args.p_hotel_id,id);assert.equal(calls[0].args.p_actor,actor.id);
await lifecycle.restoreHotelWorkspace({...args,expectedArchivedAt:'2026-09-28T00:00:00Z'});assert.equal(calls[1].args.p_action,'restore');
for(const [code,status] of [['42501',403],['P0002',404],['P0001',409],['PGRST202',503],['08006',503]]){failure={code,message:'failure'};await assert.rejects(lifecycle.archiveHotelWorkspace(args),e=>e.status===status);}failure=null;
for(const data of [{},{ok:true,action:'archive',hotel:{id:'other'}},{ok:true,action:'restore',hotel:{id}}]){result=data;await assert.rejects(lifecycle.archiveHotelWorkspace(args),e=>e.status===503);}result=null;
console.log('PASS atomic RPC identity and failure/incomplete-result propagation; no legacy fallback writes');
const require=createRequire(new URL('../dashboard/package.json',import.meta.url)),swc=require('next/dist/build/swc');
const compile=async(path,mocks)=>{const {code}=await swc.transform(readFileSync(new URL(path,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});const m={exports:{}};new Function('require','module','exports',code)(n=>{assert(n in mocks,`Missing mock ${n}`);return mocks[n];},m,m.exports);return m.exports;};
let role='platform_admin';
const route=await compile('../dashboard/app/api/platform/hotels/[id]/route.js',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/platform':{...lifecycle,getPlatformContext:async(req,{requireAdmin}={})=>{if(requireAdmin&&role!=='platform_admin')throw Object.assign(new Error('denied'),{status:403});return {supabase,user:actor,platformRole:role};}}});
const req=(body)=>new Request('http://localhost/api/platform/hotels/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
for(const r of ['support','none','receptionist']){role=r;const before=calls.length;assert.equal((await route.DELETE(req({confirm:true}),{params:{id}})).status,403);assert.equal((await route.PATCH(req({action:'restore_hotel',confirm:true,expectedArchivedAt:'2026-09-28'}),{params:{id:'00000000-0000-4000-8000-000000000011'}})).status,403);assert.equal(calls.length,before);}role='platform_admin';
assert.equal((await route.DELETE(req({confirm:true,hotelId:'other'}),{params:{id}})).status,200);assert.equal(calls.at(-1).args.p_hotel_id,id);
failure={code:'P0001',message:'Conflicto'};assert.equal((await route.DELETE(req({confirm:true}),{params:{id}})).status,409);failure=null;
assert.equal((await route.PATCH(req({action:'restore_hotel',confirm:true,expectedArchivedAt:'2026-09-28'}),{params:{id}})).status,200);
console.log('PASS real DELETE/PATCH handlers: support/hotel roles/cross-hotel mutation denied; URL identity authoritative; conflict never success');
for(const archived of [{status:'archived'},{archived_at:'2026-09-28'},{deleted_at:'2026-09-28'},{metadata:{archived:true}},{name:'Old (archived)'}]){assert(isArchivedHotel(archived));assert(hotelOperationsHeld(archived));assert.throws(()=>assertHotelOperationsAvailable({id,...archived}));assert.equal(shouldAiAutoRespond({hotel:{id,ai_auto_reply_enabled:true,...archived},env:{}}).allowed,false);}
const held={id,status:'active',ai_auto_reply_enabled:true,metadata:{archive_operational_hold:true,automation_live_enabled:true}};
assert.equal(isArchivedHotel(held),false);assert.equal(hotelOperationsHeld(held),true);assert.equal(shouldAiAutoRespond({hotel:held,env:{}}).allowed,false);
assert.doesNotThrow(()=>assertHotelOperationsAvailable({id,status:'active'}));
const decision=evaluateAutomationDecision({hotel:held,reservation:{id:'r',hotel_id:id,status:'confirmed',arrival_date:'2026-10-01',departure_date:'2026-10-03',guest_phone:'+34900000000'},automationType:'pre_arrival_7d',now:'2026-09-24T10:00:00Z'});
assert.equal(decision.eligible,false);assert.equal(decision.skipReason,'hotel_operations_held');
console.log('PASS legacy/archive/restore hold blocks new AI and automation eligibility; restoration alone never resumes sends');
// Execute the real React component's submit handlers, including failed and incomplete replies.
let hooks=[],cursor=0,mode='fail',saved=[],requests=[];
const React={useState:init=>{const i=cursor++;if(!(i in hooks))hooks[i]=init;return [hooks[i],v=>{hooks[i]=v;}];},useRef:init=>{const i=cursor++;return hooks[i]||=( {current:init});},useEffect:()=>{}};
const jsx=(type,props)=>({type,props});
const focusLayer=await compile('../dashboard/lib/focus-layer.js',{'react':React});
const component=await compile('../dashboard/components/HotelLifecycleDialog.js',{'@/lib/focus-layer':focusLayer,'react':React,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/supabase-browser':{getSupabaseBrowser:()=>null},'@/lib/i18n/useDashboardLanguage':{useDashboardLanguage:()=>({tx:x=>x})},'@/lib/ui/styles':{ui:{button:()=>''}}});
const props={hotel:{id,name:'Synthetic',archived_at:'2026-09-28',updated_at:'2026-09-27'},isLight:true,action:'archive',onClose:()=>{},onSaved:r=>saved.push(r)};
const render=()=>{cursor=0;return component.HotelLifecycleDialog(props);};
const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const c of [node.props?.children].flat(Infinity)){const hit=find(c,predicate);if(hit)return hit;}return null;};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{requests.push({url,...options,body:JSON.parse(options.body)});return {ok:mode!=='fail',json:async()=>mode==='fail'?{error:'Synthetic failure'}:mode==='incomplete'?{ok:true,hotel:{id:'foreign'}}:{ok:true,action:props.action,hotel:{id}}};};
try{
 await find(render(),n=>n.type==='button'&&n.props.children==='Confirmar archivado').props.onClick();assert.equal(saved.length,0);assert.equal(find(render(),n=>n.props?.role==='alert').props.children,'Synthetic failure');assert.equal(find(render(),n=>n.type==='button'&&n.props.children==='Confirmar archivado').props.disabled,false);
 mode='incomplete';await find(render(),n=>n.type==='button'&&n.props.children==='Confirmar archivado').props.onClick();assert.equal(saved.length,0);
 mode='success';await find(render(),n=>n.type==='button'&&n.props.children==='Confirmar archivado').props.onClick();assert.equal(saved.length,1);assert.equal(requests.at(-1).method,'DELETE');assert.equal(requests.at(-1).body.expectedUpdatedAt,props.hotel.updated_at);
 props.action='restore';await find(render(),n=>n.type==='button'&&n.props.children==='Confirmar restauración').props.onClick();assert.equal(saved.length,2);assert.equal(requests.at(-1).method,'PATCH');assert.equal(requests.at(-1).body.expectedArchivedAt,props.hotel.archived_at);assert.equal(requests.at(-1).url,`/api/platform/hotels/${id}`);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS real dialog handlers retain errors, allow retry and accept only complete same-hotel server confirmation');

// Unrelated administrative PATCH remains usable with normal server authorization.
let patchRole='platform_admin', writes=[];
const patchDb={from:table=>{const filters=[];let changes=null;const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},update:value=>{changes=value;return q;},single:async()=>{
 if(!filters.some(([k,v])=>k==='hotel_id'&&v===id))throw Error('missing tenant scope');
 if(changes)writes.push({table,filters,changes});
 return {data:{id:'assignment',hotel_id:id,user_id:'user',role:changes?.role||'receptionist',status:'active'}};
 }};return q;}};
const patchRoute=await compile('../dashboard/app/api/platform/hotels/[id]/route.js',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/platform':{...lifecycle,writePlatformAuditLog:async()=>{},getPlatformContext:async(req,{requireAdmin})=>{assert(requireAdmin);if(patchRole!=='platform_admin')throw Object.assign(Error('denied'),{status:403});return {supabase:patchDb,user:actor,platformRole:patchRole};}}});
assert.equal((await patchRoute.PATCH(req({action:'update_user_role',hotelUserId:'assignment',role:'manager'}),{params:{id}})).status,200);
assert.equal(writes.length,1);assert.equal(writes[0].changes.role,'manager');
patchRole='receptionist';assert.equal((await patchRoute.PATCH(req({action:'update_user_role',hotelUserId:'assignment',role:'admin'}),{params:{id}})).status,403);assert.equal(writes.length,1);
console.log('PASS legitimate settings PATCH through real handler, scoped writes and unchanged administration permission');
console.log('6 hotel lifecycle behavior scenario groups passed');
