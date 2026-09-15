// Real disposable PostgreSQL, no remote connections or environment files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),evidence=path.join(root,'.npm-cache/nine-demo-publication/local');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME)$/i.test(k)));
Object.assign(env,{SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true'});
(async()=>{
 const {demoMessageStages}=await import('./demo-message-stages.js');
 const {prepareDemoReplacement}=await import('./demo-message-replacement.js');
 const pg=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env});
 fs.mkdirSync(evidence,{recursive:true});let seq=0;const results=[];
 const sql=(query,error)=>{let output,code=0;try{output=execFileSync(pg.docker,[...pg.host,'exec','-i',pg.container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:query,env,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});}catch(e){code=e.status||1;output=String(e.stdout||'')+String(e.stderr||'');}fs.writeFileSync(path.join(evidence,`${++seq}.log`),query+'\nEXIT '+code+'\n'+output);if(error){assert.notEqual(code,0);assert.match(output,error);}else assert.equal(code,0,output);return output.trim();};
 const file=name=>sql(fs.readFileSync(path.join(root,'supabase/sql/'+name+'.sql'),'utf8'));
 const check=(name,fn)=>{fn();results.push(name);console.log('PASS '+name);};
 try{
  sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create publication supabase_realtime;grant usage on schema public to service_role;');
  for(const name of ['../schema','create_hotels_and_hotel_users','create_user_roles_and_hotel_assignments','add_platform_role_to_hotel_users','add_multilanguage_translation_layer','create_enterprise_audit_logs','create_conversation_ai_state','twilio_inbound_messagesid_dedupe','create_reservations_core','create_message_attention','extend_attention_dashboard_messages'])file(name);
  const h='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
  sql(`insert into hotels(id,name,slug,timezone,whatsapp_number) values('${h}','Hotel Demo Checkin','hotel-demo-checkin','Europe/Madrid','synthetic-only:a'),('${other}','Other','other','Europe/Madrid','synthetic-only:b');insert into hotel_users(hotel_id,user_id,role,status,platform_role) values('${h}','${actor}','receptionist','active','none');`);
  const ref=sql("select (clock_timestamp() at time zone 'Europe/Madrid')::date");
  const ack="set staynex.demo_isolated='on';set staynex.send_automations='false';";
  const old=demoMessageStages({hotelId:h,actorId:actor,referenceDate:ref,edition:'legacy'});sql(ack+old.sql);
  sql(`insert into guests(id,hotel_id,phone_number) values('${other}','${other}','synthetic-only:other');insert into conversations(id,hotel_id,guest_id) values('${other}','${other}','${other}');insert into messages(id,hotel_id,conversation_id,sender_type,content,metadata) values('${other}','${other}','${other}','guest','Other hotel must survive','{"demo":true}');insert into tickets(hotel_id,guest_id,conversation_id,category,title,description) values('${h}','${old.cases[0].guestId}','${old.cases[0].conversationId}','transport','Preserve linked ticket','Existing dependency');`);
  const tables=['guests','reservations','conversations','messages','message_attention','conversation_ai_state','tickets','enterprise_audit_logs'];
  const snap=()=>({hotel:{id:h,name:'Hotel Demo Checkin',slug:'hotel-demo-checkin'},actorId:actor,rows:Object.fromEntries(tables.map(t=>[t,JSON.parse(sql(`select coalesce(json_agg(r),'[]') from ${t} r where hotel_id='${h}'`))]))});
  const backup=snap(),plan=prepareDemoReplacement({backup,referenceDate:ref});
  const otherBefore=sql(`select row_to_json(r) from messages r where id='${other}'`);
  const dash=()=>JSON.parse(sql(`select staynex_attention_dashboard_v2('${h}','simulated')`));
  check('Unchanged backup and foreign keys constrain deletion; linked conversation retained',()=>{assert.equal(plan.deleted.messages.length,3);assert.equal(plan.deleted.conversations.length,2);assert.equal(plan.retainedConversations.length,1);});
  check('Subsequent message edit rejects entire replacement',()=>{sql(`update messages set content='Changed after backup' where id='${old.cases[0].messageId}'`);sql(ack+plan.sql,/Backup no longer matches/);assert.equal(dash().counters.received,3);sql(`update messages set content='${old.cases[0].text.replaceAll("'","''")}' where id='${old.cases[0].messageId}'`);});
  check('New cross-hotel dependent row cannot be cascaded or unlinked',()=>{sql(`create table foreign_history(id uuid primary key,hotel_id uuid,message_id uuid references messages(id) on delete set null);insert into foreign_history values('${other}','${other}','${old.cases[0].messageId}');`);sql(ack+plan.sql,/Unbacked dependent activity/);assert.equal(dash().counters.received,3);sql('drop table foreign_history');});
  check('Load failure rolls back deletion and preserves original history',()=>{sql(ack+plan.sql.replace(`actor uuid:='${actor}'`,"actor uuid:='44444444-4444-4444-8444-444444444444'"),/Demo operator required/);assert.deepEqual(snap(),backup);});
  check('Atomic replacement yields 9 received, 3 resolved, 6 pending, 3 urgent',()=>{sql(ack+plan.sql);assert.deepEqual(dash().counters,{received:9,resolved:3,pending:6,urgent:3});});
  check('Nine distinct elapsed times and three reservation-backed stages; Inbox attention for every case',()=>{
   const d=dash();const next=JSON.parse(sql(`select staynex_attention_dashboard_v2('${h}','simulated',false,'${d.nextCursor.at}','${d.nextCursor.id}')`));const all=[...d.messages,...next.messages];assert.equal(all.length,9);
   assert.equal(sql(`select count(distinct created_at) from messages where hotel_id='${h}'`),'9');assert.equal(sql(`select count(*) from messages where hotel_id='${h}' and ((created_at at time zone 'Europe/Madrid')::date<>'${ref}' or created_at>clock_timestamp())`),'0');
   for(const c of plan.generated.cases){const row=all.find(m=>m.id===c.messageId);assert.equal(row.guest,c.name);assert.equal(row.title,c.text);assert.equal(row.stayStage,c.arrival>0?'Antes de la llegada':c.departure<0?'Después de la salida':'Durante la estancia');const read=JSON.parse(sql(`select staynex_attention_read_v1('${h}','${c.conversationId}',array['${c.messageId}']::uuid[])`));assert.equal(read.items[0].status,c.attention);}
  });
  check('Repeat has no duplicates, timestamp shifts, extra audits or state resets',()=>{const before=snap();sql(ack+plan.sql);assert.deepEqual(snap(),before);});
  check('Other hotel, old guests/reservations, tickets and historical audit are preserved',()=>{assert.equal(sql(`select row_to_json(r) from messages r where id='${other}'`),otherBefore);const after=snap();for(const t of ['guests','reservations','tickets','enterprise_audit_logs'])for(const r of backup.rows[t])assert.deepEqual(after.rows[t].find(a=>a.id===r.id),r);});
  check('Prepared recovery restores exact deleted records and keeps audit history',()=>{const restore=plan.recovery(snap());fs.writeFileSync(path.join(evidence,'recovery.sql'),restore);sql(restore);const restored=snap();for(const t of tables.filter(t=>t!=='enterprise_audit_logs'))assert.deepEqual(restored.rows[t].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),backup.rows[t].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));assert.equal(restored.rows.enterprise_audit_logs.length,4);});
  fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({results,network:pg.inspect.HostConfig.NetworkMode},null,2));
 }finally{pg.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
