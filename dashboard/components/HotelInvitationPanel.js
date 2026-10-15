'use client';
import {useEffect,useState} from 'react';
import {getSupabaseBrowser} from '@/lib/supabase-browser';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {useDashboardTheme} from '@/lib/theme/useDashboardTheme';
import {cn,ui} from '@/lib/ui/styles';
export function HotelInvitationPanel({hotelId,users=[]}) {
 const {tx}=useDashboardLanguage();const {isLight}=useDashboardTheme();
 const [items,setItems]=useState([]);const [links,setLinks]=useState({});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 async function request(body) {
   const {data}=await getSupabaseBrowser().auth.getSession();
   const r=await fetch(`/api/platform/hotels/${hotelId}/invitations`,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${data?.session?.access_token||''}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const result=await r.json();if(!r.ok)throw new Error(result.error);return result;
 }
 useEffect(()=>{let active=true;setLinks({});request().then(r=>{if(active)setItems(r.invitations||[]);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[hotelId]);
 async function change(assignmentId,action){
   setBusy(true);setError('');setMessage('');setLinks(old=>({...old,[assignmentId]:null}));
   try{const r=await request({assignmentId,action});if(r.token)setLinks(old=>({...old,[assignmentId]:window.location.origin+'/invite#token='+r.token}));
     setItems((await request()).invitations||[]);setMessage(action==='replace'?'Enlace generado. No se ha enviado ningún correo.':'Invitación revocada.');
   }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className={cn('rounded-xl border p-4 space-y-3',ui.surface(isLight))}>
   <h2 className="font-semibold">{tx('Incorporación del responsable')}</h2>
   <p>{tx('Entrega el enlace de forma privada. Al generar otro, el anterior deja de ser válido. Caduca en siete días.')}</p>
   {error&&<p role="alert">{tx(error)}</p>}{message&&<p role="status">{tx(message)}</p>}
   {users.filter(u=>u.role==='admin'&&['invited','active','disabled'].includes(u.status)).map(u=>{
     const i=items.find(item=>item.assignment_id===u.id);
     const status=i?.accepted_at?'Aceptada':i?.revoked_at?'Revocada':i&&Date.parse(i.expires_at)<Date.now()?'Caducada':'Pendiente';
     return <article key={u.id} className="border-t py-3 space-y-2">
       <p className="break-words">{u.email} · {tx(status)} · {tx(u.status)}</p>
       {u.status==='invited'&&!u.user_id&&<div className="flex flex-wrap gap-2">
         <button type="button" disabled={busy} onClick={()=>change(u.id,'replace')} className={ui.button(isLight,'secondary')}>{tx('Generar enlace nuevo')}</button>
         <button type="button" disabled={busy||!i||Boolean(i.revoked_at||i.accepted_at)} onClick={()=>change(u.id,'revoke')} className={ui.button(isLight,'secondary')}>{tx('Revocar invitación')}</button>
         {links[u.id]&&<button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(links[u.id]);setMessage('Enlace copiado. Entrégalo al destinatario.');}catch{setError('No se pudo copiar. Reintenta.');}} className={ui.button(isLight,'primary')}>{tx('Copiar enlace')}</button>}
       </div>}
     </article>;
   })}
 </section>;
}
