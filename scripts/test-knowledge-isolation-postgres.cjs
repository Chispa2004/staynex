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
fs.writeFileSync(path.join(evidence,'postgres-resource.json'),JSON.stringify({container,id:inspect.Id,databases:[canonical,legacy],image:inspect.Image,endpoint:host[1],network:'none',tmpfs:true},null,2));

} finally { pg.cleanup(); console.log('Disposable PostgreSQL container removed'); }
