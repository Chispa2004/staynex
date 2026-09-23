import { hotelFormInput, validateHotelFields } from '../../shared/onboarding/hotel-fields.js';

export const hasPendingHotelCreation = (mode,actorId) => {
  if(typeof window==='undefined' || !actorId)return false;
  try { return Boolean(window.sessionStorage.getItem('staynex:hotel-creation:'+mode+':'+actorId)); } catch { return false; }
};

// Keep the operation key across transient failures, remounts and lost responses.
// Only a confirmed result or a validation rejection (no write) releases it.
export const submitHotelCreation = async ({mode,form,headers,actorId,recover=false,fetchImpl=fetch,storage=window.sessionStorage,uuid=()=>crypto.randomUUID()}) => {
  if(!actorId) throw new Error('No se pudo confirmar la sesión. Vuelve a cargar antes de crear el hotel.');
  const slot='staynex:hotel-creation:'+mode+':'+actorId;
  const raw=storage.getItem(slot);
  const pending=raw?JSON.parse(raw):null;
  const body=recover && pending ? pending.body : validateHotelFields(hotelFormInput(form,{creating:true}),{creating:true,platform:mode==='platform'});
  if(pending && JSON.stringify(pending.body)!==JSON.stringify(body)) {
    throw Object.assign(new Error('Hay un alta pendiente con otros datos. Recupera su resultado antes de iniciar otra.'),{needsRecovery:true});
  }
  const key=pending?.key||uuid();
  storage.setItem(slot,JSON.stringify({key,body}));
  try {
    const response=await fetchImpl(mode==='platform'?'/api/platform/hotels':'/api/workspaces',{
      method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)
    });
    const result=await response.json();
    if(!response.ok) {
      if(response.status===422) storage.removeItem(slot);
      throw Object.assign(new Error(result.error||'No se pudo confirmar el alta. Reintenta.'),{fields:result.fields});
    }
    if(!result.ok || !result.hotel?.id || result.hotelUser?.hotel_id!==result.hotel.id || result.state?.hotel_id!==result.hotel.id)
      throw new Error('Respuesta de alta incompleta. Reintenta la misma operación.');
    storage.removeItem(slot);
    return result;
  } catch(error) {
    error.needsRecovery=Boolean(storage.getItem(slot));
    throw error;
  }
};

export const confirmedOnboardingResult = (body,hotelId,complete) => {
  if(body?.ok!==true || body.hotel?.id!==hotelId || body.state?.hotel_id!==hotelId || !body.state.id
    || (complete && (body.state.onboarding_completed!==true || !body.state.onboarding_completed_at || body.redirectHref!=='/dashboard/health')))
    throw new Error('No se pudo confirmar el progreso guardado. Reintenta sin salir del asistente.');
  return body;
};
