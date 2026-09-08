// Real PostgreSQL evidence. Uses only the explicitly labelled disposable local container.
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, '.npm-cache/message-dashboard-release');
fs.mkdirSync(evidence, {recursive:true});
const docker = 'C:/Users/chimi/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const host = ['--host','npipe:////./pipe/dockerDesktopLinuxEngine'];
const container = 'staynex-message-dashboard-release-20260908';
const database = process.argv[2]==='all' ? 'staynex_attention_disposable_'+Date.now() : 'staynex_attention_disposable';
const env = Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE)$/i.test(k)));
const info = JSON.parse(execFileSync(docker,[...host,'inspect',container],{env,encoding:'utf8'}))[0];
assert.equal(info.Config.Labels['staynex.disposable'],'message-dashboard-release-20260908');
assert.equal(info.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length,0);
assert.ok(info.Mounts.every(m=>m.Type==='tmpfs'));
fs.writeFileSync(path.join(evidence,'resource.json'),JSON.stringify({id:info.Id,name:container,database,image:info.Image,network:'none',mounts:info.Mounts,endpoint:host[1]},null,2));
fs.writeFileSync(path.join(evidence,'sql-hashes.json'),JSON.stringify(Object.fromEntries(['preflight','create','verify','disable'].map(prefix=>{const file=`supabase/sql/${prefix}_message_attention.sql`;return [file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')];})),null,2));
const runStamp=Date.now();
let sequence=0;
const results=[];
async function sql(text, {allowError=false, label='query'}={}) {
  const seq=++sequence;
  const child=spawn(docker,[...host,'exec','-i',container,'psql','-X','-q','-A','-t','-P','null=__SQL_NULL__','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{env,stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  child.stdin.end("set statement_timeout='20s';\n"+text);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  fs.writeFileSync(path.join(evidence,`${runStamp}-${String(seq).padStart(3,'0')}-${label}.log`),`SQL\n${text}\nEXIT ${code}\n${out}\n${err}`);
  const result={code,out:out.trim(),err,sqlstate:err.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]};
  if(code && !allowError) throw Object.assign(new Error(err),result);
  return result;
}
const file = name=>sql(fs.readFileSync(path.join(root,name),'utf8'),{label:path.basename(name,'.sql')});
const q = x=>x===null?'null':"'"+String(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'";
const identifier=x=>{assert.match(x,/^[a-z_][a-z_0-9]*$/);return '"'+x+'"';};
// Transport adapter only: all reads/writes/RPCs below execute real PostgreSQL.
// No RPC, trigger, version or claim behavior is implemented in this adapter.
const client={
  from(table){let values,kind='select',where=[];const chain={
    select(){return chain;},eq(k,v){where.push(identifier(k)+'='+q(v));return chain;},limit(){return chain;},
    insert(v){values=v;kind='insert';return chain;},update(v){values=v;kind='update';return chain;},
    async single(){return chain.maybeSingle();},async maybeSingle(){
      const keys=Object.keys(values||{});let query;
      if(kind==='select')query=`select * from ${identifier(table)}${where.length?' where '+where.join(' and '):''} limit 1`;
      if(kind==='insert')query=`insert into ${identifier(table)}(${keys.map(identifier)}) values(${keys.map(k=>q(values[k]))}) returning *`;
      if(kind==='update')query=`update ${identifier(table)} set ${keys.map(k=>identifier(k)+'='+q(values[k]))} where ${where.join(' and ')} returning *`;
      const r=await sql(`set role service_role;with result as (${query}) select coalesce((select row_to_json(result) from result limit 1),'null'::json);`,{allowError:true,label:'productive-adapter'});
      return r.code?{data:null,error:{code:r.sqlstate,message:r.err}}:{data:JSON.parse(r.out),error:null};
    }};return chain;
  },
  async rpc(name,args){assert.ok(['staynex_attention_read_v1','staynex_attention_transition_v1','staynex_attention_dashboard_v1'].includes(name));
    const values=Object.entries(args).map(([k,v])=>identifier(k)+'=>'+(k==='p_ids'?`array[${v.map(q)}]::uuid[]`:q(v)));
    const r=await sql(`set role service_role;select ${identifier(name)}(${values});`,{allowError:true,label:'productive-rpc'});
    return r.code?{data:null,error:{code:r.sqlstate,message:r.err}}:{data:JSON.parse(r.out),error:null};
  }
};
const uuid=()=>crypto.randomUUID();
async function json(query){const value=(await sql(query)).out;return value==='__SQL_NULL__'?null:value==='t'?true:value==='f'?false:JSON.parse(value);}
async function expectError(query,code){const r=await sql(query,{allowError:true,label:'expected-error'});assert.notEqual(r.code,0);assert.equal(r.sqlstate,code,r.err);return code;}
async function test(name,fn){try{const detail=await fn();results.push({name,status:'PASS',detail});console.log('PASS '+name+(detail?' '+JSON.stringify(detail):''));}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}finally{fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2));}}
async function setup(){
  await sql("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end$$; create publication supabase_realtime;",{label:'supabase-represented-roles-publication'});
  for(const f of ['supabase/schema.sql','supabase/sql/create_hotels_and_hotel_users.sql','supabase/sql/create_user_roles_and_hotel_assignments.sql','supabase/sql/add_platform_role_to_hotel_users.sql','supabase/sql/add_multilanguage_translation_layer.sql','supabase/sql/create_enterprise_audit_logs.sql','supabase/sql/create_conversation_ai_state.sql','supabase/sql/twilio_inbound_messagesid_dedupe.sql']) await file(f);
  await test('Prepared SQL preflight on repository schema',()=>file('supabase/sql/preflight_message_attention.sql').then(r=>r.out));
}
const H=uuid(),H2=uuid(),C=uuid(),C2=uuid(),G=uuid(),G2=uuid(),U=uuid(),U2=uuid(),SUP=uuid(),BAD=uuid();
async function incoming({id=uuid(),hotel=H,conversation=C,sender='guest',metadata={demo:true},content='Synthetic guest request',created='now()'}={}) {
  await sql(`insert into messages(id,hotel_id,conversation_id,sender_type,content,metadata,created_at) values(${q(id)},${q(hotel)},${q(conversation)},${q(sender)},${q(content)},${q(metadata)},${created});`);return id;
}
const state=id=>json(`select json_build_object('message_id',m.id,'status',e.status,'version',e.version,'changed_at',coalesce(a.changed_at,case when m.attention_inclusion_version=1 then m.created_at end),'changed_by',a.changed_by,'actor_kind',coalesce(a.actor_kind,case when m.attention_inclusion_version=1 then 'inbound' end),'last_operation_id',a.last_operation_id) from messages m left join message_attention a on a.message_id=m.id cross join lateral staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e where m.id=${q(id)};`);
const read=ids=>json(`set role service_role;select staynex_attention_read_v1(${q(H)},${q(C)},array[${ids.map(q)}]::uuid[]);`);
const dashboard=(urgent=false)=>json(`set role service_role;select staynex_attention_dashboard_v1(${q(H)},'simulated',${urgent},null,null);`);
const items=async ids=>(await read(ids)).items.map(x=>({messageId:x.messageId,expectedStatus:x.status,expectedVersion:x.version}));
const transition=(its,target='resolved',op=uuid(),actor=U,hotel=H,conversation=C)=>`select staynex_attention_transition_v1(${q(hotel)},${q(conversation)},${q(actor)},${q(op)},${q(target)},${q(its)}::jsonb);`;
const change=async(ids,target='resolved')=>json('set role service_role;'+transition(await items(ids),target));
async function fixtures(){
  await sql(`insert into hotels(id,name,whatsapp_number,slug,timezone) values(${q(H)},'Attention synthetic A','synthetic-a',${q(H)},'Europe/Madrid'),(${q(H2)},'Attention synthetic B','synthetic-b',${q(H2)},'Europe/Madrid');
insert into guests(id,hotel_id,phone_number,current_room) values(${q(G)},${q(H)},'synthetic-guest-a','103'),(${q(G2)},${q(H2)},'synthetic-guest-b','208');
insert into conversations(id,hotel_id,guest_id) values(${q(C)},${q(H)},${q(G)}),(${q(C2)},${q(H2)},${q(G2)});
insert into hotel_users(hotel_id,user_id,role,status,platform_role) values(${q(H)},${q(U)},'receptionist','active','none'),(${q(H)},${q(U2)},'manager','active','none'),(${q(H)},${q(SUP)},'admin','active','support'),(${q(H)},${q(BAD)},'analyst','active','none');
insert into tickets(hotel_id,guest_id,conversation_id,category,title,description) values(${q(H)},${q(G)},${q(C)},'reception','Synthetic unchanged ticket','Synthetic');`);
}
// Separate psql processes. A holds its transaction after the RPC; B must actually wait on a DB lock.
async function concurrent(a,b,{mustBlock=true}={}){
  const marker='attention_a_'+sequence;
  const started=Date.now();
  const first=sql(`set application_name=${q(marker)};begin;set local role service_role;${a}select pg_sleep(3);commit;`,{allowError:true,label:'session-a'});
  let active=false;
  for(let n=0;n<30;n++) {active=await json(`select exists(select 1 from pg_stat_activity where application_name=${q(marker)} and wait_event='PgSleep');`);if(active)break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(active,true,'session A holds a real transaction');
  const secondMarker='attention_b_'+sequence;
  const second=sql(`set application_name=${q(secondMarker)};set role service_role;${b}`,{allowError:true,label:'session-b'});
  let blocked=false;
  if(mustBlock)for(let n=0;n<20;n++){blocked=await json(`select exists(select 1 from pg_stat_activity where application_name=${q(secondMarker)} and wait_event_type='Lock');`);if(blocked)break;await new Promise(r=>setTimeout(r,50));}
  const [ra,rb]=await Promise.all([first,second]);
  assert.equal(ra.code,0,ra.err);if(mustBlock)assert.equal(blocked,true,'session B waits on PostgreSQL lock');
  return {ra,rb,blocked,elapsed:Date.now()-started};
}
async function run(){
  await fixtures();const history=await incoming();
  await test('Final preflight and migration share critical guards and reject incompatible prerequisites',async()=>{
    const scripts=['preflight','create'].map(f=>fs.readFileSync(path.join(root,`supabase/sql/${f}_message_attention.sql`),'utf8'));
    assert.equal(scripts[0].match(/do \$guard\$[\s\S]*?end \$guard\$;/)[0],scripts[1].match(/do \$guard\$[\s\S]*?end \$guard\$;/)[0]);
    for(const script of scripts)await expectError('set role anon;'+script,'P0001');
    await sql('alter table guests rename column current_room to synthetic_missing_room;');
    for(const script of scripts){const r=await sql(script,{allowError:true,label:'missing-column'});assert.equal(r.sqlstate,'P0001');assert.match(r.err,/Incompatible guests.current_room/);}
    await sql('alter table guests rename column synthetic_missing_room to current_room;');
    await sql('create index message_attention_received_day on messages(id);');
    for(const script of scripts){const r=await sql(script,{allowError:true,label:'index-collision'});assert.equal(r.sqlstate,'P0001');assert.match(r.err,/name collision/);}
    await sql('drop index message_attention_received_day;');
    return {sameGuards:true,unprivileged:'rejected',missingColumn:'rejected',indexCollision:'rejected'};
  });
  await test('Incompatible existing attention object is refused safely',async()=>{
    await sql('create table message_attention(incompatible text);');
    for(const f of ['preflight','create']){const r=await sql(fs.readFileSync(path.join(root,`supabase/sql/${f}_message_attention.sql`),'utf8'),{allowError:true,label:'incompatible-'+f});assert.equal(r.sqlstate,'P0001');assert.match(r.err,/Attention objects already exist/);}
    assert.equal(await json("select count(*) from pg_attribute where attrelid='message_attention'::regclass and attname='incompatible';"),1);
    await sql('drop table message_attention;');
  });
  await test('Preflight corrected, exact migration and verification',async()=>{
    await file('supabase/sql/preflight_message_attention.sql');await file('supabase/sql/create_message_attention.sql');await file('supabase/sql/verify_message_attention.sql');return {postgres:(await sql('select version();')).out};
  });
  await test('Reapplication refuses existing objects without modifying data',async()=>{
    for(const f of ['preflight','create']){const r=await sql(fs.readFileSync(path.join(root,`supabase/sql/${f}_message_attention.sql`),'utf8'),{allowError:true,label:'reapply-'+f});assert.equal(r.sqlstate,'P0001');assert.match(r.err,/Attention objects already exist/);}await file('supabase/sql/verify_message_attention.sql');
  });
  await test('History remains untracked',async()=>{assert.equal((await read([history])).items[0].status,'untracked');assert.equal(await json('select count(*) from message_attention;'),0);});
  await test('Default applies to old-dated imports but never to updates of historical messages',async()=>{
    await sql(`update messages set content='Historical updated, not classified' where id=${q(history)};`);assert.equal(await json(`select attention_inclusion_version from messages where id=${q(history)};`),null);assert.equal((await read([history])).items[0].status,'untracked');
    const imported=await incoming({created:"now()-interval '60 days'"});assert.equal(await json(`select attention_inclusion_version from messages where id=${q(imported)};`),1);assert.equal((await read([imported])).items[0].status,'pending');assert.equal(await json(`select count(*) from message_attention where message_id=${q(imported)};`),0);
  });
  await test('Inclusion without attention writes; effective initial pending and eligible types',async()=>{
    const id=await incoming();assert.equal((await state(id)).status,'pending');assert.equal(await json(`select count(*) from enterprise_audit_logs where entity_id=${q(id)};`),0);
    assert.equal(await json(`select attention_inclusion_version from messages where id=${q(id)};`),1);assert.equal(await json('select count(*) from message_attention;'),0);
    assert.equal(await json("select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where tgrelid='messages'::regclass and (tgname='staynex_message_attention_insert' or p.proname like 'staynex_attention_%');"),0);
    for(const [sender,metadata] of [['staff',{}],['ai',{}],['guest',{system_event:true}],['guest',{preview:true}],['guest',{translation_only:true}]]){const other=await incoming({sender,metadata});assert.equal(await json(`select count(*) from message_attention where message_id=${q(other)};`),0);}
    const attachment=await incoming({content:'',metadata:{attachments:[{type:'image'}],demo:true}});assert.equal((await state(attachment)).status,'pending');
  });
  await test('Resolve reopen actor timestamp version audit and canonical counters',async()=>{
    const id=await incoming({created:"now()-interval '2 days'"});const baseline=(await dashboard()).counters;
    await change([id]);let s=await state(id);assert.equal(s.status,'resolved');assert.equal(s.version,2);assert.equal(s.changed_by,U);assert.equal((await dashboard()).counters.resolved,baseline.resolved+1);
    assert.equal(await json(`select count(*) from enterprise_audit_logs where entity_id=${q(s.last_operation_id)} and actor_user_id=${q(U)} and created_at=${q(s.changed_at)}::timestamptz;`),1);
    await change([id],'pending');assert.equal((await state(id)).version,3);assert.equal((await dashboard()).counters.resolved,baseline.resolved);
    await change([id]);assert.equal((await state(id)).version,4);assert.equal((await dashboard()).counters.resolved,baseline.resolved+1);
  });
  await test('Explicit historical classification preserves NULL marker and persists version one',async()=>{await change([history],'pending');assert.equal((await state(history)).version,1);assert.equal((await state(history)).status,'pending');assert.equal(await json(`select attention_inclusion_version from messages where id=${q(history)};`),null);await change([history]);assert.equal((await state(history)).status,'resolved');});
  await test('No-op pending initial retry works without requiring a transition row',async()=>{const id=await incoming(),op=uuid(),t=transition(await items([id]),'pending',op);await sql('set role service_role;'+t);await sql('set role service_role;'+t);assert.equal(await json(`select count(*) from message_attention where message_id=${q(id)};`),0);assert.equal(await json(`select count(*) from enterprise_audit_logs where entity_id=${q(op)};`),1);await change([id]);await expectError('set role service_role;'+t,'40001');});
  await test('Mixed invalid or cross-hotel batch has zero partial changes',async()=>{
    const id=await incoming(), foreign=await incoming({hotel:H2,conversation:C2});const before=await state(id);
    for(const invalid of [uuid(),foreign])await expectError('set role service_role;'+transition([...(await items([id])),{messageId:invalid,expectedStatus:'pending',expectedVersion:1}]),'42501');
    assert.deepEqual(await state(id),before);
  });
  for(const sameHotel of [false,true])await test('Scope rejection does not wait for locked '+(sameHotel?'other conversation':'other hotel'),async()=>{
    const conversation=sameHotel?uuid():C2;
    if(sameHotel)await sql(`insert into conversations(id,hotel_id,guest_id) values(${q(conversation)},${q(H)},${q(G)});`);
    const foreign=await incoming({hotel:sameHotel?H:H2,conversation}),local=await incoming();
    const before=await state(local),auditBefore=await json('select count(*) from enterprise_audit_logs;');
    const batch=[...(await items([local])),{messageId:foreign,expectedStatus:'pending',expectedVersion:1}];
    const marker='foreign_lock_'+sequence;
    const holder=sql(`set application_name=${q(marker)};begin;select id from messages where id=${q(foreign)} for update;select pg_sleep(5);commit;`,{label:'foreign-lock-holder'});
    let held=false;
    for(let i=0;i<30;i++){held=await json(`select exists(select 1 from pg_stat_activity where application_name=${q(marker)} and wait_event='PgSleep');`);if(held)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(held,true);
    const started=Date.now();
    const rejected=await sql("set statement_timeout='1s';set role service_role;"+transition(batch),{allowError:true,label:'scope-no-wait'});
    const elapsedMs=Date.now()-started;
    const stillHeld=await json(`select exists(select 1 from pg_stat_activity where application_name=${q(marker)} and wait_event='PgSleep');`);
    await holder;
    assert.equal(rejected.sqlstate,'42501',rejected.err);assert.equal(stillHeld,true,'rejection precedes foreign lock release');
    assert.deepEqual(await state(local),before);assert.equal(await json('select count(*) from enterprise_audit_logs;'),auditBefore);
    return {SQLSTATE:rejected.sqlstate,elapsedMs,foreignLockStillHeld:stillHeld,partialChanges:0};
  });
  await test('Canonical composite foreign key rejects invalid message relationships without disabling constraints',async()=>{
    const before=(await dashboard()).counters;
    const invalid=uuid();
    await expectError(`insert into messages(id,hotel_id,conversation_id,sender_type,content) values(${q(invalid)},${q(H)},${q(C2)},'guest','Synthetic invalid relationship');`,'23503');
    const id=await incoming();
    await expectError(`update messages set conversation_id=${q(C2)} where id=${q(id)};`,'23503');
    assert.equal(await json(`select count(*) from messages where id=${q(invalid)};`),0);
    assert.equal(await json(`select conversation_id=${q(C)}::uuid from messages where id=${q(id)};`),true);
    assert.equal((await dashboard()).counters.pending,before.pending+1);
    return {insertSQLSTATE:'23503',updateSQLSTATE:'23503',constraintsDisabled:false};
  });
  await test('Audit failure rolls back operator batch but never inbound',async()=>{
    const a=await incoming(),b=await incoming();const before=await state(a);
    await sql("create function public.attention_test_fail_audit() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUDIT_FAILURE'; end$$; create trigger attention_test_fail_audit before insert on enterprise_audit_logs for each row execute function attention_test_fail_audit();");
    await expectError('set role service_role;'+transition(await items([a,b])),'P0001');assert.deepEqual(await state(a),before);assert.equal((await state(b)).version,1);
    const id=await incoming();assert.equal(await json(`select attention_inclusion_version from messages where id=${q(id)};`),1);assert.equal(await json(`select count(*) from message_attention where message_id=${q(id)};`),0);
    await sql('drop trigger attention_test_fail_audit on enterprise_audit_logs;');return {auditFailure:'P0001',messagePersisted:true,attentionRowCreated:false};
  });
  await test('Attention insertion failure preserves message and prevents a false closure',async()=>{const id=uuid();await sql(`alter table message_attention add constraint attention_test_reject check(message_id<>${q(id)}::uuid);`);await incoming({id});await expectError('set role service_role;'+transition(await items([id])),'23514');assert.equal(await json(`select attention_inclusion_version from messages where id=${q(id)};`),1);assert.equal(await json(`select count(*) from enterprise_audit_logs where entity_id=${q(id)};`),0);assert.equal(await json(`select count(*) from message_attention where message_id=${q(id)};`),0);await sql('alter table message_attention drop constraint attention_test_reject;');await change([id]);assert.equal((await state(id)).version,2);return {SQLSTATE:'23514',messagePersisted:true,resolvedAfterRepair:true};});
  await test('Duplicate insertion/upsert never resets resolved state',async()=>{const id=await incoming();await change([id]);const before=await state(id);await sql(`insert into messages(id,hotel_id,conversation_id,sender_type,content) values(${q(id)},${q(H)},${q(C)},'guest','Synthetic duplicate') on conflict(id) do update set content=excluded.content;`);assert.deepEqual(await state(id),before);});
  await test('Two operators, one transition, controlled stale conflict',async()=>{const id=await incoming();const it=await items([id]);const r=await concurrent(transition(it),transition(it,'resolved',uuid(),U2));assert.equal(r.rb.sqlstate,'40001',r.rb.err);assert.equal((await state(id)).version,2);return {blocked:r.blocked,secondSQLSTATE:r.rb.sqlstate,version:2};});
  await test('Concurrent resolve/reopen does not overwrite a newer version',async()=>{const id=await incoming();const it=await items([id]);const r=await concurrent(transition(it),transition(it,'pending',uuid(),U2));assert.equal(r.rb.sqlstate,'40001');assert.equal((await state(id)).status,'resolved');return {secondSQLSTATE:r.rb.sqlstate};});
  await test('Identical concurrent retry preserves timestamp and one audit; old retry conflicts',async()=>{const id=await incoming();const it=await items([id]),op=uuid(),t=transition(it,'resolved',op);const r=await concurrent(t,t);assert.equal(r.rb.code,0,r.rb.err);const before=await state(id);await sql('set role service_role;'+t);assert.deepEqual(await state(id),before);assert.equal(await json(`select count(*) from enterprise_audit_logs where entity_id=${q(op)};`),1);await change([id],'pending');await expectError('set role service_role;'+t,'40001');await expectError('set role service_role;'+transition(it,'pending',op),'40001');return {retryAuditRows:1,oldRetry:'40001',identityReuse:'40001'};});
  await test('Overlapping inverse-order batches reject entire stale second batch',async()=>{const a=await incoming(),b=await incoming(),c=await incoming();const r=await concurrent(transition(await items([a,b])),transition((await items([b,a,c])).reverse()));assert.equal(r.rb.sqlstate,'40001');assert.equal((await state(c)).status,'pending');assert.equal((await state(a)).version,2);return {secondSQLSTATE:r.rb.sqlstate,unrelatedMessage:'pending'};});
  await test('New inbound during real held closure remains outside explicit batch',async()=>{
    const a=await incoming(),b=uuid();
    // Baseline backend insert grants are represented explicitly; attention grants stay unchanged.
    await sql('grant usage on schema public to service_role; grant select,insert on messages to service_role;');
    const r=await concurrent(transition(await items([a])),`insert into messages(id,hotel_id,conversation_id,sender_type,content) values(${q(b)},${q(H)},${q(C)},'guest','Synthetic concurrent inbound');`,{mustBlock:false});assert.equal(r.rb.code,0,r.rb.err);assert.equal((await state(b)).status,'pending');assert.equal((await state(a)).status,'resolved');return {newMessage:'pending',closedMessage:'resolved'};
  });
  await test('Database RLS ACL security-definer ownership and unauthorized callers',async()=>{
    await file('supabase/sql/verify_message_attention.sql');const id=await incoming(),it=await items([id]);
    for(const role of ['anon','authenticated']){await expectError(`set role ${role};select * from message_attention;`,'42501');await expectError(`set role ${role};`+transition(it),'42501');}
    await expectError('set role service_role;select * from message_attention;','42501');
    for(const actor of [uuid(),SUP,BAD])await expectError('set role service_role;'+transition(it,'resolved',uuid(),actor),'42501');
    await expectError('set role service_role;'+transition(it,'resolved',uuid(),U,H2,C),'42501');
    const definitions=await json("select json_agg(json_build_object('function',proname,'owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'acl',proacl)) from pg_proc where proname like 'staynex_attention_%';");assert.ok(definitions.every(x=>x.owner==='postgres'&&x.config.includes('search_path=pg_catalog')));return definitions;
  });
  await test('Dashboard no-name schema fallback urgent subset pagination and origin separation',async()=>{
    for(let i=0;i<10;i++)await incoming();
    await sql(`insert into conversation_ai_state(hotel_id,conversation_id,escalation_level,updated_at) values(${q(H)},${q(C)},'urgent',clock_timestamp());`);
    const all=await dashboard(),urgent=await dashboard(true);assert.equal(all.counters.urgent,urgent.counters.urgent);assert.ok(urgent.pending.every(x=>x.priority==='urgent'));assert.ok(all.pending.every(x=>x.guest==='Huésped'));assert.equal(all.pending.length,8);assert.ok(all.nextCursor);
    const next=await json(`set role service_role;select staynex_attention_dashboard_v1(${q(H)},'simulated',false,${q(all.nextCursor.at)},${q(all.nextCursor.id)});`);assert.ok(next.pending.every(x=>!all.pending.some(y=>y.id===x.id)));assert.deepEqual(next.counters,all.counters);
    const pagination=[];
    for(const origin of ['simulated','traced','unknown'])for(const urgentOnly of [false,true]){
      let cursor=null,total=null,pages=0;const ids=new Set();
      do {
        const page=await json(`set role service_role;select staynex_attention_dashboard_v1(${q(H)},${q(origin)},${urgentOnly},${q(cursor?.at??null)},${q(cursor?.id??null)});`);
        const count=page.counters[urgentOnly?'urgent':'pending'];if(total===null)total=count;else assert.equal(count,total);
        for(const row of page.pending){assert.ok(!ids.has(row.id),'no duplicate across pages');ids.add(row.id);if(urgentOnly)assert.equal(row.priority,'urgent');}
        cursor=page.nextCursor;pages++;assert.ok(pages<100);
      }while(cursor);
      assert.equal(ids.size,total,'complete paginated set equals canonical total');pagination.push({origin,urgentOnly,pages,total,listed:ids.size});
    }
    const selected=all.pending[0].id;await change([selected]);assert.equal((await dashboard()).counters.urgent,all.counters.urgent-1);await change([selected],'pending');assert.equal((await dashboard()).counters.urgent,all.counters.urgent);
    return {pending:all.counters.pending,urgent:all.counters.urgent,pageSize:all.pending.length,pagination};
  });
  await test('Attention changes leave messages tickets and AI state unchanged',async()=>{const id=await incoming();const before=await json(`select jsonb_build_object('messages',(select jsonb_agg(to_jsonb(m)) from messages m),'tickets',(select jsonb_agg(to_jsonb(t)) from tickets t),'state',(select jsonb_agg(to_jsonb(s)) from conversation_ai_state s),'hotels',(select jsonb_agg(to_jsonb(h)) from hotels h),'conversations',(select jsonb_agg(to_jsonb(c)) from conversations c));`);await change([id]);const after=await json(`select jsonb_build_object('messages',(select jsonb_agg(to_jsonb(m)) from messages m),'tickets',(select jsonb_agg(to_jsonb(t)) from tickets t),'state',(select jsonb_agg(to_jsonb(s)) from conversation_ai_state s),'hotels',(select jsonb_agg(to_jsonb(h)) from hotels h),'conversations',(select jsonb_agg(to_jsonb(c)) from conversations c));`);assert.deepEqual(after,before);});
  await productiveTests();
  await test('Disable preserves all state/audit and blocks RPCs; inbound continues untracked',async()=>{const before=await json("select jsonb_build_object('attention',(select jsonb_agg(to_jsonb(a) order by message_id) from message_attention a),'audit',(select jsonb_agg(to_jsonb(l) order by id) from enterprise_audit_logs l));");await file('supabase/sql/disable_message_attention.sql');const id=await incoming();assert.equal(await json(`select count(*) from message_attention where message_id=${q(id)};`),0);await expectError(`set role service_role;select staynex_attention_dashboard_v1(${q(H)},'simulated',false,null,null);`,'55000');await expectError(`set role service_role;select staynex_attention_read_v1(${q(H)},${q(C)},array[${q(id)}]::uuid[]);`,'55000');await expectError('set role service_role;'+transition([{messageId:id,expectedStatus:'untracked',expectedVersion:0}]),'55000');const after=await json("select jsonb_build_object('attention',(select jsonb_agg(to_jsonb(a) order by message_id) from message_attention a),'audit',(select jsonb_agg(to_jsonb(l) order by id) from enterprise_audit_logs l));");assert.deepEqual(after,before);});
  await test('Reactivation restores contract without reclassifying disabled-period messages',async()=>{
    const ids=await json(`select json_agg(id) from messages where hotel_id=${q(H)} and attention_inclusion_version is null;`);
    const included=await json(`select count(*) from messages where attention_inclusion_version=1;`);
    await sql('alter table messages alter column attention_inclusion_version set default 1;');await file('supabase/sql/verify_message_attention.sql');
    assert.equal(await json(`select count(*) from messages where attention_inclusion_version=1;`),included);
    for(const id of ids)assert.equal(await json(`select attention_inclusion_version from messages where id=${q(id)};`),null);
    const last=ids.find(id=>id!==history);assert.ok(last);assert.equal((await read([last])).items[0].status,'untracked');
    const next=await incoming();assert.equal((await read([next])).items[0].status,'pending');assert.equal(await json(`select attention_inclusion_version from messages where id=${q(next)};`),1);
  });
}
async function productiveTests(){
  // Clear inherited credentials before importing application modules, block dotenv and external sockets.
  for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];
  Object.assign(process.env,{GUEST_MEMORY_ENABLED:'false',SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true'});
  const originalRead=fs.readFileSync;
  fs.readFileSync=function(file,...args){if(/(?:^|[\\/])\.env(?:$|\.)/.test(String(file)))throw Object.assign(new Error('Environment files excluded'),{code:'ENOENT'});return originalRead.call(this,file,...args);};
  const net=require('node:net'),originalConnect=net.Socket.prototype.connect;
  net.Socket.prototype.connect=function(...args){const first=Array.isArray(args[0])?args[0][0]:args[0];const destination=typeof first==='object'?first.host:typeof args[1]==='string'?args[1]:null;if(destination && !['localhost','127.0.0.1','::1'].includes(destination) && !destination.startsWith('\\\\.\\pipe'))throw Error('External network blocked');return originalConnect.apply(this,args);};
  require('node:module').syncBuiltinESMExports();
  const {pathToFileURL}=require('node:url');
  const imp=file=>import(pathToFileURL(path.join(root,file)).href);
  const {createMessage}=await imp('src/services/supabase.service.js');
  const {handleAttentionRequest}=await imp('dashboard/lib/message-attention.js');
  const dedupe=await imp('src/services/twilio-inbound-dedupe.service.js');
  const {createIncomingWhatsAppHandler}=await imp('src/controllers/whatsapp.controller.js');
  await sql('grant select,insert,update on messages,conversations,twilio_inbound_message_claims to service_role;');
  await test('Published canonical createMessage normal translated attachment and legacy fallback writes',async()=>{
    for(const payload of [{content:'Synthetic translated inbound',originalLanguage:'en',translatedLanguage:'es',translatedText:'Texto sintético',metadata:{translation_direction:'guest_to_staff',twilio_message_sid:'SM-synthetic'}},{content:'',metadata:{attachments:[{}]}}]){
      const message=await createMessage({hotelId:H,conversationId:C,senderType:'guest',client,...payload});assert.equal((await state(message.id)).status,'pending');
    }
    await sql('alter table messages rename column translated_text to temporarily_hidden_translated_text;');
    const message=await createMessage({hotelId:H,conversationId:C,senderType:'guest',content:'Synthetic fallback',client});assert.equal((await state(message.id)).status,'pending');
    await sql('alter table messages rename column temporarily_hidden_translated_text to translated_text;');
  });
  await test('Productive API with real SQL rejects absent role support cross-hotel and spoofed actor',async()=>{
    const id=await incoming();const body={conversationId:C,action:'resolved',operationId:uuid(),items:await items([id])};
    const context={user:{id:U},hotel:{id:H},hotelUser:{user_id:U,hotel_id:H,role:'receptionist',status:'active',platform_role:'none'},role:'receptionist',platformRole:'none',supabase:client};
    const request=async(payload=body,ctx=context)=>handleAttentionRequest({request:{json:async()=>payload},getContext:async()=>ctx});
    assert.equal((await request(body,{})).status,401);
    for(const role of ['analyst','housekeeping'])assert.equal((await request(body,{...context,role})).status,403);
    assert.equal((await request(body,{...context,platformRole:'support'})).status,403);
    for(const key of ['actor','hotelId','changedAt'])assert.equal((await request({...body,[key]:uuid()})).status,400);
    const foreign=await incoming({hotel:H2,conversation:C2});assert.equal((await request({...body,items:[...body.items,{messageId:foreign,expectedStatus:'pending',expectedVersion:1}]})).status,403);
    assert.equal((await state(id)).status,'pending');assert.equal((await request()).status,200);assert.equal((await state(id)).changed_by,U);
  });
  const operator=body=>handleAttentionRequest({request:{json:async()=>body},getContext:async()=>({user:{id:U},hotel:{id:H},hotelUser:{user_id:U,hotel_id:H,role:'receptionist',status:'active',platform_role:'none'},role:'receptionist',platformRole:'none',supabase:client})});
  for(const failureTable of ['enterprise_audit_logs','message_attention'])await test('Published inbound survives write failure in '+failureTable,async()=>{
    await sql(`create trigger attention_test_write_failure before insert or update on ${failureTable} for each row execute function attention_test_fail_audit();`);
    let prepareCalls=0,processCalls=0,lastError;
    const sid='SM-synthetic-'+uuid();
    const handler=createIncomingWhatsAppHandler({findHotelByWhatsappNumberFn:async()=>({id:H}),
      claimTwilioInboundMessageFn:args=>dedupe.claimTwilioInboundMessage({...args,client}),
      attachMessageToTwilioInboundClaimFn:args=>dedupe.attachMessageToTwilioInboundClaim({...args,client}),
      completeTwilioInboundClaimFn:args=>dedupe.completeTwilioInboundClaim({...args,client}),
      failTwilioInboundClaimFn:args=>dedupe.failTwilioInboundClaim({...args,client}),
      prepareInboundGuestMessageForProcessingFn:async()=>{prepareCalls++;return {guestMessage:await createMessage({hotelId:H,conversationId:C,senderType:'guest',content:'Synthetic independent inbound '+sid,metadata:{twilio_message_sid:sid},client})};},
      processGuestMessageFn:async({preparedInbound})=>{processCalls++;return {messages:{guest:preparedInbound.guestMessage}};}});
    const req={body:{Body:'Synthetic independent inbound '+sid,From:'whatsapp:synthetic-guest',To:'whatsapp:synthetic-hotel',MessageSid:sid,AccountSid:'AC-synthetic',attention_inclusion_version:null}};
    const res={statusCode:0,type(){return this;},status(n){this.statusCode=n;return this;},send(){return this;},json(){return this;}};
    await handler(req,res,e=>{lastError=e;});assert.equal(lastError,undefined);assert.equal(res.statusCode,200);
    const claim=await json(`select row_to_json(c) from twilio_inbound_message_claims c where message_sid=${q(sid)};`);
    assert.equal(claim.status,'processed');assert.ok(claim.message_id);assert.equal(claim.failure_code,null);
    assert.equal(await json(`select attention_inclusion_version from messages where id=${q(claim.message_id)};`),1,'webhook fields cannot choose inclusion');
    assert.equal(await json(`select count(*) from message_attention where message_id=${q(claim.message_id)};`),0);
    const operation={conversationId:C,action:'resolved',operationId:uuid(),items:await items([claim.message_id])};
    assert.equal((await operator(operation)).status,503);assert.equal((await state(claim.message_id)).status,'pending');
    assert.equal(await json(`select count(*) from enterprise_audit_logs where entity_id=${q(operation.operationId)};`),0);
    assert.equal(await json(`select count(*) from message_attention where message_id=${q(claim.message_id)};`),0);
    await handler(req,res,e=>{throw e;});assert.equal(prepareCalls,1);assert.equal(processCalls,1);
    await sql(`drop trigger attention_test_write_failure on ${failureTable};`);
    assert.equal((await operator(operation)).status,200);assert.equal((await state(claim.message_id)).status,'resolved');
    await handler(req,res,e=>{throw e;});assert.equal(res.statusCode,200);assert.equal(prepareCalls,1);assert.equal(processCalls,1);
    assert.equal(await json(`select count(*) from messages where metadata->>'twilio_message_sid'=${q(sid)};`),1);
    const retry=await dedupe.claimTwilioInboundMessage({hotelId:H,messageSid:sid,accountSid:'AC-synthetic',client});assert.equal(retry.outcome,'duplicate');
    const result={failureTable,claimStatus:claim.status,messageId:claim.message_id,marker:1,resolveDuringFailure:503,resolveAfterRepair:200,retry:retry.outcome,prepareCalls,controlledProcessingCalls:processCalls,realProviderCalls:0};
    fs.writeFileSync(path.join(evidence,'inbound-independent-'+failureTable+'.json'),JSON.stringify(result,null,2));return result;
  });
  await test('Attention read failure never hides stored Inbox message or invents counters',async()=>{
    const id=await incoming();
    await sql('alter table message_attention rename column status to synthetic_unavailable_status;');
    const msg=await client.from('messages').select('*').eq('hotel_id',H).eq('id',id).maybeSingle();assert.equal(msg.error,null);assert.equal(msg.data.id,id);
    assert.equal((await operator({action:'read',conversationId:C,messageIds:[id]})).status,503);
    const {loadAttentionDashboard}=await imp('dashboard/lib/message-attention.js');const unavailable=await loadAttentionDashboard({supabase:client,hotelId:H,origin:'simulated'});
    assert.ok(Object.values(unavailable.counters).every(x=>x.value===null));
    const independent=await createMessage({hotelId:H,conversationId:C,senderType:'guest',content:'Still writable without attention read',client});assert.equal(independent.attention_inclusion_version,1);
    await sql('alter table message_attention rename column synthetic_unavailable_status to status;');assert.equal((await state(independent.id)).status,'pending');
    return {messageAccessible:true,attentionStatus:503,counters:'unavailable',inboundContinues:true};
  });
}
async function main(){if(process.argv[2]==='all'){execFileSync(docker,[...host,'exec',container,'createdb','-U','postgres',database],{env});await setup();return run();}if(process.argv[2]==='setup')return setup();if(process.argv[2]==='run')return run();throw Error('Use all, setup or run');}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
