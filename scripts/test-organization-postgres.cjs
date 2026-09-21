const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync, spawn } = require('node:child_process');
const { createDisposablePostgres } = require('./ci/disposable-postgres.cjs');
assert.equal(process.env.SEND_AUTOMATIONS, 'false');
assert.ok(process.env.NODE_OPTIONS?.includes('isolate.cjs'), 'Use ci:postgres isolation');
const pg = createDisposablePostgres({ env: process.env });
const sql = input => execFileSync(pg.docker, [...pg.host, 'exec', '-i', pg.container,
  'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 30000 }).trim();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q = v => `'${String(typeof v === 'object' ? JSON.stringify(v) : v).replaceAll("'", "''")}'`;
const A=id(1), B=id(2), I=id(3), HA=id(11), HA2=id(12), HB=id(21), HI=id(31), NEW=id(13), LEGACY=id(41);
const INTERNAL=id(101), ADMIN=id(102), MIXED=id(103), RECEPTION=id(104), SOLO=id(105), SUPPORT=id(106);
let tests = 0;
const check = (name, fn) => { fn(); tests++; console.log(`PASS organization PostgreSQL: ${name}`); };
const auth = (user, query) => sql(`set role authenticated; set request.jwt.claim.sub=${q(user)}; ${query}`);
const can = (u,h) => auth(u, `select public.staynex_can_read_hotel(${q(h)});`);
const manage = (action,payload, actor=INTERNAL) => sql(`set role service_role; select public.staynex_manage_organization(${q(actor)},${q(action)},${q(payload)});`);
const membership = (org,u,role='member',status='active') => manage('member',{organization_id:org,user_id:u,email:`u${u.slice(-3)}@synthetic.invalid`,role,status});
(async () => {
try {
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now());
    create table hotels(id uuid primary key default gen_random_uuid(),name text,slug text,city text,country_code text,timezone text,metadata jsonb default '{}',brand_name text,workspace_slug text,timezone_integrity_status text,default_language text,support_email text,brand_color text,subscription_plan text,ai_auto_reply_enabled boolean default false,hotel_live_mode boolean default false,whatsapp_number text);
    create table hotel_users(id uuid primary key default gen_random_uuid(),hotel_id uuid references hotels(id),user_id uuid,email text,
      role text default 'receptionist',status text default 'active',platform_role text default 'none',multi_property_access boolean default false,
      is_default boolean default false,invited_at timestamptz,accepted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create unique index hotel_users_user_id_hotel_id on hotel_users(user_id,hotel_id) where user_id is not null;
    create unique index hotel_users_user_id_hotel_id_unique on hotel_users(user_id,hotel_id) where user_id is not null;
    create unique index hotel_users_hotel_id_email_unique on hotel_users(hotel_id,email) where email is not null;
    create table hotel_onboarding_state(hotel_id uuid primary key references hotels(id),current_step text,completed_steps jsonb,onboarding_completed boolean);
    create table platform_audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid,action text,hotel_id uuid,target_user_id uuid,metadata jsonb);
    create table conversations(id uuid primary key default gen_random_uuid(),hotel_id uuid references hotels(id),status text);
    create table tickets(id uuid primary key default gen_random_uuid(),hotel_id uuid references hotels(id),status text,priority text);
    grant all on all tables in schema public to service_role;
    grant select,insert,update,delete on hotel_users to authenticated;
    create policy old_identity_policy on hotel_users for all to authenticated using(true) with check(true);
    insert into hotels(id,name) values ${[HA,HA2,HB,HI,NEW,LEGACY].map((h,n)=>`(${q(h)},'Synthetic hotel ${n}')`).join(',')};
    insert into auth.users(id,email) values ${[INTERNAL,ADMIN,MIXED,RECEPTION,SOLO,SUPPORT].map(u=>`(${q(u)},'u${u.slice(-3)}@synthetic.invalid')`).join(',')};
    insert into hotel_users(hotel_id,user_id,email,role,platform_role) values
      (${q(LEGACY)},${q(INTERNAL)},'u101@synthetic.invalid','owner','platform_admin'),
      (${q(LEGACY)},${q(SUPPORT)},'u106@synthetic.invalid','receptionist','support'),
      (${q(HA)},${q(MIXED)},'u103@synthetic.invalid','manager','none'),
      (${q(HB)},${q(MIXED)},'u103@synthetic.invalid','receptionist','none'),
      (${q(HA)},${q(RECEPTION)},'u104@synthetic.invalid','receptionist','none'),
      (${q(HI)},${q(SOLO)},'u105@synthetic.invalid','admin','none'),
      (${q(HA)},${q(ADMIN)},'u102@synthetic.invalid','receptionist','none');
    insert into conversations(hotel_id,status) values (${q(HA)},'open'),(${q(HB)},'open'),(${q(HI)},'open');
    insert into tickets(hotel_id,status,priority) values (${q(HA)},'open','urgent'),(${q(HB)},'open','normal');`);
  sql(readFileSync('supabase/sql/rls_phase_2_write_protection.sql','utf8'));
  sql(readFileSync('supabase/sql/preflight_organizations.sql','utf8'));
  sql(`insert into hotel_users(hotel_id,email,status,role) values(${q(LEGACY)},'legacy-pending@synthetic.invalid','invited','admin'),(${q(LEGACY)},'legacy-disabled@synthetic.invalid','disabled','receptionist');`);
  const original = sql(`select jsonb_agg(jsonb_build_object('id',id,'role',role,'status',status,'email',email,'user',user_id) order by id) from hotel_users;`);
  check('unbound active legacy identities stop migration without partial schema', () => {
    sql(`insert into hotel_users(hotel_id,email) values(${q(LEGACY)},'unbound@synthetic.invalid');`);
    assert.throws(()=>sql(readFileSync('supabase/sql/add_organizations.sql','utf8')),/Bind active legacy/);
    assert.equal(sql("select to_regclass('public.organizations') is null;"),'t');
    sql("delete from hotel_users where email='unbound@synthetic.invalid';");
  });
  sql(readFileSync('supabase/sql/add_organizations.sql','utf8'));
  check('schema repeatable and old UUID/roles unchanged', () => {
    sql(readFileSync('supabase/sql/add_organizations.sql','utf8'));
    assert.equal(sql(`select jsonb_agg(jsonb_build_object('id',id,'role',role,'status',status,'email',email,'user',user_id) order by id) from hotel_users;`),original);
  });
  check('atomic hotel creation requires Staynex and an active organization', () => {
    const create=(org,payload,actor=INTERNAL)=>sql(`set role service_role; select staynex_create_organization_hotel(${q(actor)},${q(org)},${q(payload)});`);
    const org=JSON.parse(manage('create',{name:'Onboarding synthetic',kind:'chain'})).id;
    const payload={name:'Created from contract',slug:'created-synthetic',country_code:'ES',city:'Madrid',timezone:'Europe/Madrid',timezone_integrity_status:'verified',admin_email:'u104@synthetic.invalid',ai_auto_reply_enabled:true,hotel_live_mode:true,whatsapp_number:'do-not-use',metadata:{live_approved:true}};
    assert.throws(()=>create(org,payload,RECEPTION),/Staynex administrator required/);
    assert.throws(()=>auth(INTERNAL,`select staynex_create_organization_hotel(${q(INTERNAL)},${q(org)},${q(payload)});`),/permission denied/);
    membership(org,ADMIN,'org_admin');
    const result=JSON.parse(create(org,payload));
    assert.equal(result.hotel.organization_id,org);assert.equal(result.hotel.ai_auto_reply_enabled,false);assert.equal(result.hotel.hotel_live_mode,false);
    assert.equal(result.hotel.whatsapp_number,null);assert.deepEqual(result.hotel.metadata,{});assert.equal(result.hotelUser.user_id,RECEPTION);
    assert.equal(can(ADMIN,result.hotel.id),'t'); assert.equal(can(RECEPTION,result.hotel.id),'t');
    assert.equal(sql(`select count(*) from hotel_onboarding_state where hotel_id=${q(result.hotel.id)};`),'1');
    manage('status',{organization_id:org,status:'disabled'});
    assert.throws(()=>create(org,payload),/Active organization required/);
  });
  check('independent creation rollback preserves every previously created access', () => {
    const org=JSON.parse(manage('create',{name:'Solo onboarding synthetic',kind:'independent'})).id;
    const create=()=>sql(`set role service_role; select staynex_create_organization_hotel(${q(INTERNAL)},${q(org)},${q({name:'Solo new',slug:'solo-new',timezone:'Europe/Madrid',admin_email:'pending@synthetic.invalid'})});`);
    const first=JSON.parse(create()); assert.equal(first.hotelUser.status,'invited');assert.equal(first.hotelUser.user_id,null);
    const before=sql('select count(*) from hotels;'); assert.throws(create,/independent organization has one hotel/);
    assert.equal(sql('select count(*) from hotels;'),before);
    assert.equal(sql(`select count(*) from hotel_users where hotel_id=${q(first.hotel.id)};`),'1');
  });
  sql(`delete from hotel_onboarding_state; delete from hotel_users where hotel_id not in (${[HA,HA2,HB,HI,NEW,LEGACY].map(q).join(',')});
    delete from hotels where id not in (${[HA,HA2,HB,HI,NEW,LEGACY].map(q).join(',')});delete from organization_users;delete from organizations;`);
  check('unincorporated compatibility is confined to assigned hotel', () => {
    assert.equal(can(RECEPTION,HA),'t'); assert.equal(can(RECEPTION,HB),'f');
  });
  sql(`insert into organizations(id,name,kind) values (${q(A)},'Synthetic chain A','chain'),(${q(B)},'Synthetic chain B','chain'),(${q(I)},'Synthetic independent','independent');`);
  check('legacy hotel write policies cannot assign organization scope directly', () => {
    sql('grant select,update on hotels to authenticated; create policy old_hotel_write on hotels for all to authenticated using(true) with check(true);');
    assert.throws(()=>auth(INTERNAL, `update hotels set organization_id=${q(A)} where id=${q(LEGACY)};`), /requires the Staynex management contract/);
    assert.equal(sql(`select organization_id is null from hotels where id=${q(LEGACY)};`),'t');
    assert.equal(auth(INTERNAL, `update hotels set city='Synthetic city' where id=${q(LEGACY)} returning city;`),'Synthetic city');
  });
  for (const [hotel,org] of [[HA,A],[HA2,A],[HB,B],[HI,I]]) manage('incorporate',{organization_id:org,hotel_id:hotel});
  check('incorporation preserves ordinary access without promotion', () => {
    assert.equal(can(MIXED,HA),'t'); assert.equal(can(MIXED,HB),'t'); assert.equal(can(SOLO,HI),'t');
    assert.equal(sql(`select count(*) from organization_users where role='org_admin';`),'0');
    assert.equal(sql(`select role from hotel_users where user_id=${q(MIXED)} and hotel_id=${q(HA)};`),'manager');
  });
  membership(A,ADMIN,'org_admin');
  check('chain admin gets explicit admin grants, retaining independent row', () => {
    assert.equal(sql(`select count(*) from hotel_users where user_id=${q(ADMIN)} and organization_user_id is not null and status='active' and role='admin';`),'2');
    assert.equal(sql(`select role from hotel_users where user_id=${q(ADMIN)} and organization_user_id is null;`),'receptionist');
    assert.equal(can(ADMIN,HA2),'t'); assert.equal(can(ADMIN,HB),'f'); assert.equal(can(ADMIN,HI),'f');
  });
  check('new hotel and repeated incorporation/reconciliation are idempotent', () => {
    manage('incorporate',{organization_id:A,hotel_id:NEW}); manage('incorporate',{organization_id:A,hotel_id:NEW});
    membership(A,ADMIN,'org_admin'); manage('reconcile',{organization_id:A});
    assert.equal(sql(`select count(*) from hotel_users where user_id=${q(ADMIN)} and organization_user_id is not null;`),'3');
    assert.equal(can(ADMIN,NEW),'t');
  });
  const concurrent = input => new Promise((resolve,reject) => {
    const child=spawn(pg.docker,[...pg.host,'exec','-i',pg.container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
    let error=''; child.stdout.resume(); child.stderr.on('data',d=>{error+=d;}); child.on('error',reject);
    child.on('close',code=>code===0?resolve():reject(new Error(error))); child.stdin.end(input);
  });
  await Promise.all([1,2].map(()=>concurrent(`set role service_role; select staynex_manage_organization(${q(INTERNAL)},'reconcile',${q({organization_id:A})});`)));
  check('independent concurrent reconciliations keep one grant per membership/hotel',()=>{
    assert.equal(sql(`select count(*) from hotel_users where user_id=${q(ADMIN)} and organization_user_id is not null;`),'3');
  });
  check('scope guard also constrains legacy permissive read policies',()=>{
    sql('create policy legacy_public_read on conversations for select to authenticated using(true);');
    assert.equal(auth(ADMIN,`select count(*) from conversations where hotel_id=${q(HB)};`),'0');
    assert.equal(auth(ADMIN,`select count(*) from hotel_users where hotel_id=${q(HB)};`),'0');
  });
  check('roles never spill between hotels', () => {
    assert.equal(auth(MIXED,`select staynex_can_write_hotel(${q(HA)},array['admin','manager']);`),'t');
    assert.equal(auth(MIXED,`select staynex_can_write_hotel(${q(HB)},array['admin','manager']);`),'f');
    assert.equal(auth(RECEPTION,`select staynex_can_write_hotel(${q(HA)},array['admin']);`),'f');
  });
  check('direct RLS reads and nested foreign IDs are isolated', () => {
    assert.equal(auth(ADMIN,'select count(*) from conversations;'),'1');
    const foreign = sql(`select id from conversations where hotel_id=${q(HB)};`);
    assert.equal(auth(ADMIN,`select count(*) from conversations where id=${q(foreign)};`),'0');
    assert.equal(auth(ADMIN,`with x as (update conversations set status='closed' where id=${q(foreign)} returning *) select count(*) from x;`),'0');
    assert.throws(()=>auth(ADMIN,`insert into tickets(hotel_id,status) values(${q(HB)},'open');`),/row-level security/);
  });
  check('direct identity escalation and private RPC blocked', () => {
    assert.equal(auth(ADMIN,`with x as(update hotel_users set platform_role='platform_admin' returning *) select count(*) from x;`),'0');
    assert.throws(()=>auth(ADMIN,`insert into hotel_users(hotel_id,user_id,role) values(${q(HB)},${q(ADMIN)},'admin');`),/row-level security/);
    assert.throws(()=>auth(ADMIN,`select staynex_manage_organization(${q(INTERNAL)},'create','{"name":"attack","kind":"chain"}');`),/permission denied/);
    assert.throws(()=>manage('create',{name:'attack',kind:'chain'},ADMIN),/Staynex administrator required/);
    assert.throws(()=>auth(ADMIN,`select * from organization_users;`),/permission denied/);
  });
  check('assignment suspension survives reconciliation and role cycles', () => {
    sql(`update hotel_users set status='disabled' where user_id=${q(ADMIN)} and hotel_id=${q(HA2)};`);
    manage('reconcile',{organization_id:A}); assert.equal(can(ADMIN,HA2),'f');
    membership(A,ADMIN,'member'); membership(A,ADMIN,'org_admin'); assert.equal(can(ADMIN,HA2),'f');
  });
  check('role revocation removes derived access only', () => {
    membership(A,ADMIN,'member'); assert.equal(can(ADMIN,NEW),'f'); assert.equal(can(ADMIN,HA),'t');
    assert.equal(auth(ADMIN,`select staynex_can_write_hotel(${q(HA)},array['admin']);`),'f');
  });
  check('organization membership revocation blocks surviving independent assignment', () => {
    membership(A,MIXED,'member','disabled'); assert.equal(can(MIXED,HA),'f'); assert.equal(can(MIXED,HB),'t');
    assert.equal(sql(`select status from hotel_users where user_id=${q(MIXED)} and hotel_id=${q(HA)};`),'active');
    assert.equal(auth(MIXED,`select count(*) from conversations where hotel_id=${q(HA)};`),'0');
    assert.equal(auth(MIXED,`with changed as (update tickets set status='completed' where hotel_id=${q(HA)} returning id) select count(*) from changed;`),'0');
    assert.throws(()=>auth(MIXED,`insert into tickets(hotel_id,status) values(${q(HA)},'open');`),/row-level security/);
  });
  check('organization suspension denies all customer access, preserves internal identity', () => {
    manage('status',{organization_id:A,status:'disabled'}); assert.equal(can(RECEPTION,HA),'f'); assert.equal(can(ADMIN,HA),'f');
    assert.equal(can(INTERNAL,HA),'t'); assert.equal(can(SUPPORT,HA),'t');
    assert.equal(auth(SUPPORT,`select staynex_can_write_hotel(${q(HA)},array['admin']);`),'f');
    manage('status',{organization_id:A,status:'active'}); assert.equal(can(RECEPTION,HA),'t'); assert.equal(can(MIXED,HA),'f');
  });
  check('independent organization limited to one hotel and transfers rejected', () => {
    assert.throws(()=>manage('incorporate',{organization_id:I,hotel_id:LEGACY}),/independent organization/);
    assert.throws(()=>manage('incorporate',{organization_id:B,hotel_id:HA}),/separately reviewed transfer/);
    assert.equal(can(SOLO,HI),'t'); assert.equal(can(SOLO,HA),'f');
  });
  check('new hotel invitations get ordinary membership and acceptance binds verified identity', () => {
    const u=id(109); sql(`insert into auth.users(id,email) values(${q(u)},'new@synthetic.invalid'); insert into hotel_users(hotel_id,email,status) values(${q(HA)},'new@synthetic.invalid','invited');`);
    sql(`set role service_role; select staynex_accept_organization_invitations(${q(u)},'new@synthetic.invalid'); update hotel_users set user_id=${q(u)},status='active' where email='new@synthetic.invalid';`);
    assert.equal(can(u,HA),'t'); assert.equal(can(u,HA2),'f');
    assert.equal(sql(`select role from organization_users where user_id=${q(u)};`),'member');
  });
  check('invited chain administrator accepts without existing hotel assignment', () => {
    const u=id(110); sql(`insert into auth.users(id,email) values(${q(u)},'chain@synthetic.invalid');`);
    manage('member',{organization_id:B,email:'chain@synthetic.invalid',role:'org_admin',status:'invited'});
    sql(`set role service_role; select staynex_accept_organization_invitations(${q(u)},'chain@synthetic.invalid');`);
    assert.equal(can(u,HB),'t'); assert.equal(can(u,HA),'f');
  });
  check('identity mismatch and revoked invitation cannot recover access', () => {
    assert.throws(()=>manage('member',{organization_id:A,user_id:ADMIN,email:'u103@synthetic.invalid',role:'org_admin',status:'active'}),/identity must match/);
    sql(`set role service_role; select staynex_accept_organization_invitations(${q(MIXED)},'u103@synthetic.invalid');`);
    assert.equal(can(MIXED,HA),'f');
  });
  check('team invitation authorizes actor, scope and client roles inside PostgreSQL', () => {
    const invite=(hotel,email,role='receptionist',actor=SOLO)=>sql(`set role service_role;select staynex_invite_hotel_user(${q(actor)},${q(hotel)},${q(email)},${q(role)});`);
    assert.throws(()=>invite(HB,'team@synthetic.invalid'),/Hotel team administrator required/);
    assert.throws(()=>invite(HI,'team@synthetic.invalid','platform_admin'),/Role not allowed/);
    assert.throws(()=>auth(SOLO,`select staynex_invite_hotel_user(${q(SOLO)},${q(HI)},'team@synthetic.invalid','admin');`),/permission denied/);
    const registered=JSON.parse(invite(HI,'u104@synthetic.invalid'));
    assert.equal(registered.user_id,RECEPTION);assert.equal(registered.status,'active');assert.equal(registered.role,'receptionist');assert.equal(can(RECEPTION,HI),'t');
    const pending=JSON.parse(invite(HI,'future@synthetic.invalid','admin'));
    assert.equal(pending.user_id,null);assert.equal(pending.status,'invited');assert.equal(pending.platform_role,'none');
  });
  check('team invitations cannot replace disabled rows or revoked organization membership', () => {
    sql(`update hotel_users set status='disabled' where hotel_id=${q(HI)} and user_id=${q(RECEPTION)};`);
    const invite=()=>sql(`set role service_role; select staynex_invite_hotel_user(${q(SOLO)},${q(HI)},'u104@synthetic.invalid','admin');`);
    assert.throws(invite,/duplicate key/);assert.equal(can(RECEPTION,HI),'f');
    membership(I,RECEPTION,'member','disabled');
    assert.throws(invite,/membership is revoked/);assert.equal(can(RECEPTION,HI),'f');
  });
  check('grant and management audit evidence retained', () => {
    assert.ok(Number(sql(`select count(*) from platform_audit_logs where action='organization_hotel_grant_created';`))>=4);
    assert.ok(Number(sql(`select count(*) from platform_audit_logs where actor_user_id=${q(INTERNAL)};`))>=10);
    assert.equal(sql(`select count(*) from hotel_users where organization_user_id is not null and platform_role<>'none';`),'0');
  });
  check('read-only preflight works before and after migration without changing assignments', () => {
    const before=sql('select jsonb_agg(to_jsonb(h) order by id) from hotel_users h;');
    sql(readFileSync('supabase/sql/preflight_organizations.sql','utf8'));
    assert.equal(sql('select jsonb_agg(to_jsonb(h) order by id) from hotel_users h;'),before);
  });
  console.log(`Organization PostgreSQL: ${tests} scenarios PASS; disposable database; no provider calls.`);
} finally { pg.cleanup(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
