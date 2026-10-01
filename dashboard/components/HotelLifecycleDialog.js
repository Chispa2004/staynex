"use client";
import { returnFocus } from '@/lib/focus-layer';
import {useEffect,useRef,useState} from 'react';
import {getSupabaseBrowser} from '@/lib/supabase-browser';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {ui} from '@/lib/ui/styles';
export function HotelLifecycleDialog({hotel,action='archive',isLight,onClose,onSaved}) {
  const {tx}=useDashboardLanguage(); const dialog=useRef(null); const cancel=useRef(null); const opener=useRef(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(null); const working=useRef(false);
  useEffect(()=>{opener.current ||= document.activeElement; const element=dialog.current; element.showModal();cancel.current.focus();return ()=>{element.close();returnFocus(opener.current,document.querySelector('[data-lifecycle-focus]'));};},[]);

  const restore=action==='restore';
  const submit=async()=>{
    if(working.current)return; working.current=true;setBusy(true);setError(null);
    const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),15000);
    try {
      const supabase=getSupabaseBrowser();const {data}=supabase?await supabase.auth.getSession():{data:{}};
      const response=await fetch(`/api/platform/hotels/${hotel.id}`,{signal:controller.signal,method:restore?'PATCH':'DELETE',headers:{'Content-Type':'application/json',...(data?.session?.access_token?{Authorization:`Bearer ${data.session.access_token}`}:{})},body:JSON.stringify({confirm:true,expectedUpdatedAt:hotel.updated_at ?? null,...(restore?{action:'restore_hotel',expectedArchivedAt:hotel.archived_at}:{})})});
      const body=await response.json();
      if(!response.ok||!body.ok||body.hotel?.id!==hotel.id||body.action!==action)throw new Error(body.error||'No se ha confirmado la operación. Recarga y reintenta.');
      onSaved(body);
    }catch(e){setError(e.name==='AbortError'?'No se ha recibido confirmación. Recarga para comprobar el estado antes de reintentar.':e.message);}finally{clearTimeout(deadline);working.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} onKeyDown={event=>{if(event.key!=='Tab')return;const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')];if(!buttons.length){event.preventDefault();return;}const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}} aria-labelledby="hotel-lifecycle-title" aria-describedby="hotel-lifecycle-effects" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}
    className={`w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-xl backdrop:bg-slate-950/60 ${isLight?'border-slate-200 bg-white text-slate-900':'border-slate-700 bg-slate-900 text-slate-100'}`} >
    <h2 id="hotel-lifecycle-title" className="break-words text-xl font-semibold">{tx(restore?'Restaurar hotel':'Archivar hotel')}: {hotel.name}</h2>
    <div id="hotel-lifecycle-effects" className="mt-4 space-y-3 text-sm leading-6">
      <p>{tx(restore?'Recupera el estado anterior del hotel y el acceso según los permisos actuales. No reactiva accesos deshabilitados ni acepta invitaciones.':'Suspende el acceso operativo al hotel. Conserva los datos, las asignaciones, las conexiones y los estados de conversaciones, reservas y tickets. No elimina datos.')}</p>
      <p>{tx('La actividad automática y los conectores quedan suspendidos incluso después de restaurar. No se reencolan mensajes ni se reanudan envíos. Su reanudación requiere una revisión administrativa independiente.')}</p>
      <p>{tx('Las acciones ya aceptadas por un proveedor no pueden cancelarse retroactivamente.')}</p>
      {restore?<p>{tx('Los archivos antiguos sin información previa o con conflictos requieren revisión; no se recuperan por suposición.')}</p>:null}
    </div>
    {error?<p role="alert" className="mt-4 text-sm text-red-700">{tx(error)}</p>:null}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button ref={cancel} type="button" disabled={busy} onClick={onClose} className={ui.button(isLight,'secondary')}>{tx('Cancelar')}</button>
      <button type="button" disabled={busy} onClick={submit} className={ui.button(isLight,'primary')}>{tx(busy?'Guardando…':restore?'Confirmar restauración':'Confirmar archivado')}</button>
    </div>
  </dialog>;
}
