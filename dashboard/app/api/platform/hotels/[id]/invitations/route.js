import {NextResponse} from 'next/server';
import {getPlatformContext} from '@/lib/platform';
import {newInvitationToken,invitationHash,invitationIdentity} from '@/lib/access-invitations';
const response=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request,{params}) {
  try {
    const {supabase}=await getPlatformContext(request,{requireAdmin:true,readOnly:true});
    const {id:hotelId}=await params;
    const {data,error}=await supabase.from('hotel_access_invitations').select('id,assignment_id,email,role,expires_at,revoked_at,accepted_at,created_at').eq('hotel_id',hotelId).order('created_at',{ascending:false});
    if(error) throw error;
    return response({invitations:data});
  } catch(error) { return response({error:'No se pudo consultar las invitaciones.'},error.status||503); }
}
export async function POST(request,{params}) {
  try {
    const {supabase}=await getPlatformContext(request,{requireAdmin:true,readOnly:true});
    const user=await invitationIdentity(supabase,request);
    const {id:hotelId}=await params; const body=await request.json();
    if(!['replace','revoke'].includes(body.action) || !/^[a-f0-9-]{36}$/i.test(body.assignmentId||'')) return response({error:'Petición no válida.'},400);
    const token=body.action==='replace'?newInvitationToken():null;
    const {data,error}=await supabase.rpc('manage_hotel_invitation_v1',{p_actor:user.id,p_hotel:hotelId,p_assignment:body.assignmentId,p_hash:token?invitationHash(token):null});
    if(error) return response({error:'No se pudo gestionar esta invitación. Comprueba el estado del hotel y del acceso.'},error.code==='42501'?403:503);
    return response({...data,token});
  } catch(error) {return response({error:'No se pudo gestionar la invitación. Reintenta.'},error.status||503);}
}
