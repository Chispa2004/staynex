'use client';
import {useState} from 'react';
import {CreateHotelForm} from '@/components/PlatformConsoleClient';
import {HotelInvitationPanel} from '@/components/HotelInvitationPanel';
import {submitHotelCreation} from '@/lib/hotel-creation-client';
import {getSupabaseBrowser} from '@/lib/supabase-browser';
import {ThemeToggle} from '@/components/ThemeToggle';
import {useDashboardTheme} from '@/lib/theme/useDashboardTheme';
export default function Page(){
 const {theme}=useDashboardTheme(),[created,setCreated]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 async function create(form){setSaving(true);setError('');try{
  const {data}=await getSupabaseBrowser().auth.getSession();
  const result=await submitHotelCreation({mode:'platform',actorId:data.session.user.id,form,headers:{Authorization:'Bearer '+data.session.access_token}});
  setCreated(result);
 }catch(e){setError(e.message);}finally{setSaving(false);}}
 return <main className="min-h-dvh p-4 sm:p-8 bg-midnight text-slate-200"><div className="mx-auto max-w-4xl space-y-4">
 <h1>Laboratorio aislado · alta asistida</h1><p>Auth y correo simulados. PostgreSQL desechable. Sin proveedores ni envíos.</p><ThemeToggle/>
 <button onClick={()=>getSupabaseBrowser().auth.signInWithPassword({email:'platform@example.invalid'})}>Usar cuenta Staynex sintética</button>
 {error&&<p role="alert">{error}</p>}
 {!created?<CreateHotelForm isLight={theme==='light'} onSubmit={create} onCancel={()=>{}} saving={saving}/>:<>
 <p>Hotel creado: {created.hotel.name}</p><HotelInvitationPanel hotelId={created.hotel.id} users={[created.hotelUser]}/></>}
 </div></main>;
}
