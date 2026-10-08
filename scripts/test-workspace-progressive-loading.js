import * as compactRoutes from '../dashboard/lib/compact-routes.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as workspace from '../dashboard/lib/workspace-context.js';
import * as permissions from '../dashboard/lib/permissions.js';
import * as navigation from '../dashboard/lib/onboarding-navigation.js';

assert.equal(process.env.SEND_AUTOMATIONS, 'false');
const require = createRequire(new URL('../dashboard/package.json', import.meta.url));
const swc = require('next/dist/build/swc');
const compile = async (path, mocks, suffix='') => {
  const {code} = await swc.transform(readFileSync(new URL(path, import.meta.url),'utf8')+suffix, {filename:path,jsc:{target:'es2022',parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert(name in mocks, `Missing ${name}`);return mocks[name];},module,module.exports);
  return module.exports;
};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
// Deterministic effect runner: real shell code, controlled auth, transport and
// timers. Assertions depend on observable states, never elapsed wall time.
let hooks=[],cursor=0,effects=[],dirty=false,tree,pathname,replacements,authListener;
let timers=new Map(),timerId=0;
const events=new EventTarget();
globalThis.window=Object.assign(events,{localStorage:memory(),sessionStorage:memory(),location:{search:''},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),
  innerHeight:900,matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}})});
globalThis.document={cookie:''};
const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const React={
  useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return [hooks[i].value,v=>{const next=typeof v==='function'?v(hooks[i].value):v;if(!Object.is(next,hooks[i].value)){hooks[i].value=next;dirty=true;}}]},
  useRef(initial){const i=cursor++;return hooks[i]||={current:initial}},
  useMemo(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps))hooks[i]={value:fn(),deps};return hooks[i].value},
  useEffect(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps)){const old=hooks[i];hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=fn()})}}
};
const jsx=(type,props)=>({type,props});
const router={replace:path=>{replacements.push(path);pathname=path;dirty=true},prefetch(){},refresh(){}};
const a='00000000-0000-4000-8000-000000000010',b='00000000-0000-4000-8000-000000000011';
const session={access_token:'synthetic',user:{id:'actor'}};
let getSession,signOuts=0,requests=[],transport;
const mocks={
  '@/lib/workspace-ready':{WorkspaceReadyContext:{Provider:'workspace-provider'}},
  '@/lib/compact-routes':compactRoutes,
  react:React,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'a'},'next/navigation':{usePathname:()=>pathname,useRouter:()=>router},
  'lucide-react':{},'@/lib/onboarding-navigation':navigation,'./AppShell.module.css':{default:{}},'@/lib/shell-navigation':{ShellNavigationContext:{Provider:'provider'}},
  './LanguageSelector':{},'./ThemeToggle':{},'./HotelWorkspaceSwitcher':{},'./StaynexBrand':{},
  '@/lib/i18n/useDashboardLanguage':{useDashboardLanguage:()=>({tx:x=>x,t:x=>x})},
  '@/lib/theme/useDashboardTheme':{useDashboardTheme:()=>({theme:'light'})},
  '@/lib/supabase-browser':{getSupabaseBrowser:()=>({auth:{getSession:()=>getSession(),onAuthStateChange:fn=>{authListener=fn;return {data:{subscription:{unsubscribe(){authListener=null}}}}},signOut:async()=>{signOuts++;authListener?.('SIGNED_OUT',null);return {error:null}}}})},
  '@/lib/ui/styles':{cn:(...s)=>s.join(' ')},'@/lib/workspace-context':workspace,'@/lib/permissions':permissions
};
mocks['@/lib/focus-layer']=await compile('../dashboard/lib/focus-layer.js',{react:React});
const {AppShellContent}=await compile('../dashboard/components/AppShell.js',mocks,'\nexport {AppShellContent};');
const base={hotel:{id:a,name:'Authorized A'},user:{id:'actor'},role:'admin',permissions:['all'],platformRole:'platform_admin',canSwitchWorkspaces:true,directoryDeferred:true,availableHotels:[]};
const normal=(url,options)=>Response.json(url==='/api/onboarding/state'?{state:{hotel_id:options.headers['x-staynex-hotel-id'],onboarding_completed:true}}:url==='/api/current-hotel'||url==='/api/workspace-directory'?{...base,availableHotels:[{hotel:base.hotel}]}:{});
globalThis.fetch=(url,options={})=>{requests.push({url,options});return Promise.resolve().then(()=>transport(url,options))};
const render=()=>{cursor=0;effects=[];dirty=false;tree=AppShellContent({children:jsx('protected-content',{})});for(const effect of effects)effect()};
const flush=async()=>{for(let i=0;i<30;i++){if(dirty||!tree)render();await new Promise(resolve=>setImmediate(resolve));if(!dirty)break}};
const nodes=(n)=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
const nodeText=n=>nodes(n).flatMap(x=>[x.props?.children].flat(Infinity).filter(v=>typeof v==='string')).join(' ');
const text=()=>nodeText(tree);
const protectedVisible=()=>nodes(tree).some(n=>n.type==='protected-content');
const shellVisible=()=>nodes(tree).some(n=>n.type==='nav'&&n.props['aria-label']==='Navegación principal');
const click=async(label)=>{const button=nodes(tree).find(n=>n.type==='button'&&nodeText(n).includes(label));assert(button,`Button ${label}`);await button.props.onClick();await flush()};
const reset=async({path='/dashboard',fetch=normal,auth=async()=>({data:{session}})}={})=>{
  for(const h of hooks)h?.cleanup?.();hooks=[];tree=null;dirty=true;timers.clear();requests=[];replacements=[];pathname=path;transport=fetch;getSession=auth;
  window.localStorage=memory();window.sessionStorage=memory();workspace.persistWorkspaceSelection({hotelId:a});await flush()
};
const fireTimeouts=async()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await flush()};
const assertReadOnly=()=>assert(requests.every(r=>!r.options.method||r.options.method==='GET'),'load/retry must never replay mutations');

let core=deferred(),gate=deferred(),directory=deferred();
await reset({fetch:(url,o)=>url==='/api/current-hotel'?core.promise:url==='/api/onboarding/state'?gate.promise:url==='/api/workspace-directory'?directory.promise:normal(url,o)});
assert(text().includes('Preparando tu espacio'));assert(!shellVisible());assert(!protectedVisible());assert(!text().includes('Authorized A'));
window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));await flush();
assert.equal(requests.filter(r=>r.url==='/api/current-hotel').length,1);
core.resolve(Response.json(base));await flush();
assert(!shellVisible());assert(!protectedVisible());assert(text().includes('Preparando tu espacio'));assert(!text().includes('Finish onboarding'));
gate.resolve(Response.json({state:{hotel_id:a,onboarding_completed:true}}));await flush();
assert(protectedVisible(),'secondary directory cannot block authorized content');
directory.reject(Error('Directory offline'));await flush();assert(protectedVisible());assert(text().includes('Reintentar selector'));
transport=normal;await click('Reintentar selector');assert(protectedVisible());assertReadOnly();
console.log('PASS structure before authorization; minimal context then content; directory failure independent; focus deduplicated');

core=deferred();await reset({fetch:(url,o)=>url==='/api/current-hotel'?core.promise:normal(url,o)});
await fireTimeouts();assert(text().includes('Workspace could not load'));assert(!protectedVisible());assert.equal(signOuts,0);assert(!replacements.includes('/login'));assert.equal(workspace.getActiveWorkspace().hotelId,a);
core.resolve(Response.json(base));await flush();assert(!protectedVisible(),'late response after timeout is rejected');
transport=normal;await click('Retry');assert(protectedVisible());assertReadOnly();
console.log('PASS mandatory context timeout, selection retained, no logout, late reply ignored, read retry recovers');

const authPending=deferred();await reset({auth:()=>authPending.promise});
authListener('INITIAL_SESSION',null);await flush();assert(!replacements.includes('/login'));
await fireTimeouts();
assert(text().includes('Reintenta sin cerrar sesión'));assert(!protectedVisible());assert(!replacements.includes('/login'));
authPending.resolve({data:{session}});await flush();assert(!protectedVisible());
getSession=async()=>({data:{session}});await click('Retry');assert(protectedVisible());
await reset({auth:async()=>({data:{session:null}})});assert(replacements.includes('/login'));assert.equal(requests.length,0);
await reset({auth:async()=>({data:{session:null},error:{status:401}})});assert(replacements.includes('/login'));assert.equal(requests.length,0);
await reset({fetch:(url,o)=>url==='/api/current-hotel'?Response.json({accessDenied:true,accessDeniedReason:'invalid_session'},{status:401}):normal(url,o)});
assert(replacements.includes('/login'));
console.log('PASS session network timeout differs from explicit missing/expired session; retry is safe');

await reset({fetch:()=>Response.json({...base,hotel:null,role:'blocked',permissions:[],platformRole:'none',accessDenied:true,accessDeniedReason:'hotel_assignment_missing'})});
assert(!protectedVisible());assert(!shellVisible());assert(!replacements.includes('/login'));
await reset({fetch:()=>Response.json({...base,hotel:null,role:'blocked',permissions:[],platformRole:'none',accessDenied:true,accessDeniedReason:'hotel_archived',archivedHotelId:a})});
assert(!protectedVisible());assert(text().includes('Este hotel está archivado.'));assert.equal(workspace.getActiveWorkspace().hotelId,null);
console.log('PASS no access and archived hotel remain distinct; no automatic fallback');

core=deferred();await reset({fetch:(url,o)=>url==='/api/current-hotel'?core.promise:normal(url,o)});
transport=(url,o)=>url==='/api/current-hotel'||url==='/api/workspace-directory'?Response.json({...base,hotel:{id:b,name:'Authorized B'},availableHotels:[]}):normal(url,o);
window.localStorage.setItem('staynex_active_workspace_id',b);
const changed=new Event('storage');Object.assign(changed,{key:'staynex_active_workspace_id',newValue:b});window.dispatchEvent(changed);await flush();
core.resolve(Response.json(base));await flush();assert(protectedVisible());assert.equal(workspace.getActiveWorkspace().hotelId,b);assert(!text().includes('Authorized A'));
console.log('PASS another tab changes hotel; old context cannot recover the previous selection');

core=deferred();await reset({fetch:(url,o)=>url==='/api/current-hotel'?core.promise:normal(url,o)});
authListener('SIGNED_OUT',null);await flush();core.resolve(Response.json(base));await flush();assert(replacements.includes('/login'));assert(!shellVisible());
const pendingSwitch=deferred();globalThis.fetch=()=>pendingSwitch.promise;let current=true;
const switching=workspace.switchWorkspace({hotelId:b,accessToken:'synthetic',isCurrent:()=>current});current=false;
pendingSwitch.resolve(Response.json({...base,hotel:{id:b}}));await assert.rejects(switching);assert.notEqual(workspace.getActiveWorkspace().hotelId,b);
globalThis.fetch=(url,options={})=>{requests.push({url,options});return Promise.resolve().then(()=>transport(url,options))};
console.log('PASS logout invalidates pending context and switch persistence');

gate=deferred();await reset({fetch:(url,o)=>url==='/api/onboarding/state'?gate.promise:normal(url,o)});
await fireTimeouts();assert(!shellVisible());assert(!protectedVisible());assert(text().includes('Reintenta o abre el asistente'));
pathname='/dashboard/health';dirty=true;await flush();assert(protectedVisible(),'authorized remediation remains available while gate is unavailable');
await reset({fetch:(url,o)=>url==='/api/onboarding/state'?Response.json({state:{hotel_id:a,onboarding_completed:false}}):normal(url,o)});
assert.equal(pathname,'/dashboard/onboarding');assert(protectedVisible());
await reset({path:'/platform/hotels',fetch:(url,o)=>{assert.notEqual(url,'/api/onboarding/state');return normal(url,o)}});
assert(protectedVisible());assert(!requests.some(r=>r.url==='/api/onboarding/state'));
console.log('PASS gate timeout contains only dependent route; pending onboarding and independent Platform preserved');

await reset({fetch:(url,o)=>url==='/api/onboarding/state'?Response.json({state:{hotel_id:b,onboarding_completed:true}}):normal(url,o)});
assert(!protectedVisible());assert(text().includes('Reintenta o abre el asistente'));
await reset({fetch:(url,o)=>url==='/api/current-hotel'?Response.json({...base,user:{id:'other-actor'}}):normal(url,o)});
assert(!protectedVisible());assert(text().includes('Workspace could not load'));
console.log('PASS mismatched hotel/user responses fail closed');
await reset({path:'/login',auth:()=>{throw Error('LoginClient owns session lookup')}});
assert.equal(requests.length,0);
core=deferred();await reset({fetch:(url,o)=>url==='/api/current-hotel'?core.promise:normal(url,o)});
transport=(url,o)=>url==='/api/current-hotel'||url==='/api/workspace-directory'?Response.json({...base,user:{id:'actor-b'},availableHotels:[]}):normal(url,o);
authListener('SIGNED_IN',{access_token:'synthetic-b',user:{id:'actor-b'}});await flush();
core.resolve(Response.json(base));await flush();
assert(protectedVisible());assert(!text().includes('Workspace could not load'));
assert(requests.filter(r=>r.url==='/api/current-hotel').some(r=>r.options.headers.Authorization==='Bearer synthetic-b'));
console.log('PASS login has a single session owner; identity replacement rejects previous response');
directory=deferred();await reset({fetch:(url,o)=>url==='/api/workspace-directory'?directory.promise:normal(url,o)});
assert(protectedVisible());await fireTimeouts();assert(protectedVisible());assert(text().includes('Reintentar selector'));
directory.resolve(Response.json({...base,hotel:{id:b}}));await flush();assert.equal(workspace.getActiveWorkspace().hotelId,a);
await reset({fetch:(url,o)=>url==='/api/workspace-directory'?Response.json({...base,role:'receptionist',permissions:['dashboard'],availableHotels:[]}):normal(url,o)});
// The changed authorization is revalidated, never merged into the old grant.
assert(requests.filter(r=>r.url==='/api/current-hotel').length>1);
console.log('PASS directory timeout remains local; authorization changes invalidate the context');
for(const h of hooks)h?.cleanup?.();

// Exercise actual API handlers as well as the shell.
const next={'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}}};
let contextOptions,summaryCalls=0,contextError=null,schemaReady=true;
const currentRoute=await compile('../dashboard/app/api/current-hotel/route.js',{
  ...next,'@/lib/permissions':permissions,'@/lib/onboarding':{getOnboardingState:async()=>({hotel_id:a,onboarding_completed:true})},'@/lib/current-hotel':{getCurrentHotelForRequest:async(req,options)=>{contextOptions=options;return base}},
  '@/lib/enterprise-audit':{},'../../../../shared/guest-memory/feature-flag.js':{isGuestMemoryEnabled:()=>false}
});
let response=await currentRoute.GET(new Request('https://synthetic.invalid/api/current-hotel',{headers:{'x-staynex-context-only':'1'}}));
assert.equal(response.status,200);assert.deepEqual(contextOptions,{readOnly:true,includeDirectory:false});const initialBody=await response.json();assert.equal(initialBody.directoryDeferred,true);assert.deepEqual(initialBody.onboardingGate,{hotelId:a,completed:true});
await currentRoute.GET(new Request('https://synthetic.invalid/api/current-hotel'));assert.deepEqual(contextOptions,{readOnly:true,includeDirectory:true});
const stateRoute=await compile('../dashboard/app/api/onboarding/state/route.js',{
  ...next,'../../../../../shared/location/hotel-location-integrity.js':{},'../../../../../shared/onboarding/hotel-fields.js':{},'@/lib/enterprise-audit':{},'@/lib/pilot-onboarding':{},
  '@/lib/onboarding':{getOnboardingContext:async(req,options)=>{contextOptions=options;if(contextError)throw contextError;return {...base,schemaReady,state:{hotel_id:a,onboarding_completed:false}}},
    getPilotOnboardingSummaryForContext:async()=>{summaryCalls++;return {}},ONBOARDING_STEPS:[]}
});
const gateRequest=()=>new Request('https://synthetic.invalid/api/onboarding/state',{headers:{'x-staynex-onboarding-gate':'1'}});
response=await stateRoute.GET(gateRequest());assert.deepEqual(contextOptions,{readOnly:true,includeDirectory:false});assert.equal(summaryCalls,0);
assert.deepEqual((await response.json()).state,{hotel_id:a,onboarding_completed:false});assert.equal(response.headers.get('Cache-Control'),'no-store');
await stateRoute.GET(new Request('https://synthetic.invalid/api/onboarding/state'));assert.equal(summaryCalls,1,'full onboarding screen retains readiness summary');
schemaReady=false;assert.equal((await stateRoute.GET(gateRequest())).status,503);
contextError=Object.assign(Error('Forbidden'),{status:403});assert.equal((await stateRoute.GET(gateRequest())).status,403);
assert.equal(summaryCalls,1);
console.log('PASS actual GET handlers use read-only context and scoped minimal gate; no health/catalog dependency; schema/auth errors preserved');
console.log('11 workspace progressive loading behavior groups passed');

await reset({fetch:(url,o)=>url==='/api/current-hotel'?Response.json({...base,onboardingGate:{hotelId:a,completed:true}}):normal(url,o)});
assert(protectedVisible());assert.equal(requests.filter(r=>r.url==='/api/onboarding/state').length,0,'combined context reuses authorized gate');
await reset({fetch:(url,o)=>url==='/api/current-hotel'?Response.json({...base,onboardingGate:{hotelId:a,error:true}}):normal(url,o)});
assert(!protectedVisible());assert(text().includes('Reintenta o abre el asistente'));assert.equal(requests.filter(r=>r.url==='/api/onboarding/state').length,0);
transport=normal;await click('Retry');assert(protectedVisible());
console.log('PASS combined gate avoids duplicate authorization round trip; unknown is not incomplete; error retry recovers');

// Platform's context-only response intentionally contains no operational hotel.
const platformContext={...base,hotel:null,role:'blocked',permissions:[],accessDenied:true,accessDeniedReason:'workspace_required'};
const platformTransport=(url,o)=>url==='/api/current-hotel' && o.headers['x-staynex-workspace-path'].startsWith('/platform') ? Response.json(platformContext) : normal(url,o);
await reset({path:'/platform/hotels',fetch:platformTransport});
assert(protectedVisible());
workspace.persistWorkspaceSelection({hotelId:a,notify:true});
await flush(); // Next router navigation can commit after the selection event.
pathname='/dashboard';dirty=true;await flush();
assert.equal(pathname,'/dashboard','Platform-only denial must not redirect a newly selected hotel back to Platform');
assert(protectedVisible());assert.equal(workspace.getActiveWorkspace().hotelId,a);
console.log('PASS Platform directory entry resolves operational context after route transition');

// A delayed Platform response cannot overwrite the destination context.
core=deferred();await reset({path:'/platform/hotels',fetch:(url,o)=>url==='/api/current-hotel'?core.promise:normal(url,o)});
pathname='/dashboard';transport=normal;dirty=true;await flush();assert(protectedVisible());
core.resolve(Response.json(platformContext));await flush();assert.equal(pathname,'/dashboard');assert(protectedVisible());
pathname='/platform/hotels';transport=platformTransport;dirty=true;await flush();assert(protectedVisible());
assert(!text().includes('Authorized A'),'Platform must not retain operational hotel data');
pathname='/dashboard';dirty=true;await flush();assert(protectedVisible());
console.log('PASS old Platform response ignored; return and browser Back revalidate each context');

// Back between explicit hotel URLs must resolve the historical selection.
transport=(url,o)=>url==='/api/current-hotel'||url==='/api/workspace-directory'?Response.json({...base,hotel:{id:o.headers['x-staynex-hotel-id'],name:o.headers['x-staynex-hotel-id']===a?'Authorized A':'Authorized B'}}):normal(url,o);
window.location.search='?hotelId='+b;window.dispatchEvent(new Event('popstate'));await flush();
assert(protectedVisible());assert(!text().includes('Authorized A'));assert.equal(workspace.getActiveWorkspace().hotelId,b);
window.location.search='?hotelId='+a;window.dispatchEvent(new Event('popstate'));await flush();
assert(protectedVisible());assert(!text().includes('Authorized B'));window.location.search='';
console.log('PASS explicit hotel history resolves again without cross-hotel content');
for(const h of hooks)h?.cleanup?.();

// Execute the shared entry hook used by all three original controls.
let supportHook, entryErrors=[], pushes=[];
router.push=path=>pushes.push(path);
const {useSupportWorkspaceEntry}=await compile('../dashboard/lib/use-support-workspace-entry.js',{
 react:React,'next/navigation':{useRouter:()=>router},'./workspace-context':workspace,
 './supabase-browser':mocks['@/lib/supabase-browser']
});
const hookRender=()=>{cursor=0;effects=[];dirty=false;supportHook=useSupportWorkspaceEntry({onError:e=>entryErrors.push(e)});for(const effect of effects)effect()};
const resetHook=()=>{for(const h of hooks)h?.cleanup?.();hooks=[];timers.clear();entryErrors=[];pushes=[];window.localStorage=memory();hookRender()};
const supportBody=id=>({ok:true,hotel:{id},supportSession:{hotelId:id,readonly:true}});
resetHook();let first=deferred(),second=deferred();
globalThis.fetch=url=>url.includes(a)?first.promise:second.promise;
const firstEntry=supportHook.enterWorkspace(a);hookRender();assert.equal(supportHook.pendingHotelId,a);
const secondEntry=supportHook.enterWorkspace(b);await new Promise(r=>setImmediate(r));
second.resolve(Response.json(supportBody(b)));await secondEntry;
first.resolve(Response.json(supportBody(a)));await firstEntry;
assert.deepEqual(pushes,['/dashboard?hotelId='+b]);assert.equal(workspace.getActiveWorkspace().hotelId,b);
assert.equal(JSON.parse(window.sessionStorage.getItem('staynex_support_session')).hotelId,b);
console.log('PASS shared support entry: latest attempt wins and matching readonly session persists');
for(const status of [401,403,503]){
 resetHook();globalThis.fetch=async()=>Response.json({error:'Private details not shown'},{status});
 await supportHook.enterWorkspace(a);assert(entryErrors.at(-1));assert.equal(pushes.length,0);assert.equal(workspace.getActiveWorkspace().hotelId,null);
 globalThis.fetch=async()=>Response.json(supportBody(a));await supportHook.enterWorkspace(a);assert.equal(pushes.length,1);
}
console.log('PASS expired/forbidden/transient entry errors remain visible and retryable without granting access');
resetHook();first=deferred();globalThis.fetch=()=>first.promise;
const timeoutEntry=supportHook.enterWorkspace(a);await new Promise(r=>setImmediate(r));
[...timers.values()].forEach(fn=>fn());await timeoutEntry;assert(entryErrors.at(-1).includes('timed out'));
first.resolve(Response.json(supportBody(a)));await new Promise(r=>setImmediate(r));assert.equal(pushes.length,0);
console.log('PASS entry timeout rejects late success without selection or navigation');
resetHook();globalThis.fetch=async()=>Response.json(supportBody(b));await supportHook.enterWorkspace(a);
assert.equal(pushes.length,0);assert.equal(workspace.getActiveWorkspace().hotelId,null);
resetHook();first=deferred();let calls=0;globalThis.fetch=()=>{calls++;return first.promise};
const original=supportHook.enterWorkspace(a);await supportHook.enterWorkspace(a);await new Promise(r=>setImmediate(r));assert.equal(calls,1);
for(const h of hooks)h?.cleanup?.();first.resolve(Response.json(supportBody(a)));await original;assert.equal(pushes.length,0);
console.log('PASS mismatched support response, duplicate click and unmount cannot commit an obsolete selection');

resetHook();first=deferred();globalThis.fetch=()=>first.promise;
const oldEntry=supportHook.enterWorkspace(a);await new Promise(r=>setImmediate(r));
workspace.persistWorkspaceSelection({hotelId:b});first.resolve(Response.json(supportBody(a)));await oldEntry;
assert.equal(pushes.length,0);assert.equal(workspace.getActiveWorkspace().hotelId,b);
console.log('PASS another selection made outside this control cannot be overwritten by its older response');
