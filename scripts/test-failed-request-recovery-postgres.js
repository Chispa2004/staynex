import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync,execFile} from 'node:child_process';
import {createNativeTestPostgres} from './ci/native-test-postgres.js';
import {recordOperationalRequest} from '../src/services/operational-request.service.js';
import {getRecentMessages} from '../src/services/supabase.service.js';
import {finalizeServiceReply} from '../shared/guest-service/quality.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
assert.equal(process.env.SEND_AUTOMATIONS,'false');assert.equal(process.env.GUEST_MEMORY_ENABLED,'false');assert.match(process.env.NODE_OPTIONS||'',/isolate\.cjs/);
let externalAttempts=0;globalThis.fetch=async()=>{externalAttempts++;throw Error('All external transports forbidden');};
const require=createRequire(import.meta.url),db=process.env.TEST_NATIVE_PG_BIN?await createNativeTestPostgres(process.env.TEST_NATIVE_PG_BIN,process.env.TEST_NATIVE_PG_DRIVER):require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const args=db.docker?[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1']:null;
const sql=db.sql||(text=>execFileSync(db.docker,args,{input:text,env:process.env,encoding:'utf8',timeout:30000}).trim());
const asyncSql=db.sqlAsync||(text=>new Promise((resolve,reject)=>{const child=execFile(db.docker,args,{env:process.env,encoding:'utf8',timeout:30000},(e,out)=>e?reject(e):resolve(out.trim()));child.stdin.end(text);}));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,q=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
const evidence=[];let sequence=100,groups=0;
const pass=name=>{groups++;console.log('PASS '+name);};
try {
 sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE hotels(id uuid PRIMARY KEY,name text,status text DEFAULT 'active',metadata jsonb DEFAULT '{}',archived_at timestamptz,deleted_at timestamptz);
 CREATE TABLE guests(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels);
 CREATE TABLE conversations(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests);
 CREATE TABLE messages(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,conversation_id uuid REFERENCES conversations,sender_type text,content text,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
 CREATE TABLE reservations(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests);
 CREATE TABLE hotel_users(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,user_id uuid,status text,role text);
 CREATE TABLE conversation_ai_state(hotel_id uuid,conversation_id uuid,state_metadata jsonb,PRIMARY KEY(hotel_id,conversation_id));
 CREATE TABLE tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests,conversation_id uuid REFERENCES conversations,room_number text,category text,title text,description text,priority text,status text,created_at timestamptz DEFAULT now());
 GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
 INSERT INTO hotels(id,name)VALUES('${id(1)}','Synthetic Faro'),('${id(2)}','Synthetic Juniper');`);
 for(const file of ['add_operational_request_receipts.sql','guard_operational_request_clarification.sql','recover_failed_operational_request.sql'])sql(fs.readFileSync(new URL('../supabase/sql/'+file,import.meta.url),'utf8'));

 // Include the published ticket lifecycle guard, not only the original receipts.
 sql(`ALTER TABLE tickets ADD COLUMN completed_at timestamptz;
 ALTER TABLE hotel_users ADD COLUMN platform_role text DEFAULT 'none';
 CREATE TABLE enterprise_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid,actor_role text,hotel_id uuid,action text,entity_type text,entity_id uuid,old_values_summary jsonb,new_values_summary jsonb,metadata jsonb,created_at timestamptz);`);
 const attention=fs.readFileSync(new URL('../supabase/sql/create_message_attention.sql',import.meta.url),'utf8');
 const eligibleStart=attention.indexOf('create function public.staynex_attention_eligible('),eligibleEnd=attention.indexOf('$f$;',eligibleStart);
 assert(eligibleStart>=0&&eligibleEnd>eligibleStart);sql(attention.slice(eligibleStart,eligibleEnd+4));
 sql(fs.readFileSync(new URL('../supabase/sql/add_attention_ticket_lifecycle.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated'])assert.equal(sql(`SELECT has_function_privilege('${role}','recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb)','execute')::text;`),'false');
 assert.equal(sql("SELECT has_function_privilege('service_role','recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb)','execute')::text;"),'true');
 sql(fs.readFileSync(new URL('../supabase/sql/recover_failed_operational_request.sql',import.meta.url),'utf8'));
 pass('incremental wrapper is repeatable and service-only; no row migration');
 const fixture=(record=recordOperationalRequest)=>{
  const h=id(1),g=id(++sequence),cid=id(++sequence),rid=id(++sequence),room='QA-617';
  const hotel={id:h,default_language:'es',ai_auto_reply_enabled:true},guest={id:g,hotel_id:h,preferred_language:'es'},conversation={id:cid,hotel_id:h,guest_id:g};
  sql(`INSERT INTO guests VALUES('${g}','${h}');INSERT INTO conversations VALUES('${cid}','${h}','${g}');INSERT INTO reservations VALUES('${rid}','${h}','${g}');INSERT INTO conversation_ai_state VALUES('${h}','${cid}','{}');`);
  const events=[],faults={writes:0,reads:0,writeAt:0},state={rpcCount:0};
  const tickets=()=>JSON.parse(sql(`SELECT coalesce(jsonb_agg(t ORDER BY created_at,id),'[]') FROM tickets t WHERE conversation_id='${cid}';`));
  const client={rpc:async(name,p)=>{
   assert(['record_guest_operational_request_v1','recover_guest_operational_request_v1'].includes(name));state.rpcCount++;events.push({kind:'rpc_attempt',message:p.p_message_id,request:p.p_request});
   if(faults.writes>0||faults.writeAt===state.rpcCount){faults.writes=Math.max(0,faults.writes-1);events.push({kind:'write_failed'});return {error:{code:'SYNTHETIC_WRITE_FAILURE'}};}
   try {const data=JSON.parse(await asyncSql(`SET ROLE service_role;SELECT ${name}(${q(p.p_hotel_id)},${q(p.p_conversation_id)},${q(p.p_message_id)},${q(p.p_request)}::jsonb);`));events.push({kind:'rpc',message:p.p_message_id,ticket:data.ticket.id,replayed:data.replayed,rootReplayed:data.recovery_root_replayed});return {data};}catch{events.push({kind:'sql_denied'});return {error:{code:'SQL_DENIED'}};}
  },from:table=>{
   assert(['messages','tickets'].includes(table));let projection='*',limit=null;const filters={};
   const read=single=>{
    if(table==='tickets'&&faults.reads>0){faults.reads--;events.push({kind:'readback_failed',filters});return {error:{code:'SYNTHETIC_READ_FAILURE'}};}
    const where=Object.entries(filters).map(([k,v])=>k+'='+q(v)).join(' AND ');
    const fields=projection.includes('service_quality:')?"id,conversation_id,hotel_id,sender_type,content,created_at,metadata->'service_quality' AS service_quality":'*';
    const data=JSON.parse(sql(single?`SELECT coalesce((SELECT to_jsonb(t) FROM ${table} t WHERE ${where}),'null');`:`SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT ${fields} FROM ${table} WHERE ${where} ORDER BY created_at DESC LIMIT ${limit||8}) t;`));
    events.push({kind:single?'readback':'history',table,filters,data});return {data};
   };
   const query={select:v=>{projection=v;return query;},eq:(k,v)=>{assert(['id','hotel_id','guest_id','conversation_id'].includes(k));filters[k]=v;return query;},order:()=>query,limit:v=>{limit=v;return query;},single:async()=>read(true),then:(ok,bad)=>Promise.resolve(read(false)).then(ok,bad)};return query;
  }};
  const add=(content,sender='guest',metadata={})=>{const mid=id(++sequence);sql(`INSERT INTO messages(id,hotel_id,conversation_id,sender_type,content,metadata,created_at)VALUES('${mid}','${h}','${cid}',${q(sender)},${q(content)},${q(metadata)}::jsonb,'2026-10-13T10:00:00Z'::timestamptz+interval '${sequence} seconds');`);return {id:mid,hotel_id:h,conversation_id:cid,sender_type:sender,content};};
  const makeArgs=async(source,patch={})=>({hotel,guest,conversation,sourceMessage:source,message:source.content,client,aiResponse:{create_ticket:true,ticket:{category:'maintenance',title:source.content}},
   context:{language:'es',tickets:tickets(),recentMessages:await getRecentMessages({hotelId:h,conversationId:cid,limit:30,client}),serviceCapabilities:{requestRecording:true,mode:'guest_reply'},operationalContext:{hotel_id:h,guest_id:g,conversation_id:cid,reservation:{id:rid},known_room:room,phase:'stay',room_source:'reservation'},...patch}});
  const run=async(content,{persist=true,patch={}}={})=>{
   const source=add(content),input=await makeArgs(source,patch),before=tickets(),eventStart=events.length;
   const outcome=await record(input);
   const final=finalizeServiceReply({primary:{reply:'Ya lo estamos arreglando.'},hotel,hotelId:h,guestId:g,conversationId:cid,context:input.context,message:content,operationalRequest:outcome,ticket:outcome.ticket});
   if(persist)add(final.reply,'ai',{service_quality:final.service_quality});
   const result={source,input,outcome,final:final.reply,before,after:tickets(),events:events.slice(eventStart)};
   evidence.push({message:content,outcome,final:final.reply,before,after:result.after,events:result.events});return result;
  };
  return {hotel,guest,conversation,rid,room,h,g,cid,client,faults,state,events,tickets,add,makeArgs,run};
 };
 const original='El aire acondicionado pierde agua.',follow='Sigue el mismo problema del aire acondicionado.';
 const a=fixture();a.faults.writes=1;const first=await a.run(original);assert.equal(first.after.length,0);assert.equal(first.outcome.status,'unconfirmed');
 const second=await a.run(follow);assert.equal(second.outcome.status,'recorded');assert.equal(second.after.length,1);assert.equal(second.after[0].priority,'high');assert.equal(second.after[0].room_number,a.room);assert(second.after[0].description.includes(original)&&second.after[0].description.includes(follow));assert.match(second.final,/Ahora sí.*registrado/);assert.doesNotMatch(second.final,/estamos arreglando|avisado|en camino/);
 const same=await recordOperationalRequest(second.input);assert.equal(same.ticket.id,second.outcome.ticket.id);assert.deepEqual(a.tickets(),second.after);pass('D11 complete original + continuation, high priority, scoped room/readback and same-message replay');
 const b=fixture();b.faults.writes=2;await b.run(original);const twice=await b.run(follow);assert.equal(twice.after.length,0);assert.equal(twice.outcome.status,'unconfirmed');assert.doesNotMatch(twice.final,/hemos registrado|sigue pendiente/);const third=await b.run('Sigue el mismo problema.');assert.equal(third.outcome.status,'recorded');assert.equal(third.after[0].priority,'high');assert(third.after[0].description.includes(follow));pass('two failures never confirm, later recovery retains intermediate messages');
 const c=fixture();c.faults.reads=1;const lost=await c.run(original);assert.equal(lost.after.length,1);assert.equal(lost.outcome.status,'unconfirmed');const recovered=await c.run(follow);assert.equal(recovered.outcome.ticket.id,lost.after[0].id);assert.equal(recovered.after.length,1);assert(recovered.events.some(e=>e.kind==='rpc'&&e.rootReplayed));pass('committed root with lost readback is replayed before continuation, no duplicate');
 const d=fixture();d.faults.writes=1;await d.run(original);
 sql(`CREATE FUNCTION fail_recovery_followup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT content FROM messages WHERE id=NEW.source_message_id) LIKE 'Sigue%' THEN RAISE EXCEPTION 'Injected second receipt failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER fail_recovery_followup BEFORE INSERT ON operational_request_receipts FOR EACH ROW EXECUTE FUNCTION fail_recovery_followup();`);
 const partial=await d.run(follow);assert.equal(partial.outcome.status,'unconfirmed');assert.equal(partial.after.length,0);
 sql('DROP TRIGGER fail_recovery_followup ON operational_request_receipts;DROP FUNCTION fail_recovery_followup();');
 const resumed=await recordOperationalRequest(partial.input);assert.equal(resumed.status,'recorded');assert.equal(d.tickets().length,1);assert(resumed.ticket.description.includes(original)&&resumed.ticket.description.includes(follow));pass('failure on second receipt rolls back entire recovery; retry persists the complete request');
 const e=fixture();e.faults.writes=1;await e.run(original);const concurrentSource=e.add(follow),concurrentArgs=await e.makeArgs(concurrentSource);
 const raced=await Promise.all(Array.from({length:5},()=>recordOperationalRequest(concurrentArgs)));assert(raced.every(r=>r.status==='recorded'));assert.equal(new Set(raced.map(r=>r.ticket.id)).size,1);assert.equal(e.tickets().length,1);assert.equal(e.tickets()[0].description.split(follow).length-1,1);assert.equal(sql(`SELECT count(*) FROM operational_request_receipts WHERE hotel_id='${e.h}' AND ticket_id='${raced[0].ticket.id}';`),'2');evidence.push({scenario:'concurrent',outcomes:raced,after:e.tickets(),events:e.events,receipts:JSON.parse(sql(`SELECT jsonb_agg(r) FROM operational_request_receipts r WHERE ticket_id='${raced[0].ticket.id}';`))});pass('five truly concurrent recoveries: one ticket, two source receipts, one continuation');
 const f=fixture();f.faults.writes=1;await f.run(original);f.faults.writes=1;await f.run('Necesito dos toallas.');const ambiguous=await f.run('Sigue la misma petición.');assert.equal(ambiguous.outcome.status,'needs_review');assert.equal(ambiguous.after.length,0);assert(!ambiguous.events.some(e=>e.kind==='rpc_attempt'));pass('two failed requests require clarification, never choose by shared words');
 const n=fixture();n.faults.writes=1;await n.run(original);const newer=await n.run('Otra incidencia: el aire acondicionado no enfría.');assert.equal(newer.outcome.status,'recorded');assert.equal(newer.after[0].priority,'normal');assert.doesNotMatch(newer.after[0].description,/pierde agua/);pass('explicit new incident is separate, no inherited urgency or original leak');
 const k=fixture();k.faults.writes=1;await k.run(original);const correction=await k.run('Corrijo: no pierde agua; solo no enfría el aire acondicionado.');assert.equal(correction.outcome.status,'recorded');assert.equal(correction.after[0].priority,'normal');assert(correction.after[0].description.includes(original));assert.match(correction.after[0].description,/Corrijo:/);assert.doesNotMatch(correction.final,/zona mojada|wet floor/);pass('explicit correction prevails for reevaluated priority while preserving the history');
 const withdrawn=fixture();withdrawn.faults.writes=1;await withdrawn.run(original);await withdrawn.run('Ya no hace falta.');const later=await withdrawn.run(follow);assert.equal(later.outcome.status,'needs_review');assert.equal(later.after.length,0);pass('withdrawal cannot be reactivated by a later generic continuation; no cancellation implemented');
 for(const type of ['room','stay','conversation','hotel','guest']) {
  const x=fixture();x.faults.writes=1;await x.run(original);const src=x.add(follow),input=await x.makeArgs(src);
  if(type==='room')input.context.operationalContext.known_room='QA-999';
  else if(type==='stay')input.context.operationalContext.reservation.id=id(9999);
  else input.context.recentMessages=input.context.recentMessages.map(m=>type==='guest'?{...m,metadata:{service_quality:{...m.metadata?.service_quality,failed_request:{...m.metadata?.service_quality?.failed_request,guest_id:id(9999)}}}}:{...m,[type+'_id']:id(9999)});
  const count=x.state.rpcCount,r=await recordOperationalRequest(input);assert.equal(r.status,'needs_review',type);assert.equal(x.state.rpcCount,count);assert.equal(x.tickets().length,0);
 }
 pass('changed room/stay and foreign hotel/guest/conversation cannot recover another context');
 const staff=fixture();staff.faults.reads=1;const prior=await staff.run(original);sql(`UPDATE tickets SET priority='low' WHERE id='${prior.after[0].id}';`);const staffRecovery=await staff.run(follow);assert.equal(staffRecovery.outcome.status,'recorded');assert.equal(staffRecovery.after[0].priority,'low');pass('receipt replay preserves an existing authorized staff priority rather than restoring old high priority');
 const paused=fixture();paused.faults.writes=1;await paused.run(original);sql(`UPDATE conversation_ai_state SET state_metadata='{"conversation_ai_mode":"human_takeover"}' WHERE conversation_id='${paused.cid}';`);const blocked=await paused.run(follow);assert.equal(blocked.outcome.status,'unconfirmed');assert.equal(blocked.after.length,0);pass('SQL human-control lock blocks recovery even with a valid failure marker');
 const qty=fixture();qty.faults.writes=1;await qty.run('Could you bring two pillows?');const changed=await qty.run('Make it four instead.');assert.equal(changed.after.length,1);assert.equal(changed.after[0].priority,'normal');assert.match(changed.final,/4 almohadas/);assert.equal(changed.after[0].room_number,qty.room);pass('quantity, object and room are persisted together without default high priority');
 const snapshot=JSON.stringify(qty.tickets()),draftInput={...qty.conversation,guest:qty.guest,hotelProfile:qty.hotel,hotelKnowledge:[],tickets:qty.tickets(),messages:await getRecentMessages({hotelId:qty.h,conversationId:qty.cid,client:qty.client}),aiState:{state_metadata:{conversation_ai_mode:'human_takeover'}}};
 const inputCopy=structuredClone(draftInput);assert(buildConversationCopilot(draftInput).suggestedReply.draft);assert.deepEqual(draftInput,inputCopy);assert.equal(JSON.stringify(qty.tickets()),snapshot);
 const draftSource=qty.add(follow),draftArgs=await qty.makeArgs(draftSource,{serviceCapabilities:{requestRecording:true,mode:'staff_draft'}});const rpcCount=qty.state.rpcCount;await recordOperationalRequest(draftArgs);assert.equal(qty.state.rpcCount,rpcCount);pass('Inbox draft and staff-draft mode have no operational writes');

 // A staff completion between failed readback and continuation is authoritative.
 const closed=fixture();closed.faults.reads=1;const closedRoot=await closed.run(original);
 const actor=id(++sequence);sql(`INSERT INTO hotel_users(id,hotel_id,user_id,status,role)VALUES(gen_random_uuid(),'${closed.h}','${actor}','active','receptionist');`);
 const completed=JSON.parse(sql(`SET ROLE service_role;SELECT staynex_ticket_transition_v1('${closed.h}','${closedRoot.after[0].id}','${actor}',gen_random_uuid(),'completed',1,'open');`));
 assert.equal(completed.status,'completed');const beforeClosed=closed.tickets();
 const closedFollow=await closed.run(follow);assert.equal(closedFollow.outcome.status,'unconfirmed');assert.deepEqual(closed.tickets(),beforeClosed);
 assert.doesNotMatch(closedFollow.final,/hemos registrado|working on|sigue pendiente/);
 const groupsRead=JSON.parse(sql(`SET ROLE service_role;SELECT staynex_attention_ticket_groups_v1('${a.h}','${a.cid}');`));
 assert.equal(groupsRead.length,1);assert.equal(groupsRead[0].messageIds.length,2);assert.equal(groupsRead[0].version,2);
 pass('published lifecycle: staff completion cannot reopen, recovery receipts form one Inbox attention group');
 // Deployment matrix against actual SQL, including populated historical receipts.
 // CI supplies the exact reviewed main checkout for all four deployment combinations.
 // A direct local run may omit it; no production client or remote database is accepted.
 const snapshotRows=()=>sql(`SELECT jsonb_object_agg(name,rows) FROM (
  SELECT 'tickets' name,coalesce(jsonb_agg(t ORDER BY id),'[]') rows FROM tickets t UNION ALL
  SELECT 'receipts',coalesce(jsonb_agg(r ORDER BY source_message_id),'[]') FROM operational_request_receipts r UNION ALL
  SELECT 'messages',coalesce(jsonb_agg(m ORDER BY id),'[]') FROM messages m UNION ALL
  SELECT 'hotels',coalesce(jsonb_agg(h ORDER BY id),'[]') FROM hotels h) s;`);
 const migration=fs.readFileSync(new URL('../supabase/sql/recover_failed_operational_request.sql',import.meta.url),'utf8');
 const beforeInstall=snapshotRows();sql(migration);sql(migration);assert.equal(snapshotRows(),beforeInstall);
 assert.equal(sql("SELECT prosecdef::text||':'||array_to_string(proconfig,',') FROM pg_proc WHERE oid='recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb)'::regprocedure;"),'false:search_path=pg_catalog, public');
 pass('populated install and repeat preserve tickets, receipts, messages and hotels; fixed invoker search_path');
 let baselineRecord=null,baselineSha=null;
 if(process.env.TEST_SERVICE_BASELINE_CHECKOUT) {
  const baseline=path.resolve(process.env.TEST_SERVICE_BASELINE_CHECKOUT);
  baselineSha=execFileSync('git',['-C',baseline,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.equal(baselineSha,'f627f8b441b1107c229a0daf7a5cb3ce95fd3d27','Reviewed baseline must be exact main');
  assert.equal(execFileSync('git',['-C',baseline,'status','--porcelain'],{encoding:'utf8'}).trim(),'','Baseline must be clean');
  baselineRecord=(await import(pathToFileURL(path.join(baseline,'src/services/operational-request.service.js')).href)).recordOperationalRequest;
 }
 sql('DROP FUNCTION public.recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb);');
 if(baselineRecord) {
  const old=fixture(baselineRecord),made=await old.run('Necesito dos toallas.');assert.equal(made.outcome.status,'recorded');
  const saved=old.tickets();assert.equal((await baselineRecord(made.input)).ticket.id,made.outcome.ticket.id);assert.deepEqual(old.tickets(),saved);
  pass('matrix main code + main schema: creation and retry use original contract');
 }
 const absent=fixture();absent.faults.writes=1;await absent.run(original);
 const missing=await absent.run(follow);assert.equal(missing.outcome.status,'unconfirmed');assert.equal(absent.tickets().length,0);
 assert.equal(sql(`SELECT count(*) FROM operational_request_receipts WHERE source_message_id=${q(missing.source.id)};`),'0');
 assert.equal(missing.events.filter(e=>e.kind==='rpc_attempt').length,1);
 assert.doesNotMatch(missing.final,/hemos registrado|sigue pendiente|working on/);
 const beforeNew=snapshotRows();sql(migration);assert.equal(snapshotRows(),beforeNew);
 pass('matrix new code + main schema: missing wrapper, no partial write or false acknowledgement');
 if(baselineRecord) {
  const old=fixture(baselineRecord),made=await old.run('Necesito dos toallas.');assert.equal(made.outcome.status,'recorded');
  assert.equal((await baselineRecord(made.input)).ticket.id,made.outcome.ticket.id);assert.equal(old.tickets().length,1);
  pass('matrix main code + new schema: original consumer and receipts unchanged');
 }
 const retried=await recordOperationalRequest(missing.input);assert.equal(retried.status,'recorded');assert.equal(retried.ticket.priority,'high');
 assert(retried.ticket.description.includes(original)&&retried.ticket.description.includes(follow));assert.equal(absent.tickets().length,1);
 assert.equal((await recordOperationalRequest(missing.input)).ticket.id,retried.ticket.id);
 pass('matrix new code + new schema: same failed operation recovers after install with no duplicates');
 const beforePreflight=snapshotRows();sql(fs.readFileSync(new URL('../supabase/sql/preflight_failed_operational_request_recovery.sql',import.meta.url),'utf8'));assert.equal(snapshotRows(),beforePreflight);
 pass('future catalog preflight executes read-only without changing synthetic data');
 evidence.push({scenario:'compatibility-matrix',baselineSha,missing:missing.outcome,retried,rowsUnchangedOnInstall:true});
 assert.equal(externalAttempts,0);
 const output=process.argv[2]||'.npm-cache/failed-request-recovery/evidence.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({base:'a6594c5afb4390781ea7f112fef7564af9544c9e',groups,realCalls:0,realTokens:0,realUsd:0,externalAttempts,evidence},null,2)+'\n');
 console.log(`${groups} targeted recovery groups PASS; disposable PostgreSQL, zero external calls`);
}finally{db.cleanup();}
