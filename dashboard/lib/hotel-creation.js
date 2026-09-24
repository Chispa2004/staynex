import { assertCreationKey, validateHotelFields } from '../../shared/onboarding/hotel-fields.js';

export const createHotelAtomically = async ({supabase,user,body,key,mode}) => {
  const data=validateHotelFields(body,{creating:true,platform:mode==='platform'});
  assertCreationKey(key);
  const {admin_email,...hotel}=data;
  const payload={...hotel,brand_name:hotel.brand_name||hotel.name,default_language:hotel.default_language||'es',
    brand_color:hotel.brand_color||'#34d399',secondary_color:hotel.secondary_color||'#0f766e',
    subscription_plan:mode==='workspace'?'workspace_trial':hotel.subscription_plan||'starter'};
  const {data:result,error}=await supabase.rpc('create_hotel_onboarding_v1',{
    p_actor:user.id,p_key:key,p_mode:mode,p_hotel:payload,p_email:(mode==='platform'?admin_email:user.email).toLowerCase()
  });
  if(error) {
    const conflict=['22023','23505','P0002'].includes(error.code);
    throw Object.assign(new Error(conflict?'La clave de alta ya se usó con otros datos o el resultado requiere revisión. Conserva la clave y revisa el alta existente.':'No se pudo confirmar el alta. Reintenta con la misma operación; no se creará otro hotel.'),{status:conflict?409:503});
  }
  if(!result?.hotel?.id || result.hotelUser?.hotel_id!==result.hotel.id || result.state?.hotel_id!==result.hotel.id)
    throw Object.assign(new Error('Respuesta de alta incompleta. Reintenta con la misma operación.'),{status:503});
  return {ok:true,...result,role:result.hotelUser.role};
};
