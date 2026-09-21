import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignmentAuthorized, getInternalRole, selectEffectiveAssignments } from '../shared/access/organization-scope.js';
import { resolvePostLoginDestination } from '../dashboard/lib/post-login-routing.js';
import { canAccess } from '../dashboard/lib/permissions.js';
const A={id:'a',name:'Synthetic A',kind:'chain',status:'active'}, B={id:'b',name:'Synthetic B',kind:'chain',status:'active'}, I={id:'i',name:'Independent',kind:'independent',status:'active'};
const hotels=[{id:'a1',name:'A1',organization_id:'a'},{id:'a2',name:'A2',organization_id:'a'},{id:'b1',name:'B1',organization_id:'b'},{id:'i1',name:'I1',organization_id:'i'}];
const m=(org,role='member',user='u')=>({id:`${org.id}-${user}`,user_id:user,organization_id:org.id,organization:org,status:'active',role});
const grant=(hotel,role='receptionist',origin=null,user='u')=>({id:`${hotel.id}-${role}-${origin}`,user_id:user,hotel_id:hotel.id,hotel,role,status:'active',platform_role:'none',organization_user_id:origin});
const memberships=[m(A,'org_admin'),m(B)];
const assignments=[grant(hotels[0],'admin','a-u'),grant(hotels[1],'admin','a-u'),grant(hotels[0]),grant(hotels[2],'manager')];
const effective=selectEffectiveAssignments(assignments,memberships,'u');
assert.deepEqual(effective.map(a=>a.role),['admin','admin','manager']);
assert.equal(canAccess(effective[2].role,'user_management'),false);
assert.equal(assignmentAuthorized(assignments[0],[{...memberships[0],status:'disabled'}],'u'),false);
assert.equal(assignmentAuthorized({...assignments[0],status:'disabled'},memberships,'u'),false);
assert.equal(assignmentAuthorized({...assignments[0],organization_grant_revoked:true},memberships,'u'),false);
assert.equal(assignmentAuthorized(assignments[0],[m(A)],'u'),false);
assert.equal(assignmentAuthorized(assignments[0],memberships,'other'),false);
assert.equal(assignmentAuthorized({...assignments[0],role:'invented'},memberships,'u'),false);
assert.equal(getInternalRole(assignments,'u'),'none');
assert.equal(getInternalRole([{...assignments[0],platform_role:'support'},{...assignments[1],platform_role:'platform_admin'}],'u'),'platform_admin');
assert.equal(resolvePostLoginDestination({assignments:effective,memberships}).defaultRoute,'/my-hotels');
assert.equal(resolvePostLoginDestination({assignments:effective,requestedHotelId:'i1'}).accessDeniedReason,'hotel_not_authorized');
assert.equal(resolvePostLoginDestination({assignments:[],memberships:[m(A,'org_admin')]}).defaultRoute,'/my-hotels');

const calls=[];
const rows={organizations:[A,B,I],hotels,
  organization_users:memberships,
  hotel_users:assignments,
  tickets:[{id:'ta',hotel_id:'a1',status:'open',priority:'urgent'}, {id:'tb',hotel_id:'b1',status:'open',priority:'urgent'}, {id:'tc',hotel_id:'a2',status:'closed',priority:'urgent'}]};
const supabase={from(table){
  const filters=[]; let from=0,to=499;
  const query={select:()=>query,order:()=>query,eq:(key,value)=>{filters.push([key,[value]]);return query;},in:(key,value)=>{filters.push([key,value]);return query;},range:(a,b)=>{from=a;to=b;return query;},
    then(resolve,reject){
      if (['tickets','hotel_users'].includes(table)) assert.ok(filters.some(([k])=>k==='hotel_id'||k==='user_id'),'scope before loading operational rows');
      calls.push({table,filters,from,to});
      const data=(rows[table]||[]).filter(r=>filters.every(([k,values])=>values.includes(r[k]))).slice(from,to+1);
      return Promise.resolve({data,error:null}).then(resolve,reject);
    }};return query;
}};
const source=readFileSync('dashboard/lib/organization-access.js','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export const ','const ');
const {loadOrganizationDirectory}=new Function('assignmentAuthorized','selectEffectiveAssignments','getInternalRole',`${source}\nreturn {loadOrganizationDirectory};`)(assignmentAuthorized,selectEffectiveAssignments,getInternalRole);
const principal={supabase,user:{id:'u'},platformRole:'none',memberships,effectiveAssignments:effective};
let result=await loadOrganizationDirectory(principal,'a');
assert.deepEqual(result.hotels.map(h=>h.id),['a1','a2']);
assert.deepEqual(result.metrics,{hotels:2,people:1,assignments:3,openTickets:1,urgentTickets:1});
assert.equal(result.hotels[0].role,'admin');
assert.equal(JSON.stringify(result).includes('user_id'),false);
assert.equal(JSON.stringify(result).includes('metadata'),false);
assert.equal(JSON.stringify(result).includes('tb'),false);
assert.ok(calls.find(c=>c.table==='hotels').filters.some(([k,v])=>k==='organization_id'&&v[0]==='a'));
await assert.rejects(loadOrganizationDirectory(principal,'i'),e=>e.status===403);
result=await loadOrganizationDirectory(principal);
assert.equal(result.requiresOrganizationSelection,true);
assert.equal(result.metrics,null);
assert.deepEqual(result.hotels,[]);
result=await loadOrganizationDirectory({...principal,effectiveAssignments:effective.filter(a=>a.hotel_id!=='a2')},'a');
assert.equal(result.hotels.find(h=>h.id==='a2').canEnter,false);
assert.equal(result.hotels.find(h=>h.id==='a2').openTickets,0);
result=await loadOrganizationDirectory({...principal,memberships:[m(I)],effectiveAssignments:[grant(hotels[3],'admin')]},'i');
assert.deepEqual(result.hotels.map(h=>h.id),['i1']);
// Page boundaries never broaden the scope.
rows.tickets.push(...Array.from({length:1002},(_,i)=>({id:`a-${i}`,hotel_id:'a1',status:'open',priority:'normal'})));
calls.length=0; result=await loadOrganizationDirectory(principal,'a');
assert.equal(result.metrics.openTickets,1003);
assert.equal(calls.filter(c=>c.table==='tickets').length,3);
assert.ok(calls.filter(c=>c.table==='tickets').every(c=>c.filters[0][1].every(id=>id.startsWith('a'))));

// Exercise the actual hotel team route with protected/internal/foreign rows.
const teamRows=[{id:'independent',hotel_id:'a1',platform_role:'none',organization_user_id:null,role:'receptionist'},
  {id:'derived',hotel_id:'a1',platform_role:'none',organization_user_id:'m',role:'admin'},
  {id:'internal',hotel_id:'a1',platform_role:'platform_admin',organization_user_id:null,role:'owner'},
  {id:'foreign',hotel_id:'b1',platform_role:'none',organization_user_id:null,role:'receptionist'}];
const teamDb={from(){let filters=[],changes={};const query={update:u=>{changes=u;return query;},eq:(k,v)=>{filters.push([k,v]);return query;},is:(k,v)=>{filters.push([k,v]);return query;},not:()=>query,select:()=>query,async maybeSingle(){const row=teamRows.find(r=>filters.every(([k,v])=>r[k]===v));if(row)Object.assign(row,changes);return{data:row||null,error:null};}};return query;}};
const teamSource=readFileSync('dashboard/app/api/settings/users/route.js','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export async function ','async function ');
const context={supabase:teamDb,hotel:hotels[0],role:'admin'};
const team=new Function('NextResponse','getCurrentHotelForRequest','canAccess',`${teamSource}\nreturn {PATCH,DELETE};`)({json:(body,init={})=>({body,status:init.status||200})},async()=>context,canAccess);
for(const id of ['internal','derived','foreign']) {
  assert.notEqual((await team.PATCH({json:async()=>({id,status:'active',role:'admin',hotel_id:'b1',platform_role:'platform_admin'})})).status,200);
  assert.notEqual((await team.DELETE({json:async()=>({id})})).status,200);
}
assert.equal((await team.PATCH({json:async()=>({id:'independent',role:'platform_admin'})})).status,400);
assert.equal((await team.PATCH({json:async()=>({id:'independent',role:'admin',platform_role:'platform_admin',hotel_id:'b1'})})).status,200);
assert.equal(teamRows[0].platform_role,'none');assert.equal(teamRows[0].hotel_id,'a1');
context.role='manager'; assert.equal((await team.PATCH({json:async()=>({id:'independent',role:'admin'})})).status,403);
console.log('Organization access PASS: role/membership selection, scoped directory and pagination, independent client, denied IDs, protected hotel team actions.');

const workspaceSource=readFileSync('dashboard/lib/workspace-context.js','utf8').replaceAll('export const ','const ');
const storage=new Map(); const fakeWindow={localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},location:{search:''}};
let selectedResponse={hotel:{id:'other'},role:'admin'};
const workspace=new Function('window','document','fetch',workspaceSource+'; return {switchWorkspace,getActiveWorkspace};')(fakeWindow,{},async()=>({ok:true,json:async()=>selectedResponse}));
await assert.rejects(workspace.switchWorkspace({hotelId:'a1',accessToken:'synthetic'})); assert.equal(storage.size,0);
selectedResponse={hotel:{id:'a1'},role:'admin'};
await workspace.switchWorkspace({hotelId:'a1',accessToken:'synthetic'}); assert.equal(workspace.getActiveWorkspace().hotelId,'a1');
const tenantSource=readFileSync('dashboard/lib/tenant-client.js','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export const ','const ');
const tenant=new Function('getActiveWorkspace',tenantSource+';return {shouldAcceptTenantPayload};')(workspace.getActiveWorkspace);
assert.equal(tenant.shouldAcceptTenantPayload({hotelId:'b1'},'test-late-response'),false);
assert.equal(tenant.shouldAcceptTenantPayload({hotelId:'a1'},'test-current-response'),true);
const auditSource=readFileSync('dashboard/lib/enterprise-audit.js','utf8').replace('export const ','const ');
const audit=new Function(auditSource+';return writeEnterpriseAuditLog;')();
await assert.rejects(audit({supabase:{from:()=>({insert:async()=>({error:Error('audit unavailable')})})},action:'workspace_opened',entityType:'hotel',required:true}),/audit unavailable/);
console.log('Workspace selection/payload identity and required internal audit PASS.');

const invitationsSource=readFileSync('dashboard/lib/user-invitations.js','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export const ','const ');
const resolveAssignments=new Function('selectEffectiveAssignments',invitationsSource+';return getUserHotelAssignments;')(selectEffectiveAssignments);
rows.hotel_users=Array.from({length:1002},(_,i)=>grant({id:'large-'+i,organization_id:'a'},'admin'));
const pagedAssignments=await resolveAssignments({supabase,userId:'u',email:'ignored@synthetic.invalid'});
assert.equal(pagedAssignments.length,1002);
rows.organization_users=[{...m(A,'org_admin'),status:'disabled'}];
assert.equal((await resolveAssignments({supabase,userId:'u'})).length,0);
console.log('Actual assignment resolver PASS: >1000 assignments and membership revocation fail closed.');

const { translatePhrase } = await import('../dashboard/lib/i18n/translations.js');
assert.equal(translatePhrase('es','Users'),'Usuarios');
assert.equal(translatePhrase('es','Hotel accesses'),'Accesos a hoteles');
assert.equal(translatePhrase('es','One person can have access to several hotels'),'Una persona puede tener acceso a varios hoteles');
assert.equal(translatePhrase('es','Admin'),'Administrador');
assert.equal(translatePhrase('es','Receptionist'),'Recepción');
assert.equal(translatePhrase('en','Receptionist'),'Reception');
console.log('Organization copy PASS: existing translation system; role identifiers and metric formulas unchanged.');

// Target diagnostics exposes only the server project reference, never a URL or key.
const targetSource=readFileSync('dashboard/app/api/deployment-target/route.js','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export async function ','async function ');
const diagnosticEnv={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'must-not-appear',NEXT_PUBLIC_SUPABASE_URL:'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'};
const target=new Function('NextResponse','process',targetSource+';return GET;')({json:(body,init)=>({body,...init})},{env:diagnosticEnv});
assert.deepEqual((await target()).body,{projectRef:'abcdefghijklmnopqrst'});
diagnosticEnv.SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co.evil.invalid';
assert.equal((await target()).status,503);assert.deepEqual((await target()).body,{projectRef:null});
console.log('Deployment target diagnostic PASS: exact server variable, reference only, no fallback or secrets.');
