'use client';
import {useEffect,useState} from 'react';
import {getSupabaseBrowser} from '@/lib/supabase-browser';
import {persistWorkspaceSelection} from '@/lib/workspace-context';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {useDashboardTheme} from '@/lib/theme/useDashboardTheme';
import {LanguageSelector} from './LanguageSelector';
import {ThemeToggle} from './ThemeToggle';
import {cn,ui} from '@/lib/ui/styles';
import {initializeInvitationSession,invitationTokenKey as tokenKey,validateInvitationResult} from '@/lib/invitation-session';
export function AccessInvitationClient() {
 const {tx}=useDashboardLanguage(); const {theme}=useDashboardTheme(); const isLight=theme==='light';
 const [token,setToken]=useState(''); const [user,setUser]=useState(null); const [invite,setInvite]=useState(null);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false);
 const [initializing,setInitializing]=useState(true);
 const [message,setMessage]=useState(''); const [error,setError]=useState('');
 useEffect(()=>{
   let active=true;
   const auth=getSupabaseBrowser()?.auth;
   initializeInvitationSession({auth,location:window.location,history:window.history,storage:sessionStorage})
     .then(result=>{if(active){setToken(result.token);setUser(result.user);}})
     .catch(()=>{if(active){setToken(sessionStorage.getItem(tokenKey)||'');setError('No se pudo acceder. Revisa los datos o el correo de verificación.');}})
     .finally(()=>{if(active)setInitializing(false);});
   const subscription=auth?.onAuthStateChange((_event,session)=>{if(active){setUser(session?.user||null);setInvite(null);}});
   return ()=>{active=false;subscription?.data?.subscription?.unsubscribe();};
 },[]);
 async function check(accept=false) {
   setBusy(true);setError('');setMessage('');
   try{
     const {data}=await getSupabaseBrowser().auth.getSession();
     const response=await fetch('/api/access-invitations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data?.session?.access_token||''}`},body:JSON.stringify({token,accept}),cache:'no-store'});
     const result=await response.json(); if(!response.ok) throw new Error(result.error);
     validateInvitationResult(result);setInvite(result);
     if(result.accepted){
       persistWorkspaceSelection({hotelId:result.hotelId,workspace:{id:result.hotelId,name:result.hotelName}});
       // Keep the tab-scoped token until the user leaves for the hotel. A reload
       // can explicitly inspect the same receipt without granting twice.
       setMessage('Acceso aceptado. Puedes completar los datos de tu hotel.');
     }
   }catch(e){setError(e.message||'No se pudo continuar. Reintenta.');}finally{setBusy(false);}
 }
 async function authenticate(event,signup=false){
   event.preventDefault();setBusy(true);setError('');setMessage('');
   try{
     const auth=getSupabaseBrowser().auth;
     const {data,error:failure}=signup?await auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+'/invite'}}):await auth.signInWithPassword({email:email.trim(),password});
     if(failure) throw new Error('No se pudo acceder. Revisa los datos o el correo de verificación.');
     setUser(data?.session?.user||null);setPassword('');
     if(signup) setMessage('Revisa el correo de verificación de tu cuenta. Después vuelve a este enlace e inicia sesión.');
   }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <main className={cn('min-h-dvh p-4 sm:p-8',isLight?'bg-slate-50 text-slate-800':'bg-[#081321] text-slate-100')}>
   <div className="mx-auto max-w-xl space-y-5">
     <header className="flex flex-wrap items-center justify-between gap-3"><strong>Staynex</strong><div className="flex gap-2"><LanguageSelector/><ThemeToggle/></div></header>
     <section className={cn('rounded-xl border p-5 space-y-4',ui.surface(isLight))}>
       <h1 className="text-xl font-semibold">{tx('Incorporarte a tu hotel')}</h1>
       <p>{tx('Inicia sesión con el correo destinatario verificado. Abrir este enlace no concede acceso.')}</p>
       {error&&<p role="alert">{tx(error)}</p>}{message&&<p role="status">{tx(message)}</p>}
       {!initializing&&!token&&!invite?.accepted&&<p>{tx('Abre el enlace entregado por Staynex. Si ha caducado, solicita uno nuevo.')}</p>}
       {!user?<form onSubmit={authenticate} className="space-y-4">
         <label className="block">{tx('Correo electrónico')}<input className={ui.input(isLight)} type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
         <label className="block">{tx('Contraseña')}<input className={ui.input(isLight)} type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
         <div className="flex flex-wrap gap-3"><button disabled={busy||initializing} className={ui.button(isLight,'primary')}>{tx('Iniciar sesión')}</button><button type="button" disabled={busy||initializing||!email||password.length<8} onClick={e=>authenticate(e,true)} className={ui.button(isLight,'secondary')}>{tx('Crear cuenta')}</button></div>
       </form>:<>
         <p>{tx('Cuenta actual')}: {user.email}</p>
         <button type="button" disabled={busy||initializing} onClick={async()=>{await getSupabaseBrowser().auth.signOut();setUser(null);setInvite(null);setMessage('');}} className={ui.button(isLight,'secondary')}>{tx('Cambiar de cuenta')}</button>
         {!invite?.accepted&&<button type="button" disabled={busy||initializing||!token} onClick={()=>check(false)} className={ui.button(isLight,'secondary')}>{tx('Comprobar invitación')}</button>}
         {invite&&<div className="space-y-3"><p>{invite.hotelName} · {tx(invite.role==='admin'?'Administrador del hotel':'Recepción')}</p>{!invite.accepted?<button disabled={busy||initializing} type="button" onClick={()=>check(true)} className={ui.button(isLight,'primary')}>{tx('Aceptar invitación')}</button>:<a href={`/dashboard/onboarding?hotelId=${encodeURIComponent(invite.hotelId)}`} onClick={()=>sessionStorage.removeItem(tokenKey)} className={ui.button(isLight,'primary')}>{tx('Completar los datos del hotel')}</a>}</div>}
       </>}
       {(busy||initializing)&&<p role="status">{tx('Comprobando…')}</p>}
     </section>
   </div>
 </main>;
}
