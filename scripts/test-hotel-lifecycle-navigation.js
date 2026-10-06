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
  const {code} = await swc.transform(readFileSync(new URL(path, import.meta.url),'utf8')+suffix, {filename:path,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert(name in mocks,`Missing ${name}`);return mocks[name];},module,module.exports);
  return module.exports;
};
const memory = () => {const rows=new Map();return {getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)};};
const events = new EventTarget();
globalThis.window = Object.assign(events,{localStorage:memory(),sessionStorage:memory(),location:{search:''},setTimeout,clearTimeout,innerHeight:900,matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}})});
globalThis.document = {cookie:''};
const a='00000000-0000-4000-8000-000000000010';
const b='00000000-0000-4000-8000-000000000011';
workspace.persistWorkspaceSelection({hotelId:a,workspace:{hotel:{id:a}}});
const before=workspace.getWorkspaceRevision();
workspace.invalidateArchivedWorkspace(a);
assert.equal(workspace.getActiveWorkspace().hotelId,null);
assert.equal(window.localStorage.getItem('staynex_active_workspace'),null);
assert.equal(workspace.getWorkspaceRequestHeaders()['x-staynex-workspace-unselected'],'1');
assert.notEqual(workspace.getWorkspaceRevision(),before);
assert(document.cookie.includes('staynex_workspace_unselected=1'));
console.log('PASS selected archive clears persisted ID/metadata and requires an explicit next selection');

let completeSwitch;
globalThis.fetch=()=>new Promise(resolve=>{completeSwitch=resolve;});
const switchAttempt=workspace.switchWorkspace({hotelId:a,accessToken:'synthetic'});
workspace.invalidateArchivedWorkspace(a);
completeSwitch(Response.json({hotel:{id:a},role:'admin'}));
await assert.rejects(switchAttempt);
assert.equal(workspace.getActiveWorkspace().hotelId,null);
console.log('PASS late workspace switch cannot persist archived context');

// Execute the real AppShell hooks and render tree with deterministic transports.
// No source-text assertions, remote authentication, providers or production storage.
let hooks=[],cursor=0,effects=[],dirty=false,tree,pathname='/dashboard/inbox',replacements=[];
const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const React={
  useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return [hooks[i].value,v=>{const next=typeof v==='function'?v(hooks[i].value):v;if(!Object.is(next,hooks[i].value)){hooks[i].value=next;dirty=true;}}];},
  useRef(initial){const i=cursor++;return hooks[i] ||= {current:initial};},
  useMemo(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps))hooks[i]={value:fn(),deps};return hooks[i].value;},
  useEffect(fn,deps){const i=cursor++;if(!equal(hooks[i]?.deps,deps)){const old=hooks[i];hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=fn();});}}
};
const jsx=(type,props)=>({type,props});
const router={replace:path=>{replacements.push(path);pathname=path;dirty=true;},prefetch(){},refresh(){}};
const session={access_token:'synthetic',user:{id:'actor'}};
const mocks={'@/lib/workspace-ready':{WorkspaceReadyContext:{Provider:'workspace-provider'}},
  '@/lib/compact-routes':compactRoutes,
  react:React,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'a'},'next/navigation':{usePathname:()=>pathname,useRouter:()=>router},
  'lucide-react':{},'@/lib/onboarding-navigation':navigation,'./AppShell.module.css':{default:{}},'@/lib/shell-navigation':{ShellNavigationContext:{Provider:'provider'}},
  './LanguageSelector':{},'./ThemeToggle':{},'./HotelWorkspaceSwitcher':{},'./StaynexBrand':{},
  '@/lib/i18n/useDashboardLanguage':{useDashboardLanguage:()=>({tx:x=>x,t:x=>x})},
  '@/lib/theme/useDashboardTheme':{useDashboardTheme:()=>({theme:'light'})},
  '@/lib/supabase-browser':{getSupabaseBrowser:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},
  '@/lib/ui/styles':{cn:(...s)=>s.join(' ')},'@/lib/workspace-context':workspace,'@/lib/permissions':permissions
};
mocks['@/lib/focus-layer']=await compile('../dashboard/lib/focus-layer.js',{react:React});
const {AppShellContent}=await compile('../dashboard/components/AppShell.js',mocks,'\nexport {AppShellContent};');
const base={hotel:{id:a,name:'Synthetic'},user:{id:'actor'},role:'admin',permissions:['all'],platformRole:'platform_admin',availableHotels:[{hotel:{id:a}},{hotel:{id:b}}],canSwitchWorkspaces:true};
let context=base, pendingReply=null,fail=false;
globalThis.fetch=async url=>{
  if(url==='/api/current-hotel'){
    if(fail)throw Error('Synthetic network failure');
    if(pendingReply)return new Promise(resolve=>{pendingReply.resolve=resolve;});
    return Response.json(context);
  }
  if(url==='/api/onboarding/state')return Response.json({state:{hotel_id:context.hotel?.id,onboarding_completed:true},onboardingCompleted:true});
  return Response.json({});
};
const render=()=>{cursor=0;effects=[];dirty=false;tree=AppShellContent({children:jsx('operational-child',{})});for(const effect of effects)effect();};
const flush=async()=>{for(let i=0;i<25;i++){if(dirty||!tree)render();await new Promise(resolve=>setImmediate(resolve));if(!dirty)break;}};
const nodes=(n)=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text=()=>nodes(tree).flatMap(n=>[n.props?.children].flat(Infinity).filter(x=>typeof x==='string')).join(' ');
workspace.persistWorkspaceSelection({hotelId:a});
await flush();
assert(nodes(tree).some(n=>n.type==='operational-child'));
pendingReply={}; window.dispatchEvent(new Event('focus'));await flush();
assert(pendingReply.resolve);
workspace.invalidateArchivedWorkspace(a);await flush();
assert.equal(pathname,'/platform');assert(text().includes('Hotel archivado.'));
assert(nodes(tree).some(n=>n.type==='operational-child'),'Platform is rendered without an operational hotel');
pendingReply.resolve(Response.json(base));pendingReply=null;await flush();
assert.equal(workspace.getActiveWorkspace().hotelId,null);
assert(text().includes('Hotel archivado.'));
assert(!text().includes('Synthetic'));
console.log('PASS real AppShell selected archive → Platform confirmation, session retained, stale GET discarded');

const reset=async(nextContext,path)=>{
  for(const h of hooks)h?.cleanup?.();hooks=[];tree=null;dirty=true;pathname=path;context=nextContext;replacements=[];await flush();
};
const archived={...base,hotel:null,role:'blocked',permissions:[],accessDenied:true,accessDeniedReason:'hotel_archived',archivedHotelId:a,availableHotels:[{hotel:{id:b,name:'Authorized B'}}]};
workspace.persistWorkspaceSelection({hotelId:a});
await reset(archived,'/platform');
assert(nodes(tree).some(n=>n.type==='operational-child'));
assert.equal(workspace.getActiveWorkspace().hotelId,null);
await reset(archived,'/dashboard/inbox');
assert(pathname.startsWith('/platform'));
console.log('PASS real AppShell reload/direct/back with archived selection preserves Platform permission, no operational fallback');

await reset({...archived,platformRole:'none'},'/dashboard/inbox');
assert(!nodes(tree).some(n=>n.type==='operational-child'));
assert(!replacements.some(path=>path.startsWith('/platform')));
assert(text().includes('Contacta con tu administrador'));
assert(text().includes('Abrir hotel autorizado'));
assert(!text().includes('Go to Platform Hotels'));
console.log('PASS non-Platform identity has only authorized hotel choice/contact/logout; no permission escalation');

fail=true; await reset(base,'/dashboard/inbox');
assert(text().includes('Workspace could not load'));
assert(!text().includes('Hotel archivado.'));
fail=false;
await reset(base,'/dashboard/inbox');
window.dispatchEvent(new CustomEvent('storage',{detail:{}})); // unrelated event is not archive evidence
const storageEvent=new Event('storage');Object.assign(storageEvent,{key:workspace.WORKSPACE_INVALIDATION_KEY,newValue:JSON.stringify({hotelId:a,revision:'other-tab'})});
window.dispatchEvent(storageEvent);await flush();
assert.equal(pathname,'/platform');
assert(text().includes('Hotel archivado.'));
for(const h of hooks)h?.cleanup?.();
console.log('PASS network failure remains retryable, separate stale tab invalidates operational view');
console.log('7 hotel lifecycle navigation behavior groups passed');
