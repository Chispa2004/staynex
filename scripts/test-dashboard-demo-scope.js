import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as demo from '../shared/checkin-demo-view.js';
import * as metrics from '../shared/message-attention/metrics.js';
import * as contract from '../shared/message-attention/contract.js';
import {loadMessageMetrics} from '../dashboard/lib/message-metrics.js';
const require=createRequire(new URL('../dashboard/package.json',import.meta.url));
const swc=require('next/dist/build/swc');
const hotel={id:demo.CHECKIN_DEMO_HOTEL_ID,slug:'hotel-demo-checkin',timezone:'Europe/Madrid'};
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now='2026-10-06T12:00:00Z';
const conversations=[{id:id(1),hotel_id:hotel.id},{id:id(2),hotel_id:hotel.id}];
const messages=Array.from({length:16},(_,n)=>({id:id(100+n),hotel_id:hotel.id,conversation_id:id(n%2+1),
  sender_type:n===15?'ai':'guest',created_at:'2026-09-'+String(10+n).padStart(2,'0')+'T12:00:00Z',
  content:'Mensaje sintético '+n,metadata:n%3===0?{demo:true}:n===14?{draft:true}:{}}));
const attention=new Map(messages.map((m,n)=>[m.id,{messageId:m.id,status:n<4?'resolved':n<9?'pending':'untracked',version:n<9?2:0,changedAt:n<9?m.created_at:null}]));
const states=[{id:id(1),conversation_id:id(1),hotel_id:hotel.id,escalation_level:'urgent',updated_at:'2026-10-01T12:00:00Z'}];
const claims=messages.filter((m,n)=>n%3===1).map(m=>({id:m.id,message_id:m.id}));
let fail=false;const reads=[];
const db={from(table){let eqs=[];const q={select(){return q},eq(k,v){eqs.push([k,v]);return q},order(){return q},async range(a,b){reads.push({table,eqs});
  return {data:({messages,conversations,twilio_inbound_message_claims:claims,conversation_ai_state:states}[table]||[]).filter(r=>eqs.every(([k,v])=>r[k]===undefined&&table==='twilio_inbound_message_claims'||r[k]===v)).slice(a,b+1)};}};return q;},async rpc(name,args){assert.equal(args.p_hotel,hotel.id);if(fail)return {error:Error('offline')};
  return name==='staynex_attention_dashboard_v1'?{data:{contract:1,hotelId:hotel.id}}:{data:{contract:1,hotelId:hotel.id,conversationId:args.p_conversation,items:args.p_ids.map(i=>attention.get(i))}};}};
const snapshot=await loadMessageMetrics({supabase:db,hotel,origin:'all',period:'history',includeSource:true,now});
assert.deepEqual(snapshot.counters,{received:14,resolved:4,pending:5,urgent:3});
assert(reads.every(r=>r.eqs.some(([k,v])=>k==='hotel_id'&&v===hotel.id)));
for(const metric of ['received','resolved','pending','urgent']) {
  const href=metrics.messageMetricHref({metric,hotelId:hotel.id,origin:'all',period:'history'});
  const filter=metrics.parseMessageMetric(new URL(href,'http://localhost').searchParams);
  assert.equal(metrics.selectMessageMetric(snapshot,filter).messageCount,snapshot.counters[metric]);
  assert(!href.includes('metricDate'));assert(href.includes('metricPeriod=history'));
}
assert(!demo.isCheckinDemoHotel({...hotel,id:id(900)}));assert(!demo.isCheckinDemoHotel({...hotel,slug:'other'}));
await assert.rejects(loadMessageMetrics({supabase:db,hotel:{...hotel,id:id(900)},origin:'all',period:'history'}),e=>e.status===403);
await assert.rejects(loadMessageMetrics({supabase:db,hotel:{...hotel,slug:'other'},origin:'all',period:'history'}),e=>e.status===403);
assert.throws(()=>metrics.parseMessageMetric(new URLSearchParams({metric:'received',metricOrigin:'all',hotelId:id(900),metricPeriod:'history'})));
const normal=await loadMessageMetrics({supabase:db,hotel,origin:'simulated',now});
assert.equal(normal.counters.received,0);assert.equal(normal.counters.resolved,0);assert(normal.counters.pending<snapshot.counters.pending);
console.log('PASS demo identity plus configuration; all origins/history only in authorized demo; four exact Inbox metric sets; other scope unchanged');
const source=readFileSync(new URL('../dashboard/lib/dashboard-messages.js',import.meta.url),'utf8');
const {code}=await swc.transform(source,{filename:'dashboard-messages.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
const mocks={'./message-metrics':{loadMessageMetrics:args=>loadMessageMetrics({...args,now})},
  './inbox':{getInboxConversations:async({conversationIds,hotelId})=>{assert.equal(hotelId,hotel.id);return conversations.filter(c=>conversationIds.includes(c.id)).map(c=>({...c,guestName:'Prueba',room_number:'201',messages:messages.filter(m=>m.conversation_id===c.id)}))}},
  '../../shared/message-attention/metrics.js':metrics,'../../shared/message-attention/contract.js':contract,'../../shared/checkin-demo-view.js':demo};
const module={exports:{}};new Function('require','module','exports',code)(n=>mocks[n],module,module.exports);
const latest=await module.exports.loadDashboardMessages({supabase:db,hotel,origin:'traced'});
assert.equal(latest.coverage,'complete');assert.equal(latest.messages.length,5);
assert.deepEqual(latest.messages.map(m=>m.id),[113,112,111,110,109].map(id));
assert.equal(new Set(latest.messages.map(m=>m.conversationId)).size,2,'five messages, not five threads');
assert(latest.messages.every(m=>m.status==='Sin seguimiento'));
assert(latest.messages.every(m=>m.href.includes('messageId='+m.id)&&m.href.includes('origin=all')));
const urgent=await module.exports.loadDashboardMessages({supabase:db,hotel,urgentOnly:true});
assert.deepEqual(urgent.messages.map(m=>m.id),[108,106,104].map(id));assert(urgent.messages.every(m=>m.status==='Pendiente'&&m.priority==='urgent'));
states.length=0;assert.equal((await module.exports.loadDashboardMessages({supabase:db,hotel,urgentOnly:true})).messages.length,0);
fail=true;assert.equal((await module.exports.loadDashboardMessages({supabase:db,hotel})).coverage,'incomplete');
fail=false;assert.equal((await module.exports.loadDashboardMessages({supabase:db,hotel})).messages.length,5);
console.log('PASS real loader: five incoming messages, history, stable order, urgent empty never falls back, scoped links, partial failure and recovery');

conversations[0].status='closed';
const retired=await loadMessageMetrics({supabase:db,hotel,origin:'all',period:'history',includeSource:true,now});
assert(retired.source.messages.every(m=>m.conversation_id!==conversations[0].id));
assert.equal(retired.counters.received,messages.filter(m=>m.conversation_id===conversations[1].id && contract.isAttentionMessage(m)).length);
assert(demo.currentDemoConversation(conversations[0],{...hotel,id:id(900)}));
assert(!demo.currentDemoConversation(conversations[0],hotel));
assert.equal(messages.length,16);assert.equal(conversations.length,2);
console.log('PASS retired demo threads excluded consistently from metrics/source without deletion or effect on other hotels');
