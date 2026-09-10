// Dedicated local PostgreSQL only. No Supabase endpoint, inherited credentials or provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),evidence=path.join(root,'.npm-cache/ci/postgres');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME)$/i.test(k)));
const pg=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env});
const {docker,host,container,inspect}=pg;
try {
fs.mkdirSync(evidence,{recursive:true});const results=[];let seq=0;
const sql=(db,query,expectedError)=>{
  let output='',code=0;try{output=execFileSync(docker,[...host,'exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{input:query,env,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});}
  catch(e){output=String(e.stdout||'')+String(e.stderr||'');code=e.status??1;}
  fs.writeFileSync(path.join(evidence,'pg-'+String(++seq).padStart(3,'0')+'.log'),query+'\nEXIT '+code+'\n'+output);
  if(expectedError){assert.notEqual(code,0);assert.match(output,new RegExp(expectedError));}else assert.equal(code,0,output);
  return output.trim();
};
const file=(db,name)=>sql(db,fs.readFileSync(path.join(root,'supabase/sql/'+name),'utf8'));
const check=(name,fn)=>{fn();results.push({name,status:'PASS'});fs.writeFileSync(path.join(evidence,'postgres-results.json'),JSON.stringify(results,null,2));console.log('PASS '+name);};
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const canonical='knowledge_canonical_'+Date.now(),legacy='knowledge_legacy_'+Date.now();
for(const db of [canonical,legacy])execFileSync(docker,[...host,'exec',container,'createdb','-U','postgres',db],{env});
sql(canonical,'create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create publication supabase_realtime;');
sql(canonical,fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8'));
check('Repository schema has NOT NULL hotel_id but no knowledge RLS',()=>assert.equal(sql(canonical,"select attnotnull||','||relrowsecurity from pg_attribute join pg_class on oid=attrelid where attrelid='hotel_knowledge'::regclass and attname='hotel_id';"),'true,false'));
sql(canonical,`insert into hotels(id,name,whatsapp_number) values('${A}','Synthetic A','synthetic-a'),('${B}','Synthetic B','synthetic-b');
insert into hotel_knowledge(id,hotel_id,key,value) values('${A}','${A}','wifi','A only'),('${B}','${B}','wifi','B only');
grant usage on schema public to anon,authenticated,service_role;
-- Represent permissive API table grants explicitly; this is NOT evidence of deployed grants.
grant select,insert,update,delete on hotel_knowledge to anon,authenticated,service_role;`);
check('Prepared preflight and protection execute; scoped backend CRUD preserved',()=>{
  file(canonical,'preflight_hotel_knowledge_isolation.sql');file(canonical,'protect_hotel_knowledge_backend_only.sql');
  assert.equal(sql(canonical,`set role service_role;select value from hotel_knowledge where hotel_id='${A}';`),'A only');
  assert.equal(sql(canonical,`set role service_role;with changed as(update hotel_knowledge set value='BAD' where id='${B}' and hotel_id='${A}' returning id)select count(*) from changed;`),'0');
  assert.equal(sql(canonical,`set role service_role;with deleted as(delete from hotel_knowledge where id='${B}' and hotel_id='${A}' returning id)select count(*) from deleted;`),'0');
  sql(canonical,`set role service_role;insert into hotel_knowledge(hotel_id,key,value)values('${A}','own','own');update hotel_knowledge set value='updated' where hotel_id='${A}' and key='own';delete from hotel_knowledge where hotel_id='${A}' and key='own';`);
  assert.equal(sql(canonical,`select value from hotel_knowledge where hotel_id='${B}';`),'B only');
});
for(const role of ['anon','authenticated'])check(role+' direct SELECT/INSERT/UPDATE/DELETE denied',()=>{
  for(const query of ['select * from hotel_knowledge',`insert into hotel_knowledge(hotel_id,key,value)values('${A}','x','x')`,"update hotel_knowledge set value='BAD'","delete from hotel_knowledge"])
    sql(canonical,`set role ${role};${query};`,'42501');
});
check('RLS still isolates browser if a table grant is later mistakenly restored',()=>{
  sql(canonical,'grant select,insert,update,delete on hotel_knowledge to authenticated;');
  assert.equal(sql(canonical,'set role authenticated;select count(*) from hotel_knowledge;'),'0');
  sql(canonical,`set role authenticated;insert into hotel_knowledge(hotel_id,key,value)values('${A}','x','x');`,'42501');
  assert.equal(sql(canonical,"set role authenticated;with x as(update hotel_knowledge set value='BAD' returning id) select count(*) from x;"),'0');
  assert.equal(sql(canonical,'set role authenticated;with x as(delete from hotel_knowledge returning id)select count(*) from x;'),'0');
  sql(canonical,'revoke all on hotel_knowledge from authenticated;');
});
check('service_role bypasses RLS: application filters remain essential',()=>assert.equal(sql(canonical,'set role service_role;select count(*) from hotel_knowledge;'),'2'));
check('Preflight reports existing policies; protection refuses to overwrite them',()=>{
  sql(canonical,'create policy synthetic_policy on hotel_knowledge for select to authenticated using(true);');
  assert.match(file(canonical,'preflight_hotel_knowledge_isolation.sql'),/synthetic_policy/);
  sql(canonical,fs.readFileSync(path.join(root,'supabase/sql/protect_hotel_knowledge_backend_only.sql'),'utf8'),'Existing knowledge policies');
  sql(canonical,'drop policy synthetic_policy on hotel_knowledge;');
});
check('Inherited table privileges detected after REVOKE; transaction restores prior RLS/grants',()=>{
  sql(canonical,'alter table hotel_knowledge disable row level security;create role synthetic_reader nologin;grant synthetic_reader to authenticated;grant select on hotel_knowledge to synthetic_reader;grant insert on hotel_knowledge to anon;');
  sql(canonical,fs.readFileSync(path.join(root,'supabase/sql/protect_hotel_knowledge_backend_only.sql'),'utf8'),'Effective browser privileges remain');
  assert.equal(sql(canonical,"select relrowsecurity from pg_class where oid='hotel_knowledge'::regclass;"),'f');
  assert.equal(sql(canonical,"select has_table_privilege('anon','hotel_knowledge','INSERT');"),'t');
  sql(canonical,'revoke select on hotel_knowledge from synthetic_reader;revoke synthetic_reader from authenticated;drop role synthetic_reader;revoke insert on hotel_knowledge from anon;');
  file(canonical,'protect_hotel_knowledge_backend_only.sql');
});
check('Preflight reports column grants while protection refuses them unchanged',()=>{
  sql(canonical,'grant select(value) on hotel_knowledge to authenticated;');
  assert.match(file(canonical,'preflight_hotel_knowledge_isolation.sql'),/authenticated\|value\|SELECT\|t/);
  sql(canonical,fs.readFileSync(path.join(root,'supabase/sql/protect_hotel_knowledge_backend_only.sql'),'utf8'),'Existing browser column grants');
  assert.equal(sql(canonical,"select has_column_privilege('authenticated','hotel_knowledge','value','SELECT');"),'t');
  sql(canonical,'revoke select(value) on hotel_knowledge from authenticated;');
});
check('Preflight transaction is READ ONLY and refuses RLS-filtered ownership counts',()=>{
  const preflight=fs.readFileSync(path.join(root,'supabase/sql/preflight_hotel_knowledge_isolation.sql'),'utf8');
  assert.match(file(canonical,'preflight_hotel_knowledge_isolation.sql'),/\|on/);
  sql(canonical,preflight.replace('rollback;','create table forbidden_preflight_write(id int); rollback;'),'25006');
  assert.equal(sql(canonical,"select to_regclass('forbidden_preflight_write') is null;"),'t');
  sql(canonical,'set role authenticated;'+preflight,'Counts unavailable: inspector needs full row visibility');
});
check('Legacy nullable installation preserves ownerless row even with demo hotel present',()=>{
  sql(legacy,`create table hotels(id uuid primary key,slug text,created_at timestamptz default now());create table hotel_knowledge(id uuid primary key default gen_random_uuid(),key text,value text);create table ai_logs(id uuid primary key);
    insert into hotels(id,slug)values('${A}','staynex-demo');insert into hotel_knowledge(key,value)values('unclassified','Synthetic unowned');`);
  file(legacy,'add_hotel_id_to_knowledge.sql');
  assert.equal(sql(legacy,'select count(*) from hotel_knowledge where hotel_id is null;'),'1');
  file(legacy,'preflight_hotel_knowledge_isolation.sql');file(legacy,'protect_hotel_knowledge_backend_only.sql');
  assert.equal(sql(legacy,"select attnotnull from pg_attribute where attrelid='hotel_knowledge'::regclass and attname='hotel_id';"),'f');
  assert.equal(sql(legacy,'select count(*) from hotel_knowledge where hotel_id is null;'),'1');
});
check('Knowledge catches inherited MAINTAIN and NOINHERIT SET ROLE column access',()=>{
  const protection=fs.readFileSync(path.join(root,'supabase/sql/protect_hotel_knowledge_backend_only.sql'),'utf8');
  sql(canonical,'create role synthetic_maintenance nologin;grant synthetic_maintenance to authenticated;grant maintain on hotel_knowledge to synthetic_maintenance;');
  sql(canonical,protection,'Effective browser privileges remain');
  sql(canonical,'revoke maintain on hotel_knowledge from synthetic_maintenance;grant synthetic_maintenance to authenticated with inherit false;grant select(value) on hotel_knowledge to synthetic_maintenance;');
  sql(canonical,protection,'Effective browser privileges remain through SET ROLE');
  sql(canonical,'revoke select(value) on hotel_knowledge from synthetic_maintenance;revoke synthetic_maintenance from authenticated;drop role synthetic_maintenance;');
});

// Auth boundary only is synthetic. Tenant helper functions and messages policy
// below are loaded from the actual repository SQL, never replaced with USING(true).
sql(canonical,`create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table hotel_users(user_id uuid,hotel_id uuid,email text,status text,platform_role text,multi_property_access boolean);
grant usage on schema auth to authenticated;
insert into hotel_users values('${A}','${A}',null,'active','none',false),('${B}','${B}',null,'active','none',false);
insert into guests(id,hotel_id,phone_number) values('${A}','${A}','synthetic-a'),('${B}','${B}','synthetic-b');
insert into conversations(id,hotel_id,guest_id) values('${A}','${A}','${A}'),('${B}','${B}','${B}');
alter table messages add column metadata jsonb not null default '{}'::jsonb,
  add column original_language text,add column translated_language text,add column translated_text text,
  add column translation_provider text,add column translation_confidence numeric;
insert into messages(id,hotel_id,conversation_id,sender_type,content) values('${A}','${A}','${A}','staff','Synthetic historical A'),('${B}','${B}','${B}','guest','Synthetic B');`);
const phase1=fs.readFileSync(path.join(root,'supabase/sql/rls_phase_1_safe_tenant_protection.sql'),'utf8');
const phase2=fs.readFileSync(path.join(root,'supabase/sql/rls_phase_2_write_protection.sql'),'utf8');
for(const name of ['staynex_rls_auth_email','staynex_is_platform_operator','staynex_can_read_hotel']){
  const definition=new RegExp('create or replace function public\\.'+name+'\\([\\s\\S]*?\\$\\$;');
  assert.equal(phase1.match(definition)?.[0],phase2.match(definition)?.[0],`${name} must match both repository versions`);
  assert.ok(phase1.match(definition),`Missing real tenant helper ${name}`);
}
file(canonical,'rls_phase_1_safe_tenant_protection.sql');
file(canonical,'add_messages_tenant_isolation_p0_1_stage_b_contract.sql');
const messageSQL=fs.readFileSync(path.join(root,'supabase/sql/restrict_messages_api_privileges.sql'),'utf8');
const identity=()=>sql(canonical,`select json_build_object('rls',relrowsecurity,'force',relforcerowsecurity,'replica',relreplident,
  'policies',(select json_agg(row(policyname,roles,cmd,qual,with_check)) from pg_policies where schemaname='public' and tablename='messages'),
  'publication',(select json_agg(row(pubname,attnames,rowfilter)) from pg_publication_tables where schemaname='public' and tablename='messages'),
  'constraints',(select json_agg(row(conname,convalidated,pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid='messages'::regclass))
  from pg_class where oid='messages'::regclass;`);
check('Messages removes table/column administrative writes and preserves policy/Realtime contract',()=>{
  sql(canonical,'grant all on messages to public,anon,authenticated,service_role;grant update(content),references(id) on messages to authenticated;grant select(content) on messages to anon;');
  const before=identity();sql(canonical,messageSQL);assert.equal(identity(),before);
  assert.equal(sql(canonical,"select has_table_privilege('authenticated','messages','SELECT')||','||has_any_column_privilege('authenticated','messages','INSERT,UPDATE,REFERENCES')||','||has_table_privilege('service_role','messages','MAINTAIN,TRIGGER,TRUNCATE,REFERENCES');"),'true,false,false');
  sql(canonical,messageSQL);assert.equal(identity(),before); // Safe repeat.
});
check('Real tenant read policy: A sees A, B sees B, unassigned sees none; browser writes denied',()=>{
  for(const id of [A,B]) assert.equal(sql(canonical,`set role authenticated;set request.jwt.claim.sub='${id}';select string_agg(hotel_id::text,',') from messages;`),id);
  assert.equal(sql(canonical,"set role authenticated;set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';select count(*) from messages;"),'0');
  for(const role of ['anon','authenticated']){
    for(const query of ["update messages set content='BAD'","delete from messages","truncate messages",`insert into messages(hotel_id,conversation_id,sender_type,content)values('${A}','${A}','staff','BAD')`]) sql(canonical,`set role ${role};${query};`,'42501');
  }
  sql(canonical,'set role anon;select * from messages;','42501');
  sql(canonical,`update hotel_users set status='inactive' where user_id='${A}';`);
  assert.equal(sql(canonical,`set role authenticated;set request.jwt.claim.sub='${A}';select count(*) from messages;`),'0');
  sql(canonical,`update hotel_users set status='active',platform_role='support' where user_id='${A}';`);
  assert.equal(sql(canonical,`set role authenticated;set request.jwt.claim.sub='${A}';select count(*) from messages;`),'2');
  sql(canonical,`update hotel_users set platform_role='none' where user_id='${A}';`);
});
check('Manual attempt UUID and JSONB persist; legitimate server CRUD and tenant FK preserved',()=>{
  const {manualDelivery,normalizeManualDelivery}=require('../shared/manual-send/contract.js');
  const attempt='44444444-4444-4444-8444-444444444444';
  const initial=manualDelivery('unknown','dispatch_unconfirmed',false,{attempt_id:attempt});
  const insert=`insert into messages(id,hotel_id,conversation_id,sender_type,content,metadata)values('${attempt}','${A}','${A}','staff','Synthetic reply','${JSON.stringify({manual_send:initial})}');`;
  sql(canonical,'set role service_role;'+insert);
  sql(canonical,'set role service_role;'+insert,'23505');
  assert.equal(sql(canonical,`set role service_role;with x as(update messages set content='BAD' where id='${attempt}' and hotel_id='${B}' returning id)select count(*) from x;`),'0');
  sql(canonical,`set role service_role;update messages set metadata=jsonb_set(metadata,'{manual_send,status}','"accepted"') where id='${attempt}' and hotel_id='${A}' and conversation_id='${A}';`);
  // New psql session simulates reopening: use the exact extended Inbox projection.
  assert.equal(sql(canonical,`set role service_role;select metadata->'manual_send'->>'status' from
    (select id,conversation_id,hotel_id,sender_type,content,created_at,original_language,translated_language,translated_text,translation_provider,translation_confidence,metadata
    from messages where hotel_id='${A}' and conversation_id in ('${A}')) m where id='${attempt}';`),'accepted');
  for(const [status,reason,retryable] of [['accepted','provider_accepted',false],['failed','provider_busy',true],['unknown','provider_unknown',false]]){
    const delivery=manualDelivery(status,reason,retryable,{attempt_id:attempt});
    sql(canonical,`set role service_role;update messages set metadata='${JSON.stringify({manual_send:delivery})}' where id='${attempt}' and hotel_id='${A}';`);
    const recovered=JSON.parse(sql(canonical,`set role service_role;select metadata->'manual_send' from messages where id='${attempt}' and hotel_id='${A}';`));
    assert.deepEqual(normalizeManualDelivery(recovered),delivery);
  }
  assert.equal(sql(canonical,`set role authenticated;set request.jwt.claim.sub='${A}';select content from messages where id='${A}';`),'Synthetic historical A');
  sql(canonical,`set role service_role;insert into messages(hotel_id,conversation_id,sender_type,content)values('${B}','${A}','staff','BAD');`,'23503');
  sql(canonical,`set role service_role;delete from messages where id='${attempt}' and hotel_id='${A}';`);
});
check('Messages rejects inherited MAINTAIN, column writes, and NOINHERIT SET ROLE; atomic rollback',()=>{
  sql(canonical,'create role synthetic_message_writer nologin;grant synthetic_message_writer to authenticated;');
  for(const [grant,revoke] of [['maintain','maintain'],['update(content)','update(content)']]){
    sql(canonical,`grant ${grant} on messages to synthetic_message_writer;grant truncate on messages to anon;`);
    sql(canonical,messageSQL,'Unexpected effective messages privileges');
    assert.equal(sql(canonical,"select has_table_privilege('anon','messages','TRUNCATE');"),'t');
    sql(canonical,`revoke ${revoke} on messages from synthetic_message_writer;revoke truncate on messages from anon;`);
  }
  sql(canonical,'grant synthetic_message_writer to authenticated with inherit false;grant update(content) on messages to synthetic_message_writer;');
  sql(canonical,messageSQL,'Unexpected effective messages privileges');
  sql(canonical,'revoke update(content) on messages from synthetic_message_writer;revoke synthetic_message_writer from authenticated;drop role synthetic_message_writer;');
  sql(canonical,'create policy synthetic_bad_read on messages for select to authenticated using(true);');
  sql(canonical,messageSQL,'Expected reviewed messages tenant SELECT policy');
  sql(canonical,'drop policy synthetic_bad_read on messages;');
});
check('Combined metadata preflight runs READ ONLY and knowledge constraints stay validated',()=>{
  const preflight=fs.readFileSync(path.join(root,'supabase/sql/preflight_inbox_storage_privileges.sql'),'utf8');
  assert.match(sql(canonical,preflight),/\|on/);
  sql(canonical,preflight.replace('rollback;','create table forbidden_inbox_write(id int);rollback;'),'25006');
  assert.equal(sql(canonical,"select attnotnull from pg_attribute where attrelid='hotel_knowledge'::regclass and attname='hotel_id';"),'t');
  assert.equal(sql(canonical,"select bool_and(convalidated) from pg_constraint where conrelid='hotel_knowledge'::regclass and contype='f';"),'t');
});
fs.writeFileSync(path.join(evidence,'postgres-resource.json'),JSON.stringify({container,id:inspect.Id,databases:[canonical,legacy],image:inspect.Image,endpoint:host[1],network:'none',tmpfs:true},null,2));

} finally { pg.cleanup(); console.log('Disposable PostgreSQL container removed'); }
