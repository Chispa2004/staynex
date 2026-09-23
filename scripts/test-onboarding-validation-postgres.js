import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync, execFile } from 'node:child_process';
import { createHotelAtomically } from '../dashboard/lib/hotel-creation.js';

assert.equal(process.env.SEND_AUTOMATIONS,'false');
assert.match(process.env.NODE_OPTIONS||'',/isolate\.cjs/);
const require=createRequire(import.meta.url);
const db=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const args=[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'];
const sql=text=>execFileSync(db.docker,args,{input:text,env:process.env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const parallelSql=text=>new Promise((resolve,reject)=>{const child=execFile(db.docker,args,{env:process.env,encoding:'utf8',timeout:30000},(error,stdout)=>error?reject(error):resolve(stdout.trim()));child.stdin.end(text);});
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user={id:id(1),email:'owner@example.invalid'};
const valid={name:'Hotel sintético',brand_name:'Marca',country_code:'ES',city:'Madrid',timezone:'Europe/Madrid',admin_email:'admin@example.invalid',address:'Calle sintética',check_in_time:'15:00',whatsapp_number:'+34000000000'};
const statement=args=>`SET ROLE service_role; SELECT public.create_hotel_onboarding_v1(${literal(args.p_actor)},${literal(args.p_key)},${literal(args.p_mode)},${literal(JSON.stringify(args.p_hotel))}::jsonb,${literal(args.p_email)});`;
let lastArgs;
const supabase={rpc:async(name,params)=>{assert.equal(name,'create_hotel_onboarding_v1');lastArgs=params;try{return {data:JSON.parse(sql(statement(params))),error:null};}catch(error){return {data:null,error:{message:error.message}};}}};
const create=(key,mode='platform',body=valid)=>createHotelAtomically({supabase,user,body,key:id(key),mode});
const count=table=>Number(sql(`SELECT count(*) FROM ${table};`));
try {
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE hotels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,brand_name text,slug text UNIQUE NOT NULL,workspace_slug text UNIQUE,
      country_code text,city text,timezone text NOT NULL,timezone_integrity_status text,default_language text NOT NULL DEFAULT 'es',whatsapp_number text,
      support_email text,support_phone text,brand_color text,secondary_color text,logo_url text,favicon_url text,subscription_plan text,description text,
      address text,phone text,check_in_time text,check_out_time text,ai_auto_reply_enabled boolean NOT NULL DEFAULT true,hotel_live_mode boolean DEFAULT true,metadata jsonb DEFAULT '{"live_automation_gates_verified":true}',
      live_mode_enabled_at timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE hotel_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid NOT NULL REFERENCES hotels ON DELETE CASCADE,user_id uuid,email text,
      role text NOT NULL,status text NOT NULL,is_default boolean,invited_at timestamptz,accepted_at timestamptz,UNIQUE(hotel_id,user_id));`);
  sql(readFileSync(new URL('../supabase/sql/create_hotel_onboarding.sql',import.meta.url),'utf8'));
  const migration=readFileSync(new URL('../supabase/sql/add_atomic_hotel_onboarding.sql',import.meta.url),'utf8');
  sql(migration);sql(migration);
  for(const role of ['anon','authenticated']) {
    assert.equal(sql(`SELECT has_function_privilege('${role}','create_hotel_onboarding_v1(uuid,uuid,text,jsonb,text)','execute');`),'f');
    assert.equal(sql(`SELECT has_function_privilege('${role}','save_hotel_onboarding_v1(uuid,text,jsonb,boolean)','execute');`),'f');
    assert.equal(sql(`SELECT has_table_privilege('${role}','hotel_creation_requests','select,insert,update,delete');`),'f');
  }
  assert.equal(sql("SELECT has_function_privilege('service_role','create_hotel_onboarding_v1(uuid,uuid,text,jsonb,text)','execute');"),'t');
  console.log('PASS PostgreSQL migration repeat and service-only contracts/private operation ledger');
  await assert.rejects(create(2,'platform',{...valid,name:'  '}));assert.equal(count('hotels'),0);
  const created=await create(2);assert.equal(count('hotels'),1);assert.equal(count('hotel_users'),1);assert.equal(count('hotel_onboarding_state'),1);
  for(const field of ['name','brand_name','country_code','city','timezone','address','check_in_time','whatsapp_number'])assert.equal(created.hotel[field],valid[field]);
  assert.equal(created.hotel.ai_auto_reply_enabled,false);assert.equal(created.hotel.hotel_live_mode,false);assert.deepEqual(created.hotel.metadata,{});assert.equal(created.hotel.live_mode_enabled_at,null);
  assert.equal(created.state.onboarding_completed,false);assert.equal(created.hotelUser.status,'invited');assert.equal(created.hotelUser.user_id,null);
  console.log('PASS PostgreSQL valid fields persist together; no live/AI/provider activation');
  const duplicate=await create(2);assert.equal(duplicate.hotel.id,created.hotel.id);assert.equal(duplicate.replayed,true);assert.equal(count('hotels'),1);
  await assert.rejects(create(2,'platform',{...valid,name:'Changed'}));assert.equal(count('hotels'),1);
  const sameName=await create(3);assert.notEqual(sameName.hotel.id,created.hotel.id);assert.notEqual(sameName.hotel.slug,created.hotel.slug);assert(sameName.hotel.slug.length<=48);
  console.log('PASS PostgreSQL retry after lost response; changed payload rejected, equal names are distinct operations');
  const argsForRace={...lastArgs,p_key:id(4)};
  const raced=await Promise.all(Array.from({length:8},()=>parallelSql(statement(argsForRace)).then(JSON.parse)));
  assert.equal(new Set(raced.map(r=>r.hotel.id)).size,1);assert.equal(raced.filter(r=>!r.replayed).length,1);assert.equal(count('hotels'),3);
  console.log('PASS PostgreSQL eight concurrent sessions create exactly one hotel/state/assignment');
  // Fail each related write after hotel insertion. Every prior insert must roll back.
  for(const table of ['hotel_onboarding_state','hotel_users','hotel_creation_requests']) {
    sql(`CREATE FUNCTION synthetic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic middle failure'; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION synthetic_failure();`);
    await assert.rejects(create(5));assert.equal(count('hotels'),3);assert.equal(count('hotel_users'),3);assert.equal(count('hotel_onboarding_state'),3);assert.equal(count('hotel_creation_requests'),3);
    sql(`DROP TRIGGER synthetic_failure ON ${table}; DROP FUNCTION synthetic_failure();`);
  }
  const recovered=await create(5,'workspace');assert.equal(count('hotels'),4);assert.equal(recovered.hotelUser.user_id,user.id);assert.equal(recovered.hotelUser.role,'owner');assert.equal(recovered.hotelUser.status,'active');
  console.log('PASS PostgreSQL rollback at all three subsequent writes; safe retry creates accessible owner hotel');
  sql(`UPDATE hotel_users SET status='disabled' WHERE id=${literal(recovered.hotelUser.id)};`);
  assert.equal((await create(5,'workspace')).hotelUser.status,'disabled','retry cannot restore revoked access');
  const snapshot=sql('SELECT jsonb_agg(h ORDER BY id) FROM hotels h;');
  const hid=literal(recovered.hotel.id);
  const save=(completed,step='readiness')=>`SET ROLE service_role; SELECT public.save_hotel_onboarding_v1(${hid},'${step}','[]',${completed});`;
  const finished=JSON.parse(sql(save(true)));assert.equal(finished.onboarding_completed,true);assert(finished.onboarding_completed_at);
  const progress=JSON.parse(sql(save(false,'users')));assert.equal(progress.onboarding_completed,true);assert.equal(progress.onboarding_completed_at,finished.onboarding_completed_at);
  const progressRace=await Promise.all([parallelSql(save(true)),parallelSql(save(false))]);assert.equal(progressRace.length,2);
  assert.equal(JSON.parse(sql(save(false))).onboarding_completed,true);assert.equal(sql('SELECT jsonb_agg(h ORDER BY id) FROM hotels h;'),snapshot);
  console.log('PASS PostgreSQL monotonic completion and stable timestamp, concurrent progress and existing flags untouched');
  sql(`DELETE FROM hotels WHERE id=${hid};`);await assert.rejects(create(5,'workspace'));assert.equal(count('hotels'),3);
  console.log('PASS PostgreSQL deleted result stays a tombstone; retry does not resurrect hotel/access');
  console.log('8 onboarding PostgreSQL scenario groups passed');
} finally {db.cleanup();}
