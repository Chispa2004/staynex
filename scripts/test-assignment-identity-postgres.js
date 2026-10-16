import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync,execFile} from 'node:child_process';
const require=createRequire(import.meta.url),db=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const args=[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'];
const sql=input=>execFileSync(db.docker,args,{input,env:process.env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const parallel=input=>new Promise((resolve,reject)=>{const p=execFile(db.docker,args,{env:process.env,timeout:30000},(e,out)=>e?reject(e):resolve(out.trim()));p.stdin.end(input);});
const file=name=>readFileSync(new URL('../supabase/sql/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const identity=(actor,email)=>`SET ROLE authenticated;SET request.jwt.claim.sub=${q(id(actor))};SET request.jwt.claim.email=${q(email)};`;
try{
 sql(readFileSync(new URL('./fixtures/assisted-onboarding-schema.sql',import.meta.url),'utf8'));
 sql(`ALTER ROLE service_role BYPASSRLS;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
 GRANT ALL ON hotel_users,hotels TO authenticated,anon,service_role;
 ALTER TABLE hotel_users ENABLE ROW LEVEL SECURITY;
 CREATE TABLE reservations(id uuid DEFAULT gen_random_uuid(),hotel_id uuid,pms_provider text,status text,arrival_date text,departure_date text);
 CREATE TABLE local_knowledge_items(id uuid DEFAULT gen_random_uuid(),hotel_id uuid,title text);
 CREATE TABLE hotel_knowledge(id uuid DEFAULT gen_random_uuid(),hotel_id uuid,value text);
 CREATE TABLE hotel_pms_connections(id uuid PRIMARY KEY,hotel_id uuid,provider text,client_id text,encrypted_client_secret text,account_code text,base_url text,enabled boolean,metadata jsonb,sync_status text);
 INSERT INTO hotels(id,name,slug,timezone,metadata) VALUES('${id(10)}','Synthetic A','a','Europe/Madrid','{}'),('${id(11)}','Synthetic B','b','Europe/Madrid','{}');
 INSERT INTO auth.users VALUES('${id(1)}','platform@example.invalid',now(),NULL),('${id(2)}','owner@example.invalid',now(),NULL),('${id(3)}','pending@example.invalid',now(),NULL),('${id(4)}','unrelated@example.invalid',now(),NULL);
 INSERT INTO hotel_users(id,hotel_id,user_id,email,role,status,platform_role) VALUES
 ('${id(20)}','${id(10)}','${id(1)}','platform@example.invalid','admin','active','platform_admin'),
 ('${id(21)}','${id(10)}','${id(2)}','owner@example.invalid','admin','active','none'),
 ('${id(22)}','${id(11)}',NULL,'pending@example.invalid','admin','invited','none'),
 ('${id(23)}','${id(11)}','${id(4)}','unrelated@example.invalid','admin','disabled','none');
 INSERT INTO reservations(hotel_id,pms_provider,status) VALUES('${id(10)}','mock','confirmed'),('${id(11)}','mock','confirmed');`);
 sql(readFileSync(new URL('./fixtures/legacy-assignment-rls.sql',import.meta.url),'utf8'));
 for(const table of ['reservations','local_knowledge_items']){const write=table==='local_knowledge_items'?"staynex_can_write_hotel(hotel_id,ARRAY['owner','admin','manager','receptionist'])":'staynex_can_write_hotel(hotel_id)';sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO authenticated;
 CREATE POLICY read_scoped ON ${table} FOR SELECT TO authenticated USING(staynex_can_read_hotel(hotel_id));
 CREATE POLICY insert_scoped ON ${table} FOR INSERT TO authenticated WITH CHECK(${write});
 CREATE POLICY update_scoped ON ${table} FOR UPDATE TO authenticated USING(${write}) WITH CHECK(${write});
 CREATE POLICY delete_scoped ON ${table} FOR DELETE TO authenticated USING(staynex_can_write_hotel(hotel_id));`);}
 assert.equal(sql(identity(4,'platform@example.invalid')+'SELECT count(*) FROM reservations'),'2');
 console.log('PASS negative control: old RLS email fallback grants another UUID platform scope');
 const snapshot=sql('SELECT jsonb_agg(u ORDER BY id) FROM hotel_users u;SELECT jsonb_agg(r ORDER BY hotel_id) FROM reservations r;');
 const acls=sql("SELECT oid::regprocedure,proacl FROM pg_proc WHERE proname IN ('staynex_can_read_hotel','staynex_can_write_hotel','staynex_is_platform_admin','staynex_is_platform_operator') ORDER BY 1;");
 for(let repeat=0;repeat<2;repeat++)for(const name of ['add_hotel_lifecycle.sql','add_hotel_access_invitations.sql','guard_explicit_invitation_acceptance.sql','require_assignment_identity.sql','add_hotel_information_review.sql','add_pms_connection_evidence.sql'])sql(file(name));
 assert.equal(sql('SELECT jsonb_agg(u ORDER BY id) FROM hotel_users u;SELECT jsonb_agg(r ORDER BY hotel_id) FROM reservations r;').split('\n')[0],snapshot.split('\n')[0]);
 assert.equal(sql('SELECT count(*) FROM reservations'),'2');
 assert.equal(sql("SELECT oid::regprocedure,proacl FROM pg_proc WHERE proname IN ('staynex_can_read_hotel','staynex_can_write_hotel','staynex_is_platform_admin','staynex_is_platform_operator') ORDER BY 1;"),acls);
 assert.equal(sql(identity(4,'platform@example.invalid')+'SELECT count(*) FROM reservations'),'0');
 assert.equal(sql(identity(1,'changed@example.invalid')+'SELECT count(*) FROM reservations'),'2');
 assert.equal(sql(identity(2,'changed@example.invalid')+'SELECT count(*) FROM reservations'),'1');
 assert.equal(sql(identity(3,'pending@example.invalid')+'SELECT count(*) FROM reservations'),'0');
 assert.throws(()=>sql(identity(2,'owner@example.invalid')+`INSERT INTO local_knowledge_items(hotel_id,title) VALUES('${id(11)}','denied')`));
 sql(identity(2,'owner@example.invalid')+`INSERT INTO local_knowledge_items(hotel_id,title) VALUES('${id(10)}','allowed')`);
 console.log('PASS real policies: UUID scope only; active preserved, disabled/pending denied, cross-hotel write denied, ACL unchanged');
 const old=`SET ROLE service_role;UPDATE hotel_users SET user_id='${id(3)}',status='active',accepted_at=now() WHERE id='${id(22)}' AND status='invited' AND user_id IS NULL;`;
 assert.throws(()=>sql(old));assert.throws(()=>sql(old));
 assert.throws(()=>sql(`SET ROLE service_role;INSERT INTO hotel_access_invitations(assignment_id,hotel_id,email,role,token_hash,expires_at,accepted_at,accepted_by) VALUES('${id(22)}','${id(11)}','pending@example.invalid','admin','${'a'.repeat(64)}',now()+interval '1 day',now(),'${id(3)}')`));
 sql(`SET ROLE service_role;SELECT manage_hotel_invitation_v1('${id(1)}','${id(11)}','${id(22)}','${'b'.repeat(64)}');`);
 const accept=`SET ROLE service_role;SELECT accept_hotel_invitation_v1('${id(3)}','${'b'.repeat(64)}',true);`;
 const accepted=await Promise.all(Array.from({length:4},()=>parallel(accept)));
 assert(accepted.every(s=>JSON.parse(s).accepted));assert.equal(JSON.parse(sql(accept)).hotelId,id(11));
 assert.equal(sql(identity(3,'pending@example.invalid')+'SELECT count(*) FROM reservations'),'1');
 sql(`UPDATE hotel_users SET status='disabled' WHERE id='${id(22)}'`);assert.throws(()=>sql(accept));
 assert.equal(sql(identity(3,'pending@example.invalid')+'SELECT count(*) FROM reservations'),'0');
 console.log('PASS service-role legacy grants/forged receipts denied; concurrent explicit acceptance/retry works; revocation effective under actual RLS');
 console.log('PASS scoped reproduction: current helper definitions, actual lifecycle migration and eight policies; not full Production clone');
}finally{db.cleanup();}
