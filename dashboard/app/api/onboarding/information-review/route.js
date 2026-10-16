import {NextResponse} from 'next/server';
import {getCurrentHotelForRequest} from '@/lib/current-hotel';
import {canAccess} from '@/lib/permissions';
async function handle(request,write) {
 try {
  const c=await getCurrentHotelForRequest(request,{readOnly:true});
  if(c.fallback||!c.hotel?.id||!canAccess(c.role,write?'knowledge_base_manage':'knowledge_base'))return NextResponse.json({error:'Acceso no autorizado.'},{status:403});
  const body=write?await request.json():{};
  if(write&&!/^[0-9a-f]{64}$/.test(body.hash||''))return NextResponse.json({error:'Vuelve a cargar la información antes de revisarla.'},{status:400});
  const {data,error}=await c.supabase.rpc('hotel_information_review_v1',{p_hotel:c.hotel.id,p_actor:write?c.user.id:null,p_expected:write?body.hash:null});
  if(error)throw error;
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'No se pudo registrar la revisión o la información ha cambiado. Recarga y revisa de nuevo.'},{status:409});}
}
export const GET=request=>handle(request,false);
export const POST=request=>handle(request,true);
