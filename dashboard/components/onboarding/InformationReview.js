'use client';
import {useEffect,useState} from 'react';
import {getAuthHeaders} from '@/lib/auth-headers';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {ui} from '@/lib/ui/styles';
export function InformationReview({hotelId,isLight,canManage,onSaved}) {
 const {tx}=useDashboardLanguage();const [data,setData]=useState(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function request(write=false){
  setBusy(true);setError('');
  try{const r=await fetch('/api/onboarding/information-review',{method:write?'POST':'GET',headers:{...await getAuthHeaders(),'Content-Type':'application/json'},...(write?{body:JSON.stringify({hash:data?.hash})}:{})});
   const body=await r.json();if(!r.ok)throw new Error(body.error);setData(body);if(write)onSaved?.();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 useEffect(()=>{setData(null);request();},[hotelId]);
 return <section className="space-y-3 mt-4">
  <p>{tx('Revisa en Información del hotel los contactos, horarios, políticas, servicios e instrucciones de llegada. No añadas datos supuestos.')}</p>
  <p>{tx(data?.reviewed?'Información revisada':'Información pendiente de revisión')}</p>
  {error&&<p role="alert">{tx(error)}</p>}
  <button type="button" disabled={busy} className={ui.button(isLight,'secondary')} onClick={()=>request()}>{tx('Actualizar estado de revisión')}</button>
  {canManage&&<button type="button" disabled={busy||!data?.count||data.reviewed} className={ui.button(isLight,'secondary')} onClick={()=>request(true)}>{tx('Confirmo que he revisado la información guardada')}</button>}
 </section>;
}
