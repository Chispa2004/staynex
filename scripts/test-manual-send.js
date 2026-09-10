import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createManualMessageSender } from '../src/services/message.service.js';
import * as contract from '../shared/manual-send/contract.js';
import { canAccess } from '../dashboard/lib/permissions.js';
import { runManualAttempt, readManualRecovery, blocksSameManualSend, getManualMessageDelivery } from '../dashboard/lib/manual-send-client.js';
import { sanitizeInboxMessageTranslations } from '../dashboard/lib/inbox-message-presentation.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333';
const sid='SM'+'a'.repeat(32),accepted={sid,status:'queued'};
const load=(file,bindings,names)=>new Function(...Object.keys(bindings),readFileSync(new URL('../'+file,import.meta.url),'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export async function ','async function ')
  +'\nreturn {'+names.join(',')+'};')(...Object.values(bindings));
const store=()=>{
  const db={conversations:[{id:'ca',hotel_id:A,guest_id:'ga'},{id:'cb',hotel_id:B,guest_id:'gb'}],
    guests:[{id:'ga',hotel_id:A,phone_number:'+34900000001',preferred_language:'es'},{id:'gb',hotel_id:B,phone_number:'+34900000002'}],messages:[]};
  const calls=[];const client={from(table){let filters=[],action='select',values;const q={
    select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},insert(v){action='insert';values=v;return q;},update(v){action='update';values=v;return q;},
    execute(single=false){calls.push({table,action,filters,values});let rows=db[table].filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));
      if(table==='messages'&&action==='insert'){
        if(client.missingMetadata)return {data:null,error:{message:'column metadata does not exist'}};
        if(db.messages.some(row=>row.id===values.id))return {data:null,error:{code:'23505'}};
        rows=[{created_at:'2026-09-10T08:00:00Z',...structuredClone(values)}];db.messages.push(...rows);
      }
      if(action==='update'){
        if(table==='messages'&&client.failFinal&&values.metadata?.manual_send?.status!=='unknown')return {data:null,error:{message:'PRIVATE DATABASE DETAIL'}};
        if(table==='messages'&&client.failPrepare&&values.metadata?.outbound_text&&values.metadata.manual_send.status==='unknown')return {data:null,error:{message:'PRIVATE DATABASE DETAIL'}};
        if(table==='conversations'&&client.failTouch)throw Error('PRIVATE TOUCH ERROR');
        rows.forEach(row=>Object.assign(row,structuredClone(values)));
      }
      return {data:structuredClone(single?(rows[0]||null):rows),error:null};
    },maybeSingle:async()=>q.execute(true),single:async()=>q.execute(true),then:(a,b)=>Promise.resolve().then(()=>q.execute()).then(a,b)};return q;}};
  return {client,db,calls};
};
const input={hotelId:A,conversationId:'ca',message:'Hola 👋\n¿Cómo estás?',attemptId:ID};
const setup=(options={})=>{const s=store(),sent=[],translations=[];const sender=createManualMessageSender({getClient:()=>s.client,detect:()=> 'es',
  translate:async args=>{translations.push(args);return options.translation||{translatedText:null,sourceLanguage:'es',targetLanguage:'es'};},
  send:async args=>{sent.push(args);if(options.error)throw options.error;return options.provider||accepted;}});return {...s,sent,translations,sender};};
const results=[];const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}};

await test('Valid Unicode/multiline message, accepted is not delivered, scoped recipient and persisted receipt',async()=>{
  const s=setup();const result=await s.sender({...input,to:'+34999999999',recipientId:'gb'});
  assert.equal(result.delivery.status,'accepted');assert.equal(result.delivery.persisted,true);assert.equal(s.sent[0].to,'+34900000001');assert.equal(s.sent[0].body,input.message);
  assert.equal(s.db.messages[0].content,input.message);assert.equal(s.db.messages[0].metadata.manual_send.provider_sid,sid);
  assert.equal(s.translations[0].hotelId,A);
  for(const call of s.calls.filter(x=>x.action==='update'||x.action==='select'))assert.ok(call.filters.some(([k,v])=>k==='hotel_id'&&v===A));
});
await test('Invalid bodies/types/length/attempt identifiers rejected before DB/provider/translation',async()=>{
  for(const value of [null,[],{}, {...input,message:{}},{...input,message:123},{...input,message:['hi']},{...input,message:'   '},{...input,message:'a'.repeat(1601)},
    {...input,conversationId:{}},{...input,attemptId:[]},{...input,staffLanguage:{}}]){
    const s=setup();await assert.rejects(()=>s.sender(value));assert.equal(s.sent.length,0);assert.equal(s.translations.length,0);assert.equal(s.calls.length,0);
  }
  const s=setup();await s.sender({...input,message:'a'.repeat(1600)});assert.equal(s.sent.length,1);
});
await test('Foreign conversation and inconsistent guest hotel rejected before translator/provider',async()=>{
  const s=setup();await assert.rejects(()=>s.sender({...input,conversationId:'cb'}),e=>e.statusCode===404);assert.equal(s.sent.length,0);assert.equal(s.translations.length,0);
  s.db.conversations[0].guest_id='gb';await assert.rejects(()=>s.sender(input),e=>e.code==='recipient_unavailable');assert.equal(s.sent.length,0);assert.equal(s.translations.length,0);
});
await test('Definitive provider rejection and explicit retryability are stored without raw errors',async()=>{
  for(const status of [400,429]){
    const s=setup({error:{status,code:status===429?20429:21614,message:'SECRET PROVIDER CONTENT'}});const result=await s.sender(input);
    assert.equal(result.delivery.status,'failed');assert.equal(result.delivery.retryable,status===429);assert.equal(s.db.messages[0].metadata.manual_send.status,'failed');
    assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(contract.manualDeliveryText(result.delivery).length>10);
  }
});
await test('Timeout and 5xx remain uncertain, with no retry and recoverable persisted original',async()=>{
  for(const error of [{code:'ETIMEDOUT'},{status:504,code:20504},{status:408,code:20408}]){
    const s=setup({error});const result=await s.sender(input);assert.equal(result.delivery.status,'unknown');assert.equal(result.delivery.retryable,false);
    assert.equal(s.db.messages[0].content,input.message);assert.equal(s.db.messages[0].metadata.manual_send.status,'unknown');assert.equal(s.sent.length,1);
  }
});
await test('Acceptance followed by persistence failure retains acceptance; reopened DB row is uncertain',async()=>{
  const s=setup();s.client.failFinal=true;s.client.failTouch=true;const result=await s.sender(input);
  assert.equal(result.delivery.status,'accepted');assert.equal(result.delivery.persisted,false);assert.equal(result.delivery.retryable,false);
  assert.equal(s.db.messages[0].metadata.manual_send.status,'unknown');assert.equal(s.sent.length,1);
  const replay=await s.sender(input);assert.equal(replay.delivery.status,'unknown');assert.equal(s.sent.length,1);
});
await test('Missing metadata/preparation failure cannot send; translation expansion checked before provider',async()=>{
  const missing=setup();missing.client.missingMetadata=true;await assert.rejects(()=>missing.sender(input),e=>e.code==='persistence_failed');assert.equal(missing.sent.length,0);
  const prepare=setup();prepare.client.failPrepare=true;assert.equal((await prepare.sender(input)).delivery.status,'failed');assert.equal(prepare.sent.length,0);
  const expanded=setup({translation:{translatedText:'a'.repeat(1601)}});assert.equal((await expanded.sender(input)).delivery.reason,'text_too_long');assert.equal(expanded.sent.length,0);
});
await test('Repeated and concurrent operation identifiers dispatch at most once; foreign collision is denied',async()=>{
  const s=setup();await Promise.all([s.sender(input),s.sender(input)]);await s.sender(input);assert.equal(s.sent.length,1);assert.equal(s.db.messages.length,1);
  await assert.rejects(()=>s.sender({...input,message:'different text'}),e=>e.code==='invalid_attempt');assert.equal(s.sent.length,1);
  const foreign=setup();foreign.db.messages.push({id:ID,hotel_id:B,conversation_id:'cb',content:'B'});
  await assert.rejects(()=>foreign.sender(input),e=>e.code==='invalid_attempt');assert.equal(foreign.sent.length,0);
});
await test('Delivered requires provider evidence; queued/sent and missing SID never imply delivery',async()=>{
  for(const status of ['queued','sent','sending','delivered','read','failed','undelivered']){
    const result=await setup({provider:{sid,status}}).sender(input);
    assert.equal(result.delivery.status,['delivered','read'].includes(status)?'delivered':['failed','undelivered'].includes(status)?'failed':'accepted');
  }
  assert.equal((await setup({provider:{status:'delivered'}}).sender(input)).delivery.status,'unknown');
});
await test('Dashboard authorization, manipulated destination and sanitized failures',async()=>{
  const s=setup();let calls=0;let forwarded;
  const context={supabase:s.client,hotel:{id:A},hotelUser:{},role:'receptionist',user:{id:'synthetic-user'}};
  const make=(override={},fetchFailure=false)=>load('dashboard/app/api/messages/send/route.js',{
    ...contract,canAccess,getCurrentHotelForRequest:async()=>({...context,...override}),getInternalApiHeaders:()=>({'x-staynex-internal-token':'synthetic'}),
    NextResponse:{json:(body,options={})=>({body,status:options.status||200})},fetch:async(_url,options)=>{calls++;forwarded=JSON.parse(options.body);if(fetchFailure)throw Error('SECRET TRANSPORT');
      return {status:200,json:async()=>await s.sender(forwarded)};}
  },['POST']).POST;
  for(const override of [{accessDenied:true,accessDeniedReason:'missing_session'},{role:'housekeeping'},{platformRole:'support'},{fallback:true}]){
    const response=await make(override)({json:async()=>input});assert.ok([401,403].includes(response.status));
  }
  assert.equal(calls,0);
  assert.equal((await make()({json:async()=>({...input,conversationId:'cb'})})).status,404);assert.equal(calls,0);
  assert.equal((await make()({json:async()=>({...input,message:{}})})).status,400);assert.equal(calls,0);
  const valid=await make()({json:async()=>({...input,hotelId:B,to:'+34999999999'})});assert.equal(valid.body.delivery.status,'accepted');assert.equal(forwarded.hotelId,A);assert.equal(forwarded.to,undefined);
  const uncertain=await make({},true)({json:async()=>input});assert.equal(uncertain.body.delivery.status,'unknown');assert.ok(!JSON.stringify(uncertain).includes('SECRET'));
});
await test('Double click, uncertain reload recovery, explicit retry and storage failure without dispatch',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},key='actor:A:ca',lock=new Set();
  let calls=0,resolve,seen;
  const run=()=>runManualAttempt({lock,key,text:input.message,attemptId:ID,persist:r=>storage.setItem(key,JSON.stringify(r)),onPending(){},onResult:r=>{seen=r;},
    request:()=>{calls++;return new Promise(r=>{resolve=r;});}});
  const first=run();assert.equal(await run(),null);assert.equal(calls,1);
  assert.equal(readManualRecovery(storage,key).text,input.message);assert.equal(readManualRecovery(storage,key).delivery.status,'unknown');
  resolve({delivery:contract.manualDelivery('unknown','provider_unknown')});await first;
  assert.equal(blocksSameManualSend(seen,input.message),true);assert.equal(readManualRecovery(storage,key).text,input.message);assert.equal(calls,1);
  assert.equal(readManualRecovery(storage,'actor:B:ca'),null);
  const retry={...seen,delivery:contract.manualDelivery('failed','provider_busy',true)};assert.equal(blocksSameManualSend(retry,input.message),false);
  await runManualAttempt({lock,key,text:input.message,attemptId:ID,persist(){throw Error('Storage denied');},onPending(){},onResult:r=>{seen=r;},request:async()=>{calls++;}});
  assert.equal(calls,1);assert.equal(seen.delivery.status,'failed');
});
await test('Manual Twilio adapter has bounded timeout, no SDK retries, no external send in tests',async()=>{
  const calls=[];const env={TWILIO_ACCOUNT_SID:'synthetic',TWILIO_AUTH_TOKEN:'synthetic',TWILIO_WHATSAPP_FROM:'+34900000000'};
  const {sendManualWhatsAppMessage}=load('src/services/twilio.service.js',{process:{env},twilio:(_a,_b,options)=>{assert.equal(options.autoRetry,false);assert.equal(options.timeout,15000);
    return {messages:{create:async args=>{calls.push(args);return accepted;}}};}},['sendManualWhatsAppMessage']);
  await sendManualWhatsAppMessage({to:'+34900000001',body:'Hi'});assert.equal(calls.length,1);
  delete env.TWILIO_WHATSAPP_FROM;await assert.rejects(()=>sendManualWhatsAppMessage({to:'x',body:'x'}),e=>e.manualSendNotAttempted);assert.equal(calls.length,1);
});
await test('Reopened Inbox receives persisted failure/uncertainty/acceptance with original text; refresh never sends',async()=>{
  const {getMessagesForConversations}=load('dashboard/lib/inbox.js',{getSupabaseAdmin(){throw Error('Default DB forbidden');},
    buildConversationCopilot:()=>null,isGuestMemoryEnabled:()=>false,sanitizeInboxMessageTranslations},['getMessagesForConversations']);
  for(const error of [null,{status:429,code:20429},{code:'ETIMEDOUT'}]){
    const s=setup({error});const sent=await s.sender(input);
    const rows=await getMessagesForConversations({supabase:s.client,conversationIds:['ca'],hotelId:A});
    assert.equal(rows[0].content,input.message);assert.equal(rows[0].metadata.manual_send.status,sent.delivery.status);assert.equal(s.sent.length,1);
    assert.equal(contract.manualDeliveryText(rows[0].metadata.manual_send),contract.manualDeliveryText(sent.delivery));
  }
});
await test('Actual composer clears only the submitted draft after acceptance, preserves edits and failed/unknown drafts',async()=>{
  const source=readFileSync(new URL('../dashboard/components/InboxClient.js',import.meta.url),'utf8');
  const start=source.indexOf('const sendMessage = async (event) => {');
  const body=source.slice(source.indexOf('{',start)+1,source.indexOf('\n  const updateHumanTakeover',start)).replace(/\n  };\s*$/,'');
  for(const status of ['accepted','unknown','failed'])for(const edited of [false,true]){
    const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},key='synthetic:A:ca';let drafts={'A:ca':input.message},receipt,calls=0;const pendingKeys=[];
    const bindings={manualSendLock:{current:new Set()},sending:false,selectedConversation:{id:'ca'},message:input.message,recoveryKey:key,MANUAL_MESSAGE_MAX_LENGTH:1600,
      blocksSameManualSend,readManualRecovery,getManualSessionStorage:()=>storage,selectedRecovery:null,currentHotel:{id:A},crypto:{randomUUID:()=>ID},draftKey:'A:ca',runManualAttempt,
      setSending(){},setPendingSendKey:key=>pendingKeys.push(key),setManualReceipts(){},getAuthHeaders:async()=>({authorization:'Bearer synthetic'}),staffLanguage:'es',
      fetch:async()=>{calls++;if(edited)drafts['A:ca']='New draft while waiting';return {json:async()=>({delivery:contract.manualDelivery(status,'synthetic',status==='failed')})};},
      setManualRecoveries:fn=>{receipt=fn({})[key];},setItems(){},updateConversationWithMessage(){},setDraftsByConversation:fn=>{drafts=fn(drafts);},
      selectedIdRef:{current:'ca'},markConversationAsRead(){},scrollMessagesToBottom(){}
    };
    await new Function(...Object.keys(bindings),'return async event=>{'+body+'}')(...Object.values(bindings))({preventDefault(){}});
    assert.equal(calls,1);assert.equal(receipt.delivery.status,status);
    assert.deepEqual(pendingKeys,[key,null]);
    assert.equal(readManualRecovery(storage,`${key}:${ID}`).delivery.status,status);
    assert.equal(drafts['A:ca'],edited?'New draft while waiting':status==='accepted'?'':input.message);
  }
  assert.match(source,/messageDelivery\?\.status === 'delivered'/);
  assert.match(source,/sendingSelectedConversation = sending && pendingSendKey === recoveryKey/);
  assert.ok(source.includes('Recuperar texto'));assert.ok(source.includes('Actualizar historial'));
});
await test('Session confirmation survives an uncertain DB refresh only for the same message; historical and other attempts stay unchanged',async()=>{
  const row={id:ID,content:input.message,metadata:{manual_send:contract.manualDelivery('unknown','dispatch_unconfirmed')}};
  const receipt={attemptId:ID,text:input.message,delivery:contract.manualDelivery('accepted','provider_accepted',false,{persisted:false})};
  assert.equal(getManualMessageDelivery(row,receipt).status,'accepted');
  assert.equal(getManualMessageDelivery(row,receipt).persisted,false);
  assert.equal(getManualMessageDelivery(row,{...receipt,attemptId:A}).status,'unknown');
  assert.equal(getManualMessageDelivery(row,{...receipt,text:'Other text'}).status,'unknown');
  assert.equal(getManualMessageDelivery({...row,metadata:{}},receipt),null);
  assert.equal(getManualMessageDelivery({...row,metadata:{manual_send:contract.manualDelivery('delivered','provider_confirmed')}},receipt).status,'delivered');
  assert.equal(row.metadata.manual_send.status,'unknown');
});
await test('Actual history review reads the existing Inbox loader, reports unchanged/error and scopes feedback to the initiating attempt',async()=>{
  const source=readFileSync(new URL('../dashboard/components/InboxClient.js',import.meta.url),'utf8');
  const start=source.indexOf('const reviewManualHistory = async () => {');
  const body=source.slice(source.indexOf('{',start)+1,source.indexOf('\n  const scheduleRealtimeReload',start)).replace(/\n  };\s*$/,'');
  for(const response of [[],null,'throw']){
    let reads=0;const states=[];
    const bindings={selectedRecovery:{attemptId:ID},historyReviewStatus:null,recoveryKey:'actor:A:ca',setManualHistoryReview:s=>states.push(s),
      refreshInboxSilently:async({reason})=>{assert.equal(reason,'manual_send_review');reads++;if(response==='throw')throw Error('synthetic');return response;}};
    await new Function(...Object.keys(bindings),'return async()=>{'+body+'}')(...Object.values(bindings))();
    assert.equal(reads,1);assert.deepEqual(states.map(s=>s.status),['loading',Array.isArray(response)?'updated':'error']);
    assert.ok(states.every(s=>s.key==='actor:A:ca'&&s.attemptId===ID));
  }
  assert.ok(source.includes('WhatsApp no se ha consultado.'));
});
console.log(JSON.stringify(results,null,2));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
