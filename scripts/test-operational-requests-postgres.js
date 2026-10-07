import assert from 'node:assert/strict';
import {recordOperationalRequest} from '../src/services/operational-request.service.js';
import {finalizeServiceReply,buildServiceDraft} from '../shared/guest-service/quality.js';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync,execFile} from 'node:child_process';
assert.equal(process.env.SEND_AUTOMATIONS,'false');assert.match(process.env.NODE_OPTIONS||'',/isolate\.cjs/);
const require=createRequire(import.meta.url),db=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const args=[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'];
const sql=text=>execFileSync(db.docker,args,{input:text,env:process.env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const parallel=text=>new Promise((resolve,reject)=>{const p=execFile(db.docker,args,{env:process.env,encoding:'utf8',timeout:30000},(e,out)=>e?reject(e):resolve(out.trim()));p.stdin.end(text);});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
const request={key:'towels',category:'housekeeping',priority:'normal',priority_reason:'guest_operational_request',title:'Dos toallas',reservation_id:id(31),room_number:'A-101',operational_context:{phase:'stay'}};
const call=(message=41,patch={},hotel=1,conversation=21)=>`SET ROLE service_role; SELECT record_guest_operational_request_v1('${id(hotel)}','${id(conversation)}','${id(message)}',${quote(JSON.stringify({...request,...patch}))}::jsonb);`;
const run=(...args)=>JSON.parse(sql(call(...args)));
let groups=0;const pass=s=>{groups++;console.log('PASS operational PostgreSQL '+s);};
try {
 sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE hotels(id uuid PRIMARY KEY,name text,status text DEFAULT 'active',metadata jsonb DEFAULT '{}',archived_at timestamptz,deleted_at timestamptz);
 CREATE TABLE guests(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels);
 CREATE TABLE conversations(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests);
 CREATE TABLE messages(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,conversation_id uuid REFERENCES conversations,sender_type text,content text,created_at timestamptz DEFAULT now());
 CREATE TABLE reservations(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests);
 CREATE TABLE hotel_users(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,user_id uuid,status text,role text);
 CREATE TABLE conversation_ai_state(hotel_id uuid,conversation_id uuid,state_metadata jsonb,PRIMARY KEY(hotel_id,conversation_id));
 CREATE TABLE tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests,conversation_id uuid REFERENCES conversations,room_number text,category text,title text,description text,priority text,status text,created_at timestamptz DEFAULT now());
 GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
 INSERT INTO hotels(id,name)VALUES('${id(1)}','Synthetic A'),('${id(2)}','Synthetic B');
 INSERT INTO guests VALUES('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}');
 INSERT INTO conversations VALUES('${id(21)}','${id(1)}','${id(11)}'),('${id(22)}','${id(2)}','${id(12)}');
 INSERT INTO reservations VALUES('${id(31)}','${id(1)}','${id(11)}'),('${id(32)}','${id(2)}','${id(12)}');
 INSERT INTO hotel_users VALUES('${id(61)}','${id(1)}','${id(71)}','active','housekeeping');
 INSERT INTO conversation_ai_state VALUES('${id(1)}','${id(21)}','{}'),('${id(2)}','${id(22)}','{}');
 INSERT INTO messages(id,hotel_id,conversation_id,sender_type,content) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(1)}','${id(21)}','guest','Necesito dos toallas. Detalle '||n FROM generate_series(41,49)n;
 INSERT INTO messages(id,hotel_id,conversation_id,sender_type,content)VALUES('${id(50)}','${id(2)}','${id(22)}','guest','El aire pierde agua');`);
 const migration=readFileSync(new URL('../supabase/sql/add_operational_request_receipts.sql',import.meta.url),'utf8');
 sql(migration);sql(migration);pass('additive migration repeats safely');
 for(const role of ['anon','authenticated'])assert.equal(sql(`SELECT has_function_privilege('${role}','record_guest_operational_request_v1(uuid,uuid,uuid,jsonb)','execute');`),'f');
 assert.equal(sql("SELECT has_table_privilege('authenticated','operational_request_receipts','select,insert,update,delete');"),'f');
 sql('GRANT SELECT,UPDATE ON tickets TO authenticated;');
 const first=run();assert.equal(first.ticket.room_number,'A-101');assert.equal(first.ticket.request_context.responsible_role,'housekeeping');assert.match(first.ticket.description,/dos toallas/);
 assert.throws(()=>sql(`SET ROLE authenticated; UPDATE tickets SET request_context='{"source_message_id":"fake"}' WHERE id='${first.ticket.id}';`));
 pass('service-only receipt, real department, source details and client forgery denied');
 assert.equal(run().ticket.id,first.ticket.id);assert.equal(run(41,{key:'different-model-interpretation',category:'reception'}).ticket.id,first.ticket.id);assert.equal(run().replayed,true);
 const raced=await Promise.all(Array.from({length:8},()=>parallel(call(42)).then(JSON.parse)));
 assert.equal(new Set(raced.map(x=>x.ticket.id)).size,1);assert.equal(raced.filter(x=>!x.replayed).length,1);
 assert.equal(sql('SELECT count(*) FROM tickets;'),'1');assert.equal(sql('SELECT count(*) FROM operational_request_receipts;'),'2');
 assert.equal((run().ticket.description.match(/Detalle 42/g)||[]).length,1);pass('retry/lost response and eight concurrent followups produce one useful ticket');
 const different=run(43,{key:'air_conditioning',category:'maintenance',priority:'high'});assert.notEqual(different.ticket.id,first.ticket.id);assert.equal(different.ticket.request_context.responsible_role,'reception');
 const another=run(44,{new_incident:true});assert.notEqual(another.ticket.id,first.ticket.id);pass('different request and explicit new incident remain separate; no invented team');
 for(const args of [[50,{},1,21],[41,{},2,22],[45,{reservation_id:id(32)},1,21]])assert.throws(()=>run(...args));
 const other=run(50,{key:'air_conditioning',category:'maintenance',priority:'high',reservation_id:id(32),room_number:'B-808'},2,22);
 assert.equal(other.ticket.hotel_id,id(2));assert.equal(other.ticket.room_number,'B-808');pass('two hotels and cross-hotel message/reservation attacks');
 for(const patch of [{category:null},{priority:null},{key:'../../other'},{title:'  '}])assert.throws(()=>run(45,patch));pass('invalid requests rejected before writes');
 sql(`UPDATE conversation_ai_state SET state_metadata='{"conversation_ai_mode":"human_takeover"}' WHERE hotel_id='${id(1)}';`);
 assert.throws(()=>run(45));assert.equal(run().replayed,true);
 sql(`UPDATE conversation_ai_state SET state_metadata='{}' WHERE hotel_id='${id(1)}';UPDATE hotels SET metadata='{"archive_operational_hold":true}' WHERE id='${id(1)}';`);
 assert.throws(()=>run(45));sql(`UPDATE hotels SET metadata='{}' WHERE id='${id(1)}';`);pass('human control and archive hold block new actions; receipt replay cannot create a ticket');
 const before=sql('SELECT jsonb_agg(t ORDER BY id) FROM tickets t;');
 sql(`CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure';END $$;CREATE TRIGGER fail_receipt BEFORE INSERT ON operational_request_receipts FOR EACH ROW EXECUTE FUNCTION fail_receipt();`);
 assert.throws(()=>run(45));assert.equal(sql('SELECT jsonb_agg(t ORDER BY id) FROM tickets t;'),before);
 sql('DROP TRIGGER fail_receipt ON operational_request_receipts;DROP FUNCTION fail_receipt();');assert.equal(run(45).replayed,false);pass('failure after ticket update rolls back all writes and retry recovers');
 sql(`UPDATE tickets SET status='completed' WHERE hotel_id='${id(1)}';`);assert.notEqual(run(46).ticket.id,first.ticket.id);pass('closed history preserved, later request gets a new ticket');
 // Replay every retained real generation through the production recording and
 // finalization services backed by this disposable PostgreSQL transaction.
 const evidence=JSON.parse(readFileSync(new URL('../docs/evidence/operational-request-ai-20261002.json',import.meta.url),'utf8'));
 let realPaths=0,unfavorable=0;
 for(const input of evidence.inputs){
   sql('TRUNCATE operational_request_receipts,tickets;');
   sql(`INSERT INTO messages(id,hotel_id,conversation_id,sender_type,content,created_at) VALUES(${quote(input.sourceMessage.id)},${quote(input.hotel.id)},${quote(input.conversation.id)},'guest',${quote(input.message)},${quote(input.sourceMessage.created_at)});`);
   let rpcCount=0;
   const client={rpc:async(name,p)=>{rpcCount++;try{return {data:JSON.parse(sql(`SET ROLE service_role; SELECT record_guest_operational_request_v1(${quote(p.p_hotel_id)},${quote(p.p_conversation_id)},${quote(p.p_message_id)},${quote(JSON.stringify(p.p_request))}::jsonb);`))};}catch(error){return {error};}},
     from:()=>{const filters={};const query={select:()=>query,eq:(key,value)=>{filters[key]=value;return query;},single:async()=>({data:JSON.parse(sql(`SELECT to_jsonb(t) FROM tickets t WHERE ${Object.entries(filters).map(([k,v])=>`${k}=${quote(v)}`).join(' AND ')};`))})};return query;}};
   const primary=evidence.outputs.find(x=>x.id===input.id && x.path==='primary').output;
   let firstTicket=null;
   for(const output of evidence.outputs.filter(x=>x.id===input.id)){
     const processed=output.path==='primary'?output.output:{...primary,reply:output.output.suggested_response};
     const outcome=await recordOperationalRequest({...input,context:input.conversationContext,aiResponse:processed,client});
     const final=finalizeServiceReply({primary,processed,ticket:outcome.ticket,hotelId:input.hotel.id,guestId:input.guest.id,conversationId:input.conversation.id,language:input.conversationContext.language,knownRoom:input.conversationContext.knownRoom,context:input.conversationContext,message:input.message,operationalRequest:outcome});
     realPaths++;
     if(input.id.endsWith('information')){assert.equal(outcome.status,'not_requested');assert.equal(rpcCount,0);assert.match(final.reply,input.hotel.id.endsWith('1')?/7:30/:/8/);}
     else {
       assert.equal(outcome.status,'recorded',input.id);assert.equal(outcome.ticket.room_number,input.conversationContext.knownRoom);assert.match(outcome.ticket.description,/toallas|towels|aire acondicionado|air conditioning/i);
       if(firstTicket)assert.equal(outcome.ticket.id,firstTicket);firstTicket=outcome.ticket.id;
       assert.equal(sql('SELECT count(*) FROM tickets;'),'1');assert.equal(final.service_quality.notification_confirmed,false);
       assert.match(final.reply,/registrad[oa]|recorded/i);assert.doesNotMatch(final.reply,/avisado|informado|ya van|cinco minutos|will notify|shortly|promptly|a la brevedad|en breve|se pondr[aá]n? en contacto/i);
       if(input.conversationContext.knownRoom){assert(final.reply.includes(input.conversationContext.knownRoom));assert.doesNotMatch(final.reply,/qu[eé].*habitaci[oó]n|confirm your room|provide your room/i);}
       else assert.match(final.reply,/habitaci[oó]n|room/i);
       if(processed.reply!==final.reply)unfavorable++;
       const count=rpcCount;const draft=buildServiceDraft({message:input.message,language:input.conversationContext.language,room:input.conversationContext.knownRoom,recordedTicket:outcome.ticket});assert.equal(draft.ticketId,outcome.ticket.id);assert.equal(rpcCount,count);
     }
   }
 }
 assert.equal(realPaths,24);assert.equal(unfavorable,20);
 pass(`${realPaths} real synthetic AI outputs replayed against committed tickets; ${unfavorable} unfavorable action promises preserved and corrected after persistence`);
 console.log(`${groups} operational request PostgreSQL groups passed`);
} finally {db.cleanup();}
