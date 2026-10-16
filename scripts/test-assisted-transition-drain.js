import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync,execFile} from 'node:child_process';
const require=createRequire(import.meta.url);
const scope=JSON.parse(readFileSync(new URL('./fixtures/assisted-transition-route-scope.json',import.meta.url)));
// Rehearsal model ONLY. This is not middleware, a firewall configuration or evidence of a remote drain.
const match=(pattern,path)=>new RegExp('^'+pattern.split('/').map(s=>s.startsWith('[')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$').test(path);
const blocked=(surface,path,method)=>{
  const pathname=new URL(path,'http://synthetic.invalid').pathname;
  if(/%|\\/.test(pathname))return true; // ambiguous encodings require canonicalization before a real edge rule
  const rows=surface==='vercel'?scope.vercelLegacyAdmission:scope.railwayAdmission;
  return rows.some(row=>row.methods.includes(method)&&match(row.path,pathname));
};
let checks=0;const pass=x=>{checks++;console.log('PASS '+x);};
for(const surface of ['vercel','railway'])for(const row of surface==='vercel'?scope.vercelLegacyAdmission:scope.railwayAdmission)
 for(const method of row.methods)for(const host of ['old-preview.invalid','production-alias.invalid'])
  assert(blocked(surface,`https://${host}${row.path.replaceAll('[id]','synthetic-id')}?retry=1`,method));
assert(blocked('vercel','/api/health/hotel','GET'));assert(blocked('vercel','/api/knowledge','HEAD'));
for(const path of ['/api/inbox','/api/current-hotel','/api/executive-dashboard','/api/reservations','/api/tickets'])assert.equal(blocked('vercel',path,'GET'),false);
assert.equal(blocked('railway','/health','GET'),false);
pass('proposed scoped admission covers unsafe GET/HEAD, mutations, aliases and direct backend paths; principal reads remain available');
const db=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const args=[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'];
const sql=s=>execFileSync(db.docker,args,{input:s,env:process.env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const parallel=s=>new Promise((resolve,reject)=>{const c=execFile(db.docker,args,{env:process.env,encoding:'utf8',timeout:10000},(e,out)=>e?reject(e):resolve(out.trim()));c.stdin.end(s);});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let admission=true,inFlight=0;const pending=new Set();
const admit=operation=>{
 if(!admission)return Promise.resolve({status:503});
 inFlight++;const p=operation().finally(()=>{inFlight--;pending.delete(p);});pending.add(p);return p;
};
try{
 sql(readFileSync(new URL('./fixtures/assisted-onboarding-schema.sql',import.meta.url),'utf8'));
 sql(`INSERT INTO hotels(id,name,slug,timezone) VALUES('${id(1)}','Synthetic drain','drain','Europe/Madrid');
 INSERT INTO auth.users VALUES('${id(2)}','owner@example.invalid',now(),NULL);
 INSERT INTO hotel_users(id,hotel_id,email,role,status) VALUES('${id(3)}','${id(1)}','owner@example.invalid','admin','invited');`);
 const legacy=`UPDATE hotel_users SET user_id='${id(2)}',status='active',accepted_at=now(),updated_at=now() WHERE id='${id(3)}' AND status='invited' AND user_id IS NULL RETURNING status;`;
 // Exact old SQL update, held at a synthetic application barrier before PostgreSQL; edge closure cannot cancel it.
 let release;const barrier=new Promise(r=>release=r);
 const old=admit(async()=>{await barrier;return parallel(legacy);});
 admission=false;assert.equal(inFlight,1);assert.equal((await admit(()=>{throw Error('Must never dispatch');})).status,503);
 for(let n=0;n<8;n++)assert.equal((await admit(()=>parallel(legacy))).status,503);
 assert.equal(sql('SELECT status FROM hotel_users'),'invited');
 pass('closing admissions rejects concurrent retries before SQL but does not declare an admitted task drained');
 // Client response is deliberately lost; the server-side task still reaches PostgreSQL.
 release();await Promise.allSettled([...pending]);await old;
 assert.equal(sql('SELECT status FROM hotel_users'),'active');assert.equal(inFlight,0);
 pass('lost client response does not cancel an admitted legacy grant; wait for durable result before cutover');
 const snapshot=sql('SELECT row_to_json(u) FROM hotel_users u');
 sql(readFileSync(new URL('../supabase/sql/add_hotel_access_invitations.sql',import.meta.url),'utf8'));
 assert.equal(sql('SELECT row_to_json(u) FROM hotel_users u'),snapshot);
 assert.equal((await admit(()=>parallel(legacy))).status,503);
 pass('migration after drain preserves committed assignment; old retries remain blocked after schema change');
 // Demonstrate why reopening an old URL is unsafe, without altering the historical committed assignment.
 sql(`INSERT INTO auth.users VALUES('${id(5)}','second@example.invalid',now(),NULL); INSERT INTO hotel_users(id,hotel_id,email,role,status) VALUES('${id(4)}','${id(1)}','second@example.invalid','receptionist','invited');`);
 sql(legacy.replaceAll(id(3),id(4)).replaceAll(id(2),id(5)));
 assert.equal(sql(`SELECT status FROM hotel_users WHERE id='${id(4)}'`),'active');
 assert.equal(sql('SELECT count(*) FROM hotel_access_invitations'),'0');
 pass('negative control: old writer on new schema still grants without invitation; old deployments must never reopen');
 sql(`UPDATE hotel_users SET user_id=NULL,status='invited',accepted_at=NULL WHERE id='${id(4)}'`);
 sql(readFileSync(new URL('../supabase/sql/guard_explicit_invitation_acceptance.sql',import.meta.url),'utf8'));
 assert.throws(()=>sql(legacy.replaceAll(id(3),id(4)).replaceAll(id(2),id(5))));
 assert.equal(sql(`SELECT status FROM hotel_users WHERE id='${id(4)}'`),'invited');
 assert.equal(sql(`SELECT status FROM hotel_users WHERE id='${id(3)}'`),'active');
 pass('incremental guard rejects old retry after cutover, preserving pre-cutover active and pending rows');
 // A new-schema handler cannot be admitted until both migration and version evidence are complete.
 const mayEnable=e=>e.admissionsClosed&&e.inFlight===0&&e.catalogCompatible&&e.newDashboard&&e.newBackend&&e.oldUrlsBlocked;
 const complete={admissionsClosed:true,inFlight:0,catalogCompatible:true,newDashboard:true,newBackend:true,oldUrlsBlocked:true};
 for(const key of Object.keys(complete))assert.equal(mayEnable({...complete,[key]:key==='inFlight'?1:false}),false);
 assert.equal(mayEnable(complete),true);
 pass('partial migration, mixed versions, nonzero in-flight or reachable old URL prevents reopening');
 console.log(`${checks} local transition-control groups passed; synthetic PG only; no deployed gate or remote drainage claimed`);
}finally{await Promise.allSettled([...pending]);db.cleanup();}

