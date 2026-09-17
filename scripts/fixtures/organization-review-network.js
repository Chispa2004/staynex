'use client';
// Synthetic browser adapter, copied only into the disposable local review runtime.
import { getPermissionsForRole, getPermissionsForPlatformRole } from '@/lib/permissions';
import { buildConversationDashboard } from '@/lib/hotel-operations-workspace';
import { attentionDashboardDTO } from '../../shared/message-attention/contract.js';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const organizations = [{id:uuid(1),name:'Cadena Aurora · SINTÉTICA',kind:'chain',status:'active'}, {id:uuid(2),name:'Cadena Brisa · SINTÉTICA',kind:'chain',status:'active'}, {id:uuid(3),name:'Casa Olivo · SINTÉTICA',kind:'independent',status:'active'}];
const hotels = [[11,0,'Aurora Centro','Madrid'],[12,0,'Aurora Mar','Valencia'],[21,1,'Brisa Norte','Bilbao'],[22,1,'Brisa Jardín','Sevilla'],[31,2,'Casa Olivo','Granada']].map(([n,o,name,city])=>({id:uuid(n),organization_id:organizations[o].id,name:`${name} · SINTÉTICO`,city,country_code:'ES',timezone:'Europe/Madrid',default_language:'es',hotel_live_mode:false,ai_auto_reply_enabled:false}));
const roles = {staynex:['admin','admin','admin','admin','admin'],cadena:['admin','admin',null,null,null],brisa:[null,null,'admin','admin',null],direccion:['admin','manager',null,null,null],recepcion:['receptionist',null,'receptionist',null,null],independiente:[null,null,null,null,'admin']};
const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const profile = () => roles[localStorage.getItem('organization-review-profile')] ? localStorage.getItem('organization-review-profile') : 'cadena';
const available = () => hotels.filter((h,i)=>roles[profile()][i]);
const platformRole = () => profile()==='staynex' ? 'platform_admin' : 'none';
const roleFor = h => roles[profile()][hotels.findIndex(row=>row.id===h.id)];
const current = h => ({hotel:h,hotelId:h.id,organization:organizations.find(o=>o.id===h.organization_id),role:roleFor(h),permissions:getPermissionsForRole(roleFor(h)),platformRole:platformRole(),platformPermissions:getPermissionsForPlatformRole(platformRole()),hotelUser:{id:uuid(101),user_id:'local-review-user',hotel_id:h.id,role:roleFor(h),status:'active'},user:{id:'local-review-user'},availableHotels:available().map(h=>({hotel:h,role:roleFor(h)})),canSwitchWorkspaces:available().length>1,canCreateWorkspaces:false,guestMemoryEnabled:false});
const conversations = h => [0,1].map(n=>{
  const guest={id:uuid(600+n),name:`Huésped sintético ${n+1}`,full_name:`Huésped sintético ${n+1}`,current_room:`10${n+1}`,preferred_language:'es'};
  const message={id:uuid(Number(h.id.slice(-2))*100+n),hotel_id:h.id,conversation_id:uuid(Number(h.id.slice(-2))*100+50+n),sender_type:'guest',content:`${h.name}: ${n ? 'Solicitud de toallas para la habitación.' : '¿A qué hora se sirve el desayuno?'}`,created_at:new Date().toISOString(),metadata:{demo:true},attention_inclusion_version:1};
  return {id:message.conversation_id,hotel_id:h.id,guest_id:guest.id,guest,guestName:guest.name,guest_name:guest.name,roomNumber:guest.current_room,room_number:guest.current_room,status:'active',messages:[message],lastMessage:message,last_message_at:message.created_at,unreadCount:1,aiState:{hotel_id:h.id,conversation_id:message.conversation_id,state_metadata:{conversation_ai_mode:'human_takeover'}},tickets:[],offers:[],upsells:[],activeOffers:[],activeUpsells:[],experienceBookings:[],guestMemory:[],guestMemoryEnabled:false};
});
const api = async (url,init) => {
  const method=init.method||'GET', body=init.body?JSON.parse(init.body):{};
  const requestHotel=body.hotelId||new Headers(init.headers).get('x-staynex-hotel-id')||new URLSearchParams(location.search).get('hotelId')||localStorage.getItem('staynex_active_workspace_id');
  const h=requestHotel?available().find(h=>h.id===requestHotel):available()[0];
  if (url.pathname==='/api/organizations') {
    if (url.searchParams.get('platform')==='1'&&profile()!=='staynex') return response({error:'Platform está reservado a Staynex'},403);
    if(method!=='GET') return response({error:'El laboratorio visual no guarda cambios. La gestión se valida en las pruebas de servidor y PostgreSQL.'},423);
    const orgs=organizations.filter(o=>available().some(h=>h.organization_id===o.id));
    const selected=url.searchParams.get('organizationId')||(profile()==='staynex'?null:orgs.length===1?orgs[0].id:null);
    if(selected&&!orgs.some(o=>o.id===selected))return response({error:'Organización no autorizada'},403);
    const needs=profile()!=='staynex'&&!selected&&orgs.length>1;
    const visible=needs?[]:available().filter(h=>!selected||h.organization_id===selected);
    return response({organizations:orgs,selectedOrganizationId:selected,requiresOrganizationSelection:needs,platformRole:platformRole(),canManage:profile()==='staynex',hotels:visible.map(h=>({...h,organizationName:organizations.find(o=>o.id===h.organization_id).name,role:roleFor(h),canEnter:true,openTickets:1,urgentTickets:0})),metrics:needs?null:{hotels:visible.length,people:visible.length+1,assignments:visible.length*2,openTickets:visible.length,urgentTickets:0}});
  }
  if(url.pathname==='/api/platform/hotels') {
    if(profile()!=='staynex')return response({error:'Platform is internal'},403);
    return response({hotels:hotels.map(h=>({...h,healthScore:70,healthStatus:'Simulado',stats:{openTickets:1,activeUsers:2},readiness:{ready_for_live:false}})),metrics:{totalHotels:5,activeHotels:5,pmsConnectedHotels:0,hotelsNeedingAttention:5},platformRole:platformRole()});
  }
  if(!h)return response({accessDenied:true,accessDeniedReason:'hotel_not_authorized',hotel:null,error:'Hotel no autorizado'},403);
  if(url.pathname==='/api/current-hotel')return response(current(h));
  if(url.pathname==='/api/onboarding/state')return response({hotelId:h.id,state:{onboarding_completed:true}});
  if(url.pathname==='/api/tickets/stats')return response({hotelId:h.id,stats:{urgentTickets:0,openTickets:1}});
  if(url.pathname==='/api/inbox')return response({hotel:h,hotelId:h.id,actorId:'local-review-user',conversations:conversations(h),role:roleFor(h),permissions:getPermissionsForRole(roleFor(h))});
  if(url.pathname==='/api/executive-dashboard') {
    const origin=url.searchParams.get('attentionOrigin')||'traced';
    const messages=origin==='simulated'?conversations(h).map(c=>({id:c.messages[0].id,conversationId:c.id,title:c.messages[0].content,guest:c.guest.name,room:c.guest.current_room,origin,status:'Pendiente',version:1,priority:null,createdAt:c.last_message_at,stayStage:'Durante la estancia'})):[];
    const attention=attentionDashboardDTO({contract:2,hotelId:h.id,origin,messages,nextCursor:null,counters:{received:messages.length,resolved:0,pending:messages.length,urgent:0}},h.id);
    const sources=Object.fromEntries(['logs','messages','claims','conversations','states','tickets','guests','offers'].map(k=>[k,{rows:[],complete:true}]));
    return response({...current(h),refreshedAt:new Date().toISOString(),kpis:{activeGuests:2,openTickets:1,urgentTickets:0},summary:{activeConversations:2},conversationDashboard:buildConversationDashboard({hotelId:h.id,timezone:h.timezone,sources,attentionSnapshot:attention,origin,activeCount:2}),pmsSnapshot:{connected:false,providerName:'Simulado',lastSyncAt:null},pilotAiSafety:{sendAutomations:false,enabled:false},onboardingHealth:{whatsappConfigured:false}});
  }
  if(url.pathname==='/api/settings/users')return response({hotel:h,hotelId:h.id,role:roleFor(h),users:[{id:uuid(501),email:'cadena@synthetic.invalid',role:'admin',status:'active',protected:true,managedByOrganization:true},{id:uuid(502),email:'recepcion@synthetic.invalid',role:'receptionist',status:'active'}]});
  return response({error:'Ruta bloqueada en el laboratorio visual',localReviewOnly:true},423);
};
export function LocalReviewNetworkBoundary() {
  if(typeof window==='undefined'||window.__organizationReviewInstalled)return null;
  window.__organizationReviewInstalled=true;window.__STAYNEX_LOCAL_REVIEW__=true;
  const parameters=new URLSearchParams(location.search);
  if(roles[parameters.get('profile')]){localStorage.setItem('organization-review-profile',parameters.get('profile'));localStorage.removeItem('staynex_active_workspace_id');document.cookie='staynex_active_hotel_id=;path=/;max-age=0';}
  localStorage.setItem('staynex_dashboard_theme','light');
  const original=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.origin);
    if(url.origin!==location.origin)return response({error:'External request blocked'},451);
    if(url.pathname.startsWith('/api/'))return api(url,init);
    return original(input,init);
  };
  const bar=document.createElement('div');bar.style.cssText='background:#fff4cf;color:#624800;font:12px system-ui;padding:8px 16px;display:flex;flex-wrap:wrap;gap:10px;position:relative;z-index:100';
  const label=document.createElement('strong');label.textContent='LABORATORIO SINTÉTICO · Sin proveedores';bar.append(label);
  for(const [key,label]of Object.entries({staynex:'Staynex',cadena:'Cadena Aurora',brisa:'Cadena Brisa',direccion:'Dirección',recepcion:'Recepción',independiente:'Independiente'})){const a=document.createElement('a');a.href=`${key==='staynex'?'/platform/organizations':'/my-hotels'}?profile=${key}`;a.textContent=label;a.style.cssText='text-decoration:underline;padding:2px 4px';bar.append(a);}
  document.body.prepend(bar);
  const style=document.createElement('style');const resize=()=>{style.textContent='.h-dvh{height:calc(100dvh - '+bar.getBoundingClientRect().height+'px)!important}';};resize();document.head.append(style);new ResizeObserver(resize).observe(bar);
  return null;
}
