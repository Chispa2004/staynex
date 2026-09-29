import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {buildMessageMetrics,selectMessageMetric,messageMetricHref,parseMessageMetric,removeMessageMetric,metricDay,attentionOrigin} from '../shared/message-attention/metrics.js';
import {loadMessageMetrics} from '../dashboard/lib/message-metrics.js';
import {filterInboxConversations,inboxFilterUrl} from '../shared/inbox/stay-stage.js';
import * as permissions from '../dashboard/lib/permissions.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const h=id(1),other=id(2),c=id(3),c2=id(4),now='2026-09-29T12:00:00Z';
const message=(n,extra={})=>({id:id(n),hotel_id:h,conversation_id:c,sender_type:'guest',metadata:{demo:true},created_at:now,...extra});
const messages=[message(10),message(11),message(12,{conversation_id:c2}),message(13,{created_at:'2026-09-28T21:59:59Z'}),message(14,{sender_type:'ai'}),message(15,{metadata:{demo:true,draft:false}}),message(16,{hotel_id:other}),message(17,{created_at:'2026-09-28T22:00:00Z'}),message(18,{metadata:{demo:true},created_at:now})];
const attention=new Map(messages.map(m=>[m.id,{status:'pending',changedAt:m.created_at}]));
attention.set(id(12),{status:'resolved',changedAt:now});attention.set(id(18),{status:'untracked',changedAt:null});
const base={hotelId:h,timezone:'Europe/Madrid',origin:'simulated',messages,conversations:[{id:c,hotel_id:h},{id:c2,hotel_id:h}],attention,alerts:new Map([[c,{escalation_level:'urgent',updated_at:now}]]),claimedIds:new Set(),now};
const snapshot=buildMessageMetrics(base);
let groups=0;const pass=s=>{groups++;console.log('PASS metric navigation '+s)};
assert.deepEqual(snapshot.counters,{received:5,resolved:1,pending:4,urgent:4});
for(const metric of ['received','resolved','pending','urgent']){
 const href=messageMetricHref({metric,origin:'simulated',hotelId:h,date:snapshot.date});
 const filter=parseMessageMetric(new URL(href,'http://localhost').searchParams);
 const result=selectMessageMetric(snapshot,filter);
 assert.equal(result.messageCount,snapshot.counters[metric]);assert.equal(result.hotelId,h);
 assert.equal(parseMessageMetric(new URL(href,'http://localhost').searchParams).metric,metric);
}
pass('four cards, explicit URLs, reload/direct/back retain date, source and hotel');
const selected=selectMessageMetric(snapshot,{metric:'received',origin:'simulated',hotelId:h,date:snapshot.date});
assert.equal(selected.messageCount,5);assert.equal(selected.conversationCount,2);assert.equal(selected.byConversation[c].length,4);
const context=messages.filter(m=>m.conversation_id===c && m.hotel_id===h);
assert(context.some(m=>m.sender_type==='ai'));assert(context.some(m=>!selected.byConversation[c].includes(m.id)));
pass('message identities distinct from conversations; full context retained');
assert.equal(metricDay('2026-09-28T22:00:00Z','Europe/Madrid'),'2026-09-29');
assert.equal(metricDay('2026-09-28T22:00:00Z','America/New_York'),'2026-09-28');
assert.equal(metricDay('2026-03-29T01:00:00Z','Europe/Madrid'),'2026-03-29');
assert.equal(metricDay('2026-10-25T01:00:00Z','Europe/Madrid'),'2026-10-25');
assert.equal(metricDay(now,'bad/timezone'),null);
assert.equal(buildMessageMetrics({...base,timezone:null}).counters.received,null);
pass('hotel dates, midnight, DST and unavailable timezone');
assert.equal(buildMessageMetrics({...base,messages:messages.map(m=>({...m,read:true,delivered:true,human_takeover:true}))}).counters.resolved,1);
assert.equal(buildMessageMetrics({...base,alerts:new Map([[c,{escalation_level:'urgent',updated_at:'2026-09-27T00:00:00Z'}]])}).counters.urgent,0);
assert.equal(buildMessageMetrics({...base,alerts:new Map([[c,{escalation_level:'urgent',updated_at:null}]])}).counters.urgent,null);
pass('attention independent of unread, delivery and control; current alerts only');
assert.equal(attentionOrigin(message(10,{metadata:{},id:id(20)}),new Set([id(20)])),'traced');
assert.equal(attentionOrigin(message(10,{metadata:{fixture:false}}),new Set()),'simulated');
assert.equal(attentionOrigin(message(10,{metadata:{}}),new Set()),'unknown');
assert(selected.byConversation[c].includes(id(18)));assert(!snapshot.sets.pending.some(m=>m.id===id(18)));
pass('canonical origins and historical received versus untracked attention');
assert.throws(()=>parseMessageMetric(new URLSearchParams('metric=received&metricOrigin=all&hotelId='+h)),{status:400});
assert.throws(()=>parseMessageMetric(new URLSearchParams('metric=received&metricOrigin=traced&hotelId='+h+'&metricDate=2026-02-30')),{status:400});
assert.throws(()=>selectMessageMetric(snapshot,{metric:'pending',origin:'simulated',hotelId:other}),{status:403});
assert.throws(()=>selectMessageMetric(buildMessageMetrics({...base,timezone:null}),{metric:'received',origin:'simulated',hotelId:h}),{status:503});
assert.equal(selectMessageMetric(buildMessageMetrics({...base,messages:[]}),{metric:'pending',origin:'simulated',hotelId:h}).messageCount,0);
pass('invalid/tampered filters denied; errors are not zero');
const href=messageMetricHref({metric:'pending',origin:'simulated',hotelId:h});
const withQuery=inboxFilterUrl('http://localhost'+href,'q','outside');
assert.equal(new URL(withQuery,'http://localhost').searchParams.get('metric'),'pending');
const combined=filterInboxConversations({items:[{id:c,messages:context},{id:c2,messages:[messages[2]]}],query:'outside',searchText:conv=>conv.id===c?'outside':'other'});
assert.deepEqual(combined.map(x=>x.id),[c]);
assert.equal(removeMessageMetric('http://localhost'+withQuery),'/dashboard/inbox?hotelId='+h);
pass('explicit secondary filters and removal retain authorized hotel');

// Exercise the production loader with > one PostgREST page and > one RPC batch.
const many=Array.from({length:3105},(_,n)=>message(100+n));let reads=0,rpcs=0,fail=false;
const db={from(table){let offset=0,end=0;const rows=table==='messages'?many:table==='conversations'?[{id:c,hotel_id:h}]:[];const q={select(){return q},eq(k,v){assert.equal(k,'hotel_id');assert.equal(v,h);return q},order(){return q},async range(a,b){reads++;offset=a;end=b;return fail?{error:{message:'synthetic'}}:{data:rows.slice(offset,end+1)}}};return q},async rpc(name,args){rpcs++;assert.equal(args.p_hotel,h);return {data:name==='staynex_attention_dashboard_v1'?{contract:1,hotelId:h}:{contract:1,hotelId:h,conversationId:c,items:args.p_ids.map(messageId=>({messageId,status:'pending',version:1,changedAt:now}))}}}};
const loaded=await loadMessageMetrics({supabase:db,hotel:{id:h,timezone:'Europe/Madrid'},origin:'simulated',now});
assert.equal(loaded.counters.pending,3105);assert.equal(rpcs,3);assert(reads>7);
const beforeOtherOrigin=rpcs;
assert.equal((await loadMessageMetrics({supabase:db,hotel:{id:h,timezone:'Europe/Madrid'},origin:'traced',now})).counters.pending,0);
assert.equal(rpcs,beforeOtherOrigin+1,'No attention RPCs for messages outside the selected origin');
fail=true;await assert.rejects(loadMessageMetrics({supabase:db,hotel:{id:h,timezone:'Europe/Madrid'},origin:'simulated',now}));
pass('all pages and bounded RPC batches; partial read failure propagates');

// Run the actual HTTP handler; only transport and authentication are controlled.
const require=createRequire(new URL('../dashboard/package.json',import.meta.url)),swc=require('next/dist/build/swc');
const source=readFileSync(new URL('../dashboard/app/api/inbox/route.js',import.meta.url),'utf8');
const {code}=await swc.transform(source,{filename:'route.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
let role='receptionist',denied=false,hotel=h,calls=0,options;
const mocks={'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status || 200})}},'@/lib/current-hotel':{getCurrentHotelForRequest:async(r,o)=>{options=o;return {supabase:db,hotel:{id:hotel},role,user:{id:id(9)},accessDenied:denied,hotelUser:{}}}},'@/lib/inbox':{getInboxConversations:async({conversationIds,hotelId})=>{calls++;assert.equal(hotelId,h);return [{id:c,hotel_id:h,messages:context}].filter(x=>!conversationIds || conversationIds.includes(x.id))}},'@/lib/permissions':permissions,'../../../../shared/pilot/ai-safety.js':{getPilotAiSafetyReadiness:()=>({})},'../../../../shared/message-attention/metrics.js':{parseMessageMetric,selectMessageMetric},'@/lib/message-metrics':{loadMessageMetrics:async()=>snapshot}};
const module={exports:{}};new Function('require','module','exports',code)(name=>{assert(name in mocks,name);return mocks[name]},module,module.exports);
const response=await module.exports.GET({url:'http://localhost'+href});assert.equal(response.status,200);assert.deepEqual(options,{readOnly:true,includeDirectory:false});assert.equal(response.body.metric.messageCount,4);assert(response.body.conversations[0].messages.some(m=>m.sender_type==='ai'));
const previous=calls;denied=true;assert.equal((await module.exports.GET({url:'http://localhost'+href})).status,403);denied=false;hotel=other;assert.equal((await module.exports.GET({url:'http://localhost'+href})).status,403);assert.equal(calls,previous);
pass('real handler: read-only context, server authorization, tampered hotel, full thread');
const clientSource=readFileSync(new URL('../dashboard/components/InboxClient.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=clientSource.indexOf('  const loadInbox = useCallback');
const loadSource=clientSource.slice(start,clientSource.indexOf('  useEffect(() => {\n    loadInbox',start));
const ref=current=>({current}),noop=()=>{};let state={},items=[],auth='session-a',activeHotel=h,pending=[];
const key=new URL(href,'http://localhost').searchParams.toString(),keyRef=ref(key),requestId=ref(0);
const bindings={useCallback:f=>f,controlMutationRef:ref(false),loadInFlightRef:ref(false),loadRequestIdRef:requestId,
 itemsRef:ref([]),setRefreshing:noop,setLoading:noop,getAuthHeaders:async()=>({Authorization:auth}),metricKey:key,metricKeyRef:keyRef,
 setMetricState:f=>{state=typeof f==='function'?f(state):f},fetch:async url=>{assert(url.includes('metric=pending'));return new Promise(resolve=>pending.push(resolve))},
 shouldAcceptTenantPayload:b=>b.hotelId===activeHotel,mountedRef:ref(true),normalizeInboxConversations:x=>x,currentHotel:{id:h},
 setItems:f=>{items=typeof f==='function'?f(items):f},setSelectedId:noop,setReadState:noop,setReadStateLoaded:noop,setMessage:noop,setDraftsByConversation:noop,
 locallyClosedConversationIdsRef:ref(new Set()),setPilotAiSafety:noop,setCopilotOpen:noop,setGuestPanelOpen:noop,setMobileChatOpen:noop,setSearchQuery:noop,
 setCurrentHotel:noop,setDraftOwnerId:noop,setCapabilities:noop,setControlError:noop,setStaffLanguage:noop,normalizeTranslationLanguage:x=>x,
 readStoredTranslationLanguage:()=>null,staffLanguageRef:ref('es'),language:'es',selectedIdRef:ref(null),requestedConversationId:null,controlFromState:()=>({status:'unknown'})};
const loadClient=new Function(...Object.keys(bindings),loadSource+';return loadInbox;')(...Object.values(bindings));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const ok=()=>({ok:true,json:async()=>({hotelId:h,hotel:{id:h},conversations:[{id:c}],metric:selectMessageMetric(snapshot,{metric:'pending',origin:'simulated',hotelId:h})})});
let work=loadClient();await tick();pending.shift()(ok());await work;assert.equal(state.status,'ready');assert.equal(items.length,1);
work=loadClient();await tick();pending.shift()({ok:false,json:async()=>({error:'synthetic read failure'})});await work;assert.equal(state.status,'error');assert.match(state.error,/synthetic/);
work=loadClient();await tick();pending.shift()(ok());await work;assert.equal(state.status,'ready');
items=[];work=loadClient();await tick();keyRef.current='another-filter';pending.shift()(ok());await work;assert.equal(items.length,0);
keyRef.current=key;work=loadClient();await tick();activeHotel=other;pending.shift()(ok());await work;assert.equal(items.length,0);
activeHotel=h;work=loadClient();await tick();auth='session-b';pending.shift()(ok());await work;assert.equal(items.length,0);
pass('real client: visible error/retry, stale filter, hotel and identity replies discarded');
console.log(`${groups} Dashboard metric navigation behavioral groups passed; synthetic data, no providers.`);
