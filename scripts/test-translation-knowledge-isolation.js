import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccess, canAccessPlatform, getPermissionsForPlatformRole, getPermissionsForRole } from '../dashboard/lib/permissions.js';
import { detectGuestLanguage, normalizeLanguage } from '../src/services/language.service.js';
import { validateAiResponse } from '../src/schemas/ai-response.schema.js';
import crypto from 'node:crypto';
import * as demoProvenance from '../shared/demo-message-stages/server-provenance.js';
import { getVerifiedMessageTranslation, sanitizeInboxMessageTranslations, shouldCompactOriginalMessage } from '../dashboard/lib/inbox-message-presentation.js';

// Load executable production bodies with controlled boundaries, as in test-auth-hotel-context.
const load = (file, supplied, exports) => { const bindings = { ...demoProvenance, ...supplied }; return new Function(...Object.keys(bindings),
  readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'')
    .replaceAll('export const ','const ').replaceAll('export async function ','async function ')
    + '\nreturn {'+exports.join(',')+'};')(...Object.values(bindings)); };
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const makeStore=()=>{
  const db={messages:[{id:'ma',hotel_id:A,conversation_id:'ca',content:'Synthetic A',metadata:{}},{id:'mb',hotel_id:B,conversation_id:'cb',content:'PRIVATE SYNTHETIC B',metadata:{}}],
    conversations:[{id:'ca',hotel_id:A},{id:'cb',hotel_id:B}],hotel_knowledge:[{id:'ka',hotel_id:A,key:'wifi',value:'A only',category:'wifi'},
      {id:'kb',hotel_id:B,key:'wifi',value:'B only',category:'wifi'},{id:'global',hotel_id:null,key:'wifi',value:'Unclassified',category:'wifi'},
      {id:'protected',hotel_id:A,key:'security',value:'Admin only',category:'security'}]};
  db.hotel_knowledge.forEach(x=>x.is_active=true);
  const calls=[];let serial=0;
  const client={from(table){let filters=[],action='select',values,columns='*';const query={
    select(v='*'){columns=v;return query;},eq(k,v){filters.push([k,v]);return query;},in(k,vs){filters.push([k,vs]);return query;},order(){return query;},limit(){return query;},
    insert(v){action='insert';values=v;return query;},update(v){action='update';values=v;return query;},delete(){action='delete';return query;},
    async execute(single=false){let rows=db[table].filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));
      calls.push({table,action,columns,filters:structuredClone(filters),readIds:rows.map(x=>x.id)});
      if(table==='messages'&&columns.includes('original_language')&&client.legacyTranslation){client.legacyTranslation=false;return {data:null,error:new Error('column original_language does not exist')};}
      if(action==='insert'){rows=(Array.isArray(values)?values:[values]).map(x=>({id:'new-'+(++serial),...x}));db[table].push(...rows);}
      if(action==='update')rows.forEach(x=>Object.assign(x,values));
      if(action==='delete')db[table]=db[table].filter(x=>!rows.includes(x));
      return {data:single?structuredClone(rows[0]??null):structuredClone(rows),error:single&&action==='update'&&!rows.length?Object.assign(new Error('Not found'),{status:404}):null};
    },maybeSingle(){return query.execute(true);},single(){return query.execute(true);},then(a,b){return query.execute().then(a,b);}
  };return query;}};return {db,calls,client};
};
const results=[];
const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}};
const logger={info(){},warn(){},error(){}};
await test('Translator memory cache separates tenants, exact content and purpose; no unscoped cache',async()=>{
  const {translateText}=load('src/services/translation.service.js',{
    normalizeLanguage,detectGuestLanguage,logger,
    OpenAI:class { constructor(){throw Error('Real provider forbidden');} },
    process:{env:{USE_MOCK_AI:'true'}}
  },['translateText']);
  const input={text:'Synthetic code: AB-12!',sourceLanguage:'en',targetLanguage:'es',purpose:'staff'};
  const first=await translateText({...input,hotelId:A});assert.ok(!first.cached);
  const other=await translateText({...input,hotelId:B});assert.ok(!other.cached,'another hotel reused a cached result');
  assert.equal((await translateText({...input,hotelId:A})).cached,true);
  const different=await translateText({...input,text:'Synthetic code: ab 12',hotelId:A});
  assert.ok(!different.cached,'different text collided after normalization');assert.equal(different.originalText,'Synthetic code: ab 12');
  assert.ok(!(await translateText({...input,hotelId:A,purpose:'guest'})).cached);
  for(let i=0;i<2;i++)assert.ok(!(await translateText(input)).cached,'missing tenant must not share cache');
});
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
const backend=store=>{
  const translations=[];
  const {handleTranslateMessage}=load('src/controllers/messages.controller.js',{getSupabase:()=>store.client,sendStaffMessage:()=>{throw Error('Sending forbidden');},detectLanguage:()=> 'en',normalizeLanguage,logger,
    translateText:async args=>{translations.push(args);return {translatedText:'Synthetic translation',sourceLanguage:'en',targetLanguage:'es',provider:'controlled'};}},['handleTranslateMessage']);
  return {translations,handleTranslateMessage};
};
for(const hotelId of [A,undefined])await test('Backend foreign message rejected before content/provider: '+(hotelId?'explicit A':'missing hotel'),async()=>{
  const s=makeStore(),b=backend(s),res=response();await b.handleTranslateMessage({body:{hotelId,messageId:'mb',targetLanguage:'es'}},res,e=>{throw e;});
  assert.ok([400,403,404].includes(res.statusCode));assert.equal(b.translations.length,0);
  assert.ok(!s.calls.some(x=>x.table==='messages'&&x.columns.includes('content')&&x.readIds.includes('mb')),'foreign content was read before authorization');
});
for(const hotelId of [B,undefined])await test('Dashboard A cannot translate B: '+(hotelId?'manipulated body hotel':'omitted hotel'),async()=>{
  const s=makeStore();let forwarded=0;
  const {POST}=load('dashboard/app/api/translate/route.js',{NextResponse:{json:(body,options={})=>({body,status:options.status??200})},
    getCurrentHotelForRequest:async()=>({supabase:s.client,hotel:{id:A},role:'receptionist'}),canAccess,getInternalApiHeaders:x=>x,
    fetch:async()=>{forwarded++;throw Error('Foreign request reached backend');}},['POST']);
  const result=await POST({json:async()=>({messageId:'mb',hotelId})});assert.equal(result.status,404);assert.equal(forwarded,0);
  assert.ok(s.calls.filter(x=>x.table==='messages').every(x=>x.filters.some(([k,v])=>k==='hotel_id'&&v===A)),'message metadata query must also be scoped');
});
await test('Legitimate dashboard/backend translation, server hotel and cache scope',async()=>{
  const s=makeStore(),b=backend(s);let forwarded;
  const {POST}=load('dashboard/app/api/translate/route.js',{NextResponse:{json:(body,options={})=>({body,status:options.status??200})},
    getCurrentHotelForRequest:async()=>({supabase:s.client,hotel:{id:A},role:'receptionist'}),canAccess,getInternalApiHeaders:x=>x,
    fetch:async(_url,options)=>{forwarded=JSON.parse(options.body);const res=response();await b.handleTranslateMessage({body:forwarded},res,e=>{throw e;});return {status:res.statusCode,json:async()=>res.body};}},['POST']);
  assert.equal((await POST({json:async()=>({messageId:'ma',hotelId:B,targetLanguage:'es'})})).status,200);
  assert.equal(forwarded.hotelId,A);assert.equal(b.translations.length,1);assert.equal(b.translations[0].text,'Synthetic A');
  assert.equal(b.translations[0].hotelId,A,'translator cache must receive authorized tenant');
  assert.ok(s.calls.filter(x=>x.table==='messages'&&x.action==='update').every(x=>x.filters.some(([k,v])=>k==='hotel_id'&&v===A)));
  assert.equal((await POST({json:async()=>({messageId:'ma',targetLanguage:'es'})})).body.cached,true);assert.equal(b.translations.length,1);
});
await test('Translation legacy-column fallback and draft translation retain authorized hotel',async()=>{
  const s=makeStore();s.client.legacyTranslation=true;const b=backend(s),res=response();
  await b.handleTranslateMessage({body:{hotelId:A,messageId:'ma',targetLanguage:'es'}},res,e=>{throw e;});assert.equal(res.statusCode,200);
  assert.ok(s.calls.filter(x=>x.table==='messages').every(x=>x.filters.some(([k,v])=>k==='hotel_id'&&v===A)));
  const draft=response();await b.handleTranslateMessage({body:{hotelId:A,text:'Synthetic draft',targetLanguage:'es'}},draft,e=>{throw e;});assert.equal(draft.statusCode,200);
});
await test('Legacy or foreign cache provenance is not returned as a valid translation',async()=>{
  for(const scope of [{},{cache_scope:'hotel-v1',hotel_id:B},{cache_scope:'hotel-v1',hotel_id:A,target_language:'fr'}]){
    const s=makeStore(),b=backend(s),res=response();
    s.db.messages[0].metadata={translations:{es:{translated_text:'Unverified synthetic cache',...scope}}};
    await b.handleTranslateMessage({body:{hotelId:A,messageId:'ma',targetLanguage:'es'}},res,e=>{throw e;});
    assert.equal(b.translations.length,1);assert.equal(res.body.translatedText,'Synthetic translation');
  }
});
await test('Inconsistent conversation rejected before selecting content',async()=>{
  const s=makeStore();s.db.messages[0].conversation_id='cb';const b=backend(s),res=response();
  await b.handleTranslateMessage({body:{hotelId:A,messageId:'ma'}},res,e=>{throw e;});assert.equal(res.statusCode,404);
  assert.equal(b.translations.length,0);assert.ok(!s.calls.some(x=>x.table==='messages'&&x.columns.includes('content')));
});
await test('Internal translation route requires internal authentication; browser cannot assert hotel B directly',async()=>{
  const {requireInternalApiToken}=load('src/middleware/security.middleware.js',{crypto,logger,getSupabase:()=>{throw Error('DB forbidden');},twilio:{}},['requireInternalApiToken']);
  process.env.STAYNEX_INTERNAL_API_TOKEN='synthetic-test-only';let entered=0;
  for(const headers of [{},{'x-staynex-internal-token':'wrong'}]){const res=response();requireInternalApiToken({headers,body:{hotelId:B},method:'POST',originalUrl:'/messages/translate'},res,()=>entered++);assert.ok([401,403].includes(res.statusCode));}
  assert.equal(entered,0);delete process.env.STAYNEX_INTERNAL_API_TOKEN;
  assert.match(readFileSync(new URL('../src/routes/messages.routes.js',import.meta.url),'utf8'),/router.post\('\/translate', requireInternalApiToken, handleTranslateMessage\)/);
});
await test('Authenticated user -> actual hotel resolver -> internal authentication -> scoped translator',async()=>{
  const s=makeStore(),b=backend(s);let forwarded=0,authCalls=0;
  s.client.auth={getUser:async token=>{authCalls++;return token==='synthetic-session-a'
    ? {data:{user:{id:'user-a',email:'a@example.test'}},error:null}
    : {data:{user:null},error:Error('Invalid synthetic session')};}};
  const {getCurrentHotelForRequest}=load('dashboard/lib/current-hotel.js',{
    getSupabaseAdmin:()=>s.client,canAccessPlatform,getPermissionsForPlatformRole,getPermissionsForRole,
    normalizeAuthEmail:x=>String(x).toLowerCase(),resolvePendingInvitationsForUser:async()=>{},
    getUserHotelAssignments:async({userId})=>{assert.equal(userId,'user-a');return [{id:'assignment-a',hotel_id:A,
      hotel:{id:A},role:'receptionist',status:'active',user_id:'user-a',platform_role:'none',is_default:true}];}
  },['getCurrentHotelForRequest']);
  const {getInternalApiHeaders}=load('dashboard/lib/internal-api.js',{},['getInternalApiHeaders']);
  const {requireInternalApiToken}=load('src/middleware/security.middleware.js',{crypto,logger,getSupabase:()=>s.client,twilio:{}},['requireInternalApiToken']);
  process.env.STAYNEX_INTERNAL_API_TOKEN='synthetic-chain-only';
  try {
    const {POST}=load('dashboard/app/api/translate/route.js',{getCurrentHotelForRequest,canAccess,getInternalApiHeaders,
      NextResponse:{json:(body,options={})=>({body,status:options.status??200})},
      fetch:async(_url,options)=>{forwarded++;const req={headers:options.headers,body:JSON.parse(options.body)},res=response();let authorized=false;
        requireInternalApiToken(req,res,()=>{authorized=true;});assert.equal(authorized,true);assert.equal(req.body.hotelId,A);
        await b.handleTranslateMessage(req,res,e=>{throw e;});return {status:res.statusCode,json:async()=>res.body};}
    },['POST']);
    const request=(body,token='synthetic-session-a')=>({url:'https://synthetic.test/api/translate?hotelId='+B,
      headers:new Headers({'authorization':'Bearer '+token,'x-staynex-hotel-id':B,'x-staynex-workspace-path':'/dashboard/inbox'}),json:async()=>body});
    for(const hotelId of [B,undefined])assert.equal((await POST(request({messageId:'mb',hotelId}))).status,404);
    assert.equal(forwarded,0);assert.equal(b.translations.length,0);
    assert.equal((await POST(request({messageId:'ma',hotelId:B}))).status,200);
    assert.equal(forwarded,1);assert.equal(b.translations[0].hotelId,A);
    assert.equal((await POST(request({messageId:'ma'},'invalid'))).status,403);assert.equal(forwarded,1);assert.equal(authCalls,4);
  } finally {delete process.env.STAYNEX_INTERNAL_API_TOKEN;}
});
const knowledge=(s,role='manager')=>load('dashboard/lib/knowledge.js',{getCurrentHotelForRequest:async()=>({supabase:s.client,hotel:{id:A},role,fallback:false}),canAccess},
  ['getKnowledgeEntries','createKnowledgeEntry','updateKnowledgeEntry','deleteKnowledgeEntry']);
for(const role of ['owner','admin','manager','receptionist','housekeeping','maintenance','analyst'])await test('Knowledge CRUD scope and canonical role '+role,async()=>{
  const s=makeStore(),k=knowledge(s,role),allowed=canAccess(role,'knowledge_base_manage');
  if(!allowed){for(const action of [()=>k.getKnowledgeEntries({}),()=>k.createKnowledgeEntry({},{key:'x',value:'x'}),()=>k.updateKnowledgeEntry({},{id:'ka',value:'x'}),()=>k.deleteKnowledgeEntry({},'ka')])await assert.rejects(action,e=>e.status===403);assert.equal(s.calls.length,0);return;}
  const entries=(await k.getKnowledgeEntries({})).entries;assert.ok(entries.every(x=>x.hotel_id===A));
  const made=await k.createKnowledgeEntry({},{key:'new',value:'A',hotel_id:B,hotelId:B});assert.equal(made.hotel_id,A);
  await k.updateKnowledgeEntry({},{id:made.id,value:'A changed',hotel_id:B});assert.equal(s.db.hotel_knowledge.find(x=>x.id===made.id).hotel_id,A);
  await assert.rejects(()=>k.updateKnowledgeEntry({},{id:'kb',value:'BAD'}));await k.deleteKnowledgeEntry({},'kb');
  assert.equal(s.db.hotel_knowledge.find(x=>x.id==='kb').value,'B only');await k.deleteKnowledgeEntry({},made.id);assert.ok(!s.db.hotel_knowledge.find(x=>x.id===made.id));
  if(role==='receptionist'){assert.ok(!entries.some(x=>x.id==='protected'));await assert.rejects(()=>k.updateKnowledgeEntry({},{id:'protected',value:'BAD'}),e=>e.status===403);await assert.rejects(()=>k.deleteKnowledgeEntry({},'protected'),e=>e.status===403);}
});
await test('No cross-hotel knowledge fallback, even explicitly requested',async()=>{
  const s=makeStore();let defaultReads=0;
  const k=load('src/services/knowledge.service.js',{getSupabase:()=>s.client,normalizeLanguage,logger,validateAiResponse,getDefaultHotel:async()=>{defaultReads++;return {id:B};}},['searchKnowledge']);
  assert.equal(await k.searchKnowledge('wifi','empty-hotel',{allowDemoFallback:true}),null);assert.equal(defaultReads,0);
  assert.equal((await k.searchKnowledge('wifi',A)).entry.hotel_id,A);
  assert.equal(await k.searchKnowledge('wifi',undefined),null);
});
await test('Starter knowledge honors existing permissions before writes',async()=>{
  const s=makeStore();
  const {POST}=load('dashboard/app/api/onboarding/knowledge-starter/route.js',{getCurrentHotelForRequest:async()=>({supabase:s.client,hotel:{id:A},role:'housekeeping'}),canAccess,NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},['POST']);
  assert.equal((await POST({})).status,403);assert.equal(s.calls.length,0);
});
await test('Starter respects protected entries for reception and preserves legitimate onboarding',async()=>{
  for(const role of ['receptionist','manager'])for(const protectedEntry of [true,false]){
    const s=makeStore();if(protectedEntry)s.db.hotel_knowledge.find(x=>x.id==='ka').category='security';
    const helpers=load('dashboard/lib/knowledge.js',{canAccess},['isAdminKnowledgeRole','isProtectedKnowledgeEntry']);
    const {POST}=load('dashboard/app/api/onboarding/knowledge-starter/route.js',{
      ...helpers,canAccess,getCurrentHotelForRequest:async()=>({supabase:s.client,hotel:{id:A},role}),
      NextResponse:{json:(body,options={})=>({body,status:options.status??200})}
    },['POST']);
    const result=await POST({});
    if(role==='receptionist'&&protectedEntry){assert.equal(result.status,403);assert.ok(s.calls.every(x=>x.action==='select'));}
    else {assert.equal(result.status,200);assert.ok(result.body.entries.every(x=>x.hotel_id===A));}
    assert.equal(s.db.hotel_knowledge.find(x=>x.id==='kb').value,'B only');
  }
});
await test('Backend service-role knowledge CRUD requires explicit hotel and preserves foreign/global rows',async()=>{
  const s=makeStore(),k=load('src/services/knowledge.service.js',{getSupabase:()=>s.client,normalizeLanguage,logger,validateAiResponse},['getKnowledgeForHotel','createKnowledgeEntry','updateKnowledgeEntry','deleteKnowledgeEntry']);
  assert.ok((await k.getKnowledgeForHotel(A)).every(x=>x.hotel_id===A));assert.deepEqual(await k.getKnowledgeForHotel(null),[]);
  for(const fn of [()=>k.createKnowledgeEntry({key:'x',value:'x'}),()=>k.updateKnowledgeEntry('global',null,{value:'x'}),()=>k.deleteKnowledgeEntry('global',null)])await assert.rejects(fn,e=>e.status===400);
  await assert.rejects(()=>k.updateKnowledgeEntry('kb',A,{value:'BAD'}));await k.deleteKnowledgeEntry('kb',A);
  const created=await k.createKnowledgeEntry({hotelId:A,key:'own',value:'own'});await k.updateKnowledgeEntry(created.id,A,{value:'updated'});await k.deleteKnowledgeEntry(created.id,A);
  assert.equal(s.db.hotel_knowledge.find(x=>x.id==='kb').value,'B only');assert.equal(s.db.hotel_knowledge.find(x=>x.id==='global').hotel_id,null);
});
await test('Inbox historical projection preserves originals and rejects unmarked, foreign and inconsistent translations',async()=>{
  const historical={id:'ma',hotel_id:A,conversation_id:'ca',sender_type:'guest',content:'Original synthetic message',created_at:'2020-01-01',
    original_language:'en',translated_language:'es',translated_text:'UNVERIFIED',translation_provider:'openai',
    metadata:{keep:'history',translations:{es:{translated_text:'UNVERIFIED',target_language:'es'}}}};
  for(const cache of [historical.metadata.translations.es,
    {...historical.metadata.translations.es,cache_scope:'hotel-v1',hotel_id:B},
    {...historical.metadata.translations.es,cache_scope:'hotel-v1',hotel_id:A,target_language:'fr'}]){
    const message={...historical,metadata:{...historical.metadata,translations:{es:cache}}},before=structuredClone(message);
    const projected=sanitizeInboxMessageTranslations(message,A);
    assert.equal(getVerifiedMessageTranslation(message,'es',A),null);assert.equal(projected.translated_text,null);
    assert.deepEqual(projected.metadata.translations,{});assert.equal(projected.content,historical.content);
    assert.equal(projected.created_at,historical.created_at);assert.equal(projected.metadata.keep,'history');assert.deepEqual(message,before);
  }
  const valid={...historical,metadata:{translations:{es:{cache_scope:'hotel-v1',hotel_id:A,target_language:'es',translated_text:'Verified result'}}}};
  assert.equal(getVerifiedMessageTranslation(valid,'es',A).translation,'Verified result');
  assert.equal(getVerifiedMessageTranslation(valid,'es',B),null);
  assert.equal(sanitizeInboxMessageTranslations(valid,A).translated_text,'Verified result','raw top-level text is never preferred');
  assert.equal(getVerifiedMessageTranslation(valid,'fr',A),null);
});
await test('Actual Inbox loader strips historical translations, retains new scoped cache, and keeps legacy fallback scoped',async()=>{
  const s=makeStore(),b=backend(s);
  s.db.messages[0].translated_text='UNVERIFIED';s.db.messages[0].translated_language='es';
  s.db.messages[0].metadata={translations:{es:{translated_text:'UNVERIFIED',target_language:'es'}}};
  const {getMessagesForConversations}=load('dashboard/lib/inbox.js',{
    getSupabaseAdmin:()=>{throw Error('Unscoped access forbidden');},buildConversationCopilot:()=>null,isGuestMemoryEnabled:()=>false,sanitizeInboxMessageTranslations
  },['getMessagesForConversations']);
  const before=structuredClone(s.db.messages);
  const messages=await getMessagesForConversations({supabase:s.client,conversationIds:['ca','cb'],hotelId:A});
  assert.equal(messages.length,1);assert.equal(messages[0].translated_text,null);assert.deepEqual(s.db.messages,before);
  const res=response();await b.handleTranslateMessage({body:{hotelId:A,messageId:'ma',targetLanguage:'es'}},res,e=>{throw e;});
  assert.equal(res.body.cache_scope,'hotel-v1');assert.equal(res.body.hotelId,A);assert.equal(res.body.messageId,'ma');
  const refreshed=await getMessagesForConversations({supabase:s.client,conversationIds:['ca'],hotelId:A});
  assert.equal(getVerifiedMessageTranslation(refreshed[0],'es',A).translation,'Synthetic translation');
  s.client.legacyTranslation=true;await getMessagesForConversations({supabase:s.client,conversationIds:['ca'],hotelId:A});
  assert.ok(s.calls.filter(x=>x.table==='messages').every(x=>x.filters.some(([k,v])=>k==='hotel_id'&&v===A)));
});
await test('Inbox explicit translation action accepts corrected responses and rejects unverifiable backend responses',async()=>{
  const source=readFileSync(new URL('../dashboard/components/InboxClient.js',import.meta.url),'utf8');
  const start=source.indexOf('const requestMessageTranslation = useCallback(async (item, targetLanguage) => {');
  const body=source.slice(source.indexOf('{',start)+1,source.indexOf('}, [translatingMessages, translationOverrides',start));
  for(const trusted of [true,false]){
    let overrides={},items=[{id:'ca',messages:[{id:'ma',hotel_id:A,content:'Original',original_language:'en'}]}],calls=0;
    const run=new Function('currentHotel','normalizeTranslationLanguage','translateMessageForStaff','shouldCompactOriginalMessage',
      'translationOverrides','translatingMessages','setTranslatingMessages','getAuthHeaders','fetch','setTranslationOverrides','setItems','console',
      'return async (item,targetLanguage)=>{'+body+'}')(
        {id:A},x=>x,()=>({sourceLanguage:'en'}),shouldCompactOriginalMessage,{}, {},()=>{},async()=>({authorization:'Bearer synthetic'}),
        async(_url,options)=>{calls++;assert.equal(_url,'/api/translate');assert.equal(JSON.parse(options.body).messageId,'ma');
          return {ok:true,json:async()=>({translatedText:'Verified new result',sourceLanguage:'en',targetLanguage:'es',
            ...(trusted?{cache_scope:'hotel-v1',hotelId:A,messageId:'ma'}:{})})};},
        fn=>{overrides=fn(overrides);},fn=>{items=fn(items);},{warn(){}}
      );
    const result=await run(items[0].messages[0],'es');assert.equal(calls,1);assert.equal(items[0].messages[0].content,'Original');
    if(trusted){assert.equal(result.translation,'Verified new result');assert.equal(overrides['ma:es'].translation,'Verified new result');}
    else {assert.equal(result,null);assert.deepEqual(overrides,{});}
  }
  assert.equal((source.match(/requestMessageTranslation\(item, staffLanguage\)/g)||[]).length,1,'translation must only be invoked by the message action');
  assert.match(source,/onClick=\{\(\) => requestMessageTranslation\(item, staffLanguage\)\}/);
  assert.ok(!source.includes('const directTranslation ='));assert.ok(!source.includes('const fallbackTranslation ='));
  assert.match(source,/getVerifiedMessageTranslation\(item, staffLanguage, currentHotel\?\.id\)/);
});
console.log(JSON.stringify(results,null,2));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
