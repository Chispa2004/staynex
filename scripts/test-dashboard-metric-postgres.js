import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {loadMessageMetrics} from '../dashboard/lib/message-metrics.js';
assert.equal(process.env.SEND_AUTOMATIONS,'false');assert.match(process.env.NODE_OPTIONS||'',/isolate\.cjs/);
const require=createRequire(import.meta.url),db=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const args=[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'];
const sql=text=>execFileSync(db.docker,args,{input:text,env:process.env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const q=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),h=id(1),c=id(2);
const installed=readFileSync(new URL('../supabase/sql/create_message_attention.sql',import.meta.url),'utf8');
// The unchanged, versioned SQL functions are the reference, not a test reimplementation.
const functionSql=name=>{const start=installed.indexOf('create function public.'+name+'(');assert(start>=0);const end=installed.indexOf('$f$;',start);assert(end>start);return installed.slice(start,end+4);};
let groups=0;const pass=s=>{groups++;console.log('PASS metric PostgreSQL '+s)};
try {
 sql(`CREATE ROLE service_role; CREATE TABLE hotels(id uuid primary key,timezone text);
 CREATE TABLE conversations(id uuid primary key,hotel_id uuid,guest_id uuid);
 CREATE TABLE guests(id uuid primary key,hotel_id uuid,current_room text,name text);
 CREATE TABLE messages(id uuid primary key,hotel_id uuid,conversation_id uuid,sender_type text,metadata jsonb,content text,created_at timestamptz,attention_inclusion_version smallint default 1);
 CREATE TABLE message_attention(message_id uuid primary key,hotel_id uuid,conversation_id uuid,status text,version bigint,changed_at timestamptz,changed_by uuid,actor_kind text);
 CREATE TABLE conversation_ai_state(conversation_id uuid primary key,hotel_id uuid,escalation_level text,updated_at timestamptz);
 CREATE TABLE twilio_inbound_message_claims(message_sid text primary key,hotel_id uuid,message_id uuid);
 INSERT INTO hotels VALUES('${h}','Europe/Madrid');INSERT INTO conversations VALUES('${c}','${h}',null);
 INSERT INTO messages SELECT ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'${h}','${c}','guest',case when n%3=0 then '{"demo":true}'::jsonb else '{}'::jsonb end,'synthetic',clock_timestamp()-n*interval '3 hours',case when n%7=0 then null else 1 end FROM generate_series(0,600)n;
 INSERT INTO twilio_inbound_message_claims SELECT 'SM'||id::text,hotel_id,id FROM messages WHERE metadata='{}' and right(id::text,1) in ('1','3','5');
 INSERT INTO message_attention SELECT id,hotel_id,conversation_id,'resolved',2,clock_timestamp()-interval '1 hour',null,'user' FROM messages WHERE right(id::text,1)='2';
 INSERT INTO conversation_ai_state VALUES('${c}','${h}','urgent',clock_timestamp());`);
 for(const name of ['staynex_attention_eligible','staynex_attention_effective','staynex_attention_origin','staynex_attention_require_contract','staynex_attention_read_v1','staynex_attention_dashboard_v1']) sql(functionSql(name));
 const transport={from(table){let select,hotel,order;return {select(v){select=v;return this},eq(k,v){assert.equal(k,'hotel_id');hotel=v;return this},order(v){order=v;return this},async range(a,b){assert(['messages','conversations','twilio_inbound_message_claims','conversation_ai_state'].includes(table));const fields=select.split(',').map(f=>f.includes(':')?f.split(':').reverse().join(' AS '):f).join(',');return {data:JSON.parse(sql(`select coalesce(json_agg(t),'[]') from(select ${fields} from ${table} where hotel_id=${q(hotel)} order by ${order} limit ${b-a+1} offset ${a})t;`))}}}},async rpc(name,a){const text=name==='staynex_attention_dashboard_v1'?`${q(a.p_hotel)},${q(a.p_origin)}`:`${q(a.p_hotel)},${q(a.p_conversation)},ARRAY[${a.p_ids.map(q).join(',')}]::uuid[]`;return {data:JSON.parse(sql(`select public.${name}(${text});`))}}};
 for(const timezone of ['Europe/Madrid','America/New_York','Pacific/Kiritimati']) {
  sql(`update hotels set timezone=${q(timezone)};`);
  for(const origin of ['simulated','traced','unknown']) {
   const canonical=(await transport.rpc('staynex_attention_dashboard_v1',{p_hotel:h,p_origin:origin})).data;
   const actual=await loadMessageMetrics({supabase:transport,hotel:{id:h,timezone},origin});
   assert.deepEqual(actual.counters,canonical.counters,timezone+' '+origin);
  }
  pass('exact parity with installed SQL across all origins in '+timezone);
 }
 sql('update conversation_ai_state set updated_at=null');
 assert.equal((await loadMessageMetrics({supabase:transport,hotel:{id:h,timezone:'Pacific/Kiritimati'},origin:'simulated'})).counters.urgent,null);
 pass('uncertain alert remains unknown');
 sql('alter table messages alter column attention_inclusion_version drop default');
 await assert.rejects(loadMessageMetrics({supabase:transport,hotel:{id:h,timezone:'Europe/Madrid'},origin:'simulated'}));
 pass('disabled installed contract is refused');
 console.log(`${groups} metric PostgreSQL groups passed; disposable database; no schema changes proposed; network=${db.inspect.HostConfig.NetworkMode}`);
} finally { db.cleanup(); }
