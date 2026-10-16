import {randomBytes, createHash} from 'node:crypto';
export const newInvitationToken = () => randomBytes(32).toString('hex');
export const invitationHash = token => {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('Enlace no válido.'),{status:400});
  return createHash('sha256').update(token).digest('hex');
};
export async function invitationIdentity(supabase, request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error('Inicia sesión para continuar.'),{status:401});
  const {data,error}=await supabase.auth.getUser(token);
  if(error || !data?.user) throw Object.assign(new Error('Sesión no válida.'),{status:401});
  return data.user;
}
export async function invitationOperation({supabase,user,body}) {
  if(Object.keys(body).some(key=>!['token','accept'].includes(key)) || typeof body.accept!=='boolean')
    throw Object.assign(new Error('Petición no válida.'),{status:400});
  if(!user.email_confirmed_at) throw Object.assign(new Error('Verifica el correo de tu cuenta antes de aceptar.'),{status:403});
  const {data,error}=await supabase.rpc('accept_hotel_invitation_v1',{p_actor:user.id,p_hash:invitationHash(body.token),p_accept:body.accept});
  if(error || !data?.hotelId) throw Object.assign(new Error('La invitación no está disponible para esta cuenta. Comprueba el correo destinatario o pide un enlace nuevo a Staynex.'),{status:error?.code==='42501'?403:503});
  return data;
}
