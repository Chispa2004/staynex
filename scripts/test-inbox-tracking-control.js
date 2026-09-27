import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as tracking from '../dashboard/lib/inbox-tracking-state.js';
import {handleAttentionRequest} from '../dashboard/lib/message-attention.js';
import {canAccess,canManageHumanTakeover} from '../dashboard/lib/permissions.js';
import {translatePhrase} from '../dashboard/lib/i18n/translations.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
import {localizeCopilotText} from '../dashboard/lib/i18n/copilot-phrases.js';
const {createAttentionReader,validateAttentionPayload,attentionReadText,controlFromState,copilotControlAction}=tracking;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const hotel=id(1),conversation=id(2),message=id(3),user=id(4);
const snapshot={contract:1,hotelId:hotel,conversationId:conversation,canManage:true,
  items:[{messageId:message,status:'pending',version:1,changedAt:'2026-09-27T08:00:00Z'}]};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
let state, response=snapshot;
const reader=createAttentionReader(async()=>{if(response instanceof Error)throw response;return validateAttentionPayload(response,hotel,conversation,[message]);},s=>state=s);
const loading=reader.refresh();assert.equal(state.status,'loading');assert.ok(!attentionReadText(state).includes('no disponible'));await loading;
assert.equal(state.snapshot.items[0].status,'pending');
for(const [error,expected] of [[new Error('network'),'error'],[Object.assign(new Error(),{status:403}),'forbidden'],[Object.assign(new Error(),{status:401}),'session']]) {
  response=error;await reader.refresh();assert.equal(state.status,expected);assert.equal(state.snapshot,null);
  response=snapshot;await reader.refresh();assert.equal(state.status,'ready');
}
for(const malformed of [{...snapshot,items:[]},{...snapshot,items:[null]},{...snapshot,hotelId:id(9)},{...snapshot,conversationId:id(8)},{...snapshot,canManage:undefined}]) {
  response=malformed;await reader.refresh();assert.equal(state.status,'incompatible');assert.equal(state.snapshot,null);
}
response={...snapshot,items:[{messageId:message,status:'untracked',version:0,changedAt:null}]};await reader.refresh();
assert.match(attentionReadText(state),/históricos/);assert.equal(state.snapshot.items[0].status,'untracked');
assert.match(attentionReadText({status:'ready',snapshot:{...snapshot,items:[]}}),/No hay mensajes/);
reader.dispose();
let calls=[];const racing=createAttentionReader(()=>{const d=deferred();calls.push(d);return d.promise;},s=>state=s);
const a=racing.refresh(),b=racing.refresh();calls[1].resolve(snapshot);await b;calls[0].reject(new Error('old failure'));await a;assert.equal(state.status,'ready');
const c=racing.refresh();racing.dispose();calls[2].resolve({...snapshot,hotelId:id(9)});await c;assert.equal(state.status,'loading','disposed reader cannot publish foreign data');
const slow=createAttentionReader(()=>new Promise(()=>{}),s=>state=s,5);await slow.refresh();assert.equal(state.status,'timeout');slow.dispose();
console.log('PASS attention loading, valid/untracked/empty, network/permission/session/incompatible errors, retry, timeout and out-of-order disposal');

const context={user:{id:user},hotel:{id:hotel},role:'receptionist',platformRole:'none',hotelUser:{user_id:user,hotel_id:hotel,role:'receptionist',status:'active'}};
const request=()=>new Request('http://local/api/inbox/attention',{method:'POST',body:JSON.stringify({action:'read',conversationId:conversation,messageIds:[message]})});
let writes=0;
for(const extra of [{},{role:'admin',hotelUser:{...context.hotelUser,role:'admin'}},{platformRole:'support'}]) {
  const ctx={...context,...extra,supabase:{rpc:async(name,args)=>{assert.equal(name,'staynex_attention_read_v1');assert.equal(args.p_hotel,hotel);return {data:snapshot};}}};
  const read=await handleAttentionRequest({request:request(),getContext:async()=>ctx});assert.equal(read.status,200);assert.equal(read.body.canManage,extra.platformRole!=='support');
}
for(const [ctx,status] of [[{...context,user:null},401],[{...context,role:'housekeeping'},403]]) {
  assert.equal((await handleAttentionRequest({request:request(),getContext:async()=>({...ctx,supabase:{rpc(){writes++;}}})})).status,status);
}
assert.equal(writes,0);
assert.equal((await handleAttentionRequest({request:request(),getContext:async()=>({...context,supabase:{rpc:async()=>({error:{code:'42501'}})}})})).status,403);
console.log('PASS real attention handler read scope and role permissions; no writes');

// Execute the actual scoped state loader without a network client.
const inboxSource=fs.readFileSync(new URL('../dashboard/lib/inbox.js',import.meta.url),'utf8');
const loaderSource=inboxSource.slice(inboxSource.indexOf('export const getAiStateByConversation'),inboxSource.indexOf('const getGuestMemoryByGuest')).replace('export const','const');
const loader=new Function(loaderSource+';return getAiStateByConversation;')();
const database=result=>({from(table){assert.equal(table,'conversation_ai_state');return {select(){return this;},eq(k,v){assert.equal(k,'hotel_id');assert.equal(v,hotel);return this;},in(k,v){assert.deepEqual(v,[conversation]);return this;},limit:async()=>result};}});
for(const result of [{error:{message:'denied'}},{data:null},{data:[{hotel_id:id(8),conversation_id:conversation}]}]) assert.equal(await loader({supabase:database(result),hotelId:hotel,conversationIds:[conversation]}),null);
assert.equal((await loader({supabase:database({data:[]}),hotelId:hotel,conversationIds:[conversation]})).size,0);
assert.equal(controlFromState(null,false).status,'unknown');assert.equal(controlFromState(null,true).mode,'ai_active');
console.log('PASS real AI control query distinguishes failed/incompatible reads from legitimate absent state');

const require=createRequire(new URL('../dashboard/package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),swc=require('next/dist/build/swc');
let lang='es';
const mocks={'@/lib/i18n/useDashboardLanguage':{useDashboardLanguage:()=>({tx:s=>translatePhrase(lang,s)})},
  '@/lib/theme/useDashboardTheme':{useDashboardTheme:()=>({theme:'light'})},'@/lib/ai-copilot':{buildConversationCopilot},
  '@/lib/i18n/copilot-phrases':{localizeCopilotText},'@/lib/inbox-tracking-state':tracking};
const {code}=await swc.transform(fs.readFileSync(new URL('../dashboard/components/InboxAiCopilotPanel.js',import.meta.url),'utf8'),{filename:'panel.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
const mod={exports:{}};new Function('require','module','exports',code)(n=>mocks[n]||require(n),mod,mod.exports);
const convo={id:conversation,hotel_id:hotel,guest:{preferred_language:'en'},messages:[{sender_type:'guest',content:'Please help with the noise.',original_language:'en'}],control:controlFromState({state_metadata:{conversation_ai_mode:'human_takeover'}})};
const copilot={...buildConversationCopilot(convo),priority:{level:'urgent',tone:'red',confidence:1},suggestedAction:{title:'Reply normally',detail:'OLD GENERIC'},suggestedReply:{text:'GUEST DRAFT EN',language:'en'}};
for(lang of ['es','en'])for(const mode of ['human_takeover','ai_active',null])for(const canReply of [true,false]) {
  const current={...convo,copilot,control:controlFromState(mode?{state_metadata:{conversation_ai_mode:mode}}:null,Boolean(mode))};
  const before=structuredClone(current);
  const html=renderToStaticMarkup(React.createElement(mod.exports.InboxAiCopilotPanel,{conversation:current,canReply}));
  assert.ok(html.includes('GUEST DRAFT EN'));assert.ok(html.includes(lang==='es'?'Urgente':'Urgent'));
  assert.equal(html.includes('OLD GENERIC'),mode==='ai_active');
  const action=copilotControlAction(current,canReply);if(action)assert.ok(html.includes(translatePhrase(lang,action.title)));
  assert.ok(html.includes(translatePhrase(lang,'Borrador para revisión · no enviado')));assert.deepEqual(current,before);
}
console.log('PASS real panel ES/EN active/inactive/unknown, stale generic copilot, urgent priority, draft language and read-only presentation');
const urgentHtml=renderToStaticMarkup(React.createElement(mod.exports.InboxAiCopilotPanel,{conversation:{...convo,
  aiState:{escalation_level:'urgent'},copilot:{...copilot,priority:{level:'low'}}},canReply:true}));
assert.ok(urgentHtml.includes('Active urgent alert.'));assert.ok(urgentHtml.includes('>Urgent<'));assert.ok(!urgentHtml.includes('OLD GENERIC'));
const unknownHtml=renderToStaticMarkup(React.createElement(mod.exports.InboxAiCopilotPanel,{conversation:{...convo,control:controlFromState(null,false),copilot},humanEscalation:{needsHuman:true,reason:'human_takeover_active'},canReply:true}));
assert.ok(unknownHtml.includes('Control not confirmed'));assert.ok(!unknownHtml.includes('Human takeover active'));
console.log('PASS stored urgent alert remains visible above generic low-priority recommendation under human control');

// Execute real control handler: support denied, scoped write, response proof.
const routeSource=fs.readFileSync(new URL('../dashboard/app/api/inbox/takeover/route.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');
let stored=null,role='receptionist',platformRole='none',targetHotel=hotel;
const db={from(table){assert.ok(['conversations','conversation_ai_state'].includes(table));const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){if(table==='conversations')return {data:filters.hotel_id===targetHotel?{id:conversation,hotel_id:hotel}:null};return {data:stored};},upsert(row){writes++;stored={...row,id:id(8)};return this;},async single(){return {data:stored};}};}};
const post=new Function('NextResponse','getCurrentHotelForRequest','canManageHumanTakeover','writeEnterpriseAuditLog',routeSource+';return POST;')(
  {json:(body,options={})=>({body,status:options.status||200})},async()=>({...context,role,platformRole,supabase:db}),canManageHumanTakeover,async()=>{});
const command=action=>post(new Request('http://local/api/inbox/takeover',{method:'POST',body:JSON.stringify({conversationId:conversation,action})}));
for(role of ['receptionist','admin']){assert.equal((await command('takeover')).body.aiState.state_metadata.conversation_ai_mode,'human_takeover');assert.equal((await command('resume')).body.aiState.state_metadata.conversation_ai_mode,'ai_active');}
platformRole='support';let count=writes;assert.equal((await command('takeover')).status,403);assert.equal(writes,count);
platformRole='none';targetHotel=id(9);assert.equal((await command('takeover')).status,404);assert.equal(writes,count);
console.log('PASS real takeover/resume handler for reception/admin; support and foreign hotel denied; no provider side effects');

// Exercise the actual client request handlers with deferred HTTP responses.
// A refresh begun before a takeover must never replace the confirmed new mode.
const clientSource=fs.readFileSync(new URL('../dashboard/components/InboxClient.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const takeSource=clientSource.slice(clientSource.indexOf('  const updateHumanTakeover = async'),clientSource.indexOf('  const updateOfferAction'));
const loadSource=clientSource.slice(clientSource.indexOf('  const loadInbox = useCallback'),clientSource.indexOf('  useEffect(() => {\n    loadInbox',clientSource.indexOf('  const loadInbox = useCallback')));
let activeHotel=hotel,authorization='session-a',clientItems=[convo],clientError='',callsHttp=[];
const ref=current=>({current});const mutation=ref(false),requestId=ref(0);
const noop=()=>{};
const bindings={useCallback:f=>f,selectedConversation:convo,capabilities:{canManageControl:true},selectedControl:{confirmed:true},
  controlMutationRef:mutation,currentHotel:{id:hotel},loadRequestIdRef:requestId,loadInFlightRef:ref(false),
  setTakeoverUpdating:noop,setControlError:s=>{clientError=s;},setItems:f=>{clientItems=typeof f==='function'?f(clientItems):f;},
  getAuthHeaders:async()=>({Authorization:authorization}),getActiveTenantId:()=>activeHotel,
  fetch:async(url)=>{const d=deferred();callsHttp.push({url,...d});return d.promise;},
  controlFromState,updateConversationAiState:({conversations,conversationId,aiState})=>conversations.map(c=>c.id===conversationId?{...c,aiState,control:controlFromState(aiState)}:c),
  itemsRef:ref([convo]),setRefreshing:noop,setLoading:noop,shouldAcceptTenantPayload:b=>b.hotelId===activeHotel,mountedRef:ref(true),
  normalizeInboxConversations:x=>x,setSelectedId:noop,setReadState:noop,setReadStateLoaded:noop,setMessage:noop,setDraftsByConversation:noop,
  locallyClosedConversationIdsRef:ref(new Set()),setPilotAiSafety:noop,setCopilotOpen:noop,setGuestPanelOpen:noop,setMobileChatOpen:noop,
  setSearchQuery:noop,setCurrentHotel:noop,setDraftOwnerId:noop,setCapabilities:noop,setStaffLanguage:noop,normalizeTranslationLanguage:x=>x,
  readStoredTranslationLanguage:()=>null,staffLanguageRef:ref('es'),language:'es',selectedIdRef:ref(conversation),requestedConversationId:null};
const client=new Function(...Object.keys(bindings),loadSource+'\n'+takeSource+';return {loadInbox,updateHumanTakeover};')(...Object.values(bindings));
const tick=()=>new Promise(r=>setImmediate(r));
const older=client.loadInbox();await tick();
const takeover=client.updateHumanTakeover('takeover');await tick();
assert.equal(clientItems[0].control.status,'unknown','in-flight control mutation is not a confirmed mode');
callsHttp[1].resolve({ok:true,json:async()=>({hotelId:hotel,conversationId:conversation,aiState:{hotel_id:hotel,conversation_id:conversation,state_metadata:{conversation_ai_mode:'human_takeover'}}})});await takeover;
callsHttp[0].resolve({ok:true,json:async()=>({hotelId:hotel,hotel:{id:hotel},conversations:[{...convo,control:controlFromState(null)}]})});await older;
assert.equal(clientItems[0].control.mode,'human_takeover','old refresh cannot undo takeover');
const bad=client.updateHumanTakeover('resume');await tick();callsHttp[2].resolve({ok:true,json:async()=>({hotelId:hotel,conversationId:conversation})});await bad;
assert.equal(clientItems[0].control.status,'unknown');assert.ok(clientError);
const foreign=client.updateHumanTakeover('takeover');await tick();activeHotel=id(99);clientItems=[];
callsHttp[3].resolve({ok:true,json:async()=>({hotelId:hotel,conversationId:conversation,aiState:{hotel_id:hotel,conversation_id:conversation,state_metadata:{conversation_ai_mode:'human_takeover'}}})});await foreign;
assert.deepEqual(clientItems,[],'old hotel response cannot restore discarded state');
activeHotel=hotel;const oldSession=client.loadInbox();await tick();authorization='session-b';
callsHttp[4].resolve({ok:true,json:async()=>({hotelId:hotel,hotel:{id:hotel},conversations:[convo]})});await oldSession;assert.deepEqual(clientItems,[]);
console.log('PASS actual client handlers reject refresh-before-takeover, incomplete mutation, previous hotel and previous session responses');
