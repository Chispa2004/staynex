import {NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase';
import {invitationIdentity,invitationOperation} from '@/lib/access-invitations';
export async function POST(request) {
  try {
    const supabase=getSupabaseAdmin();
    const user=await invitationIdentity(supabase,request);
    const data=await invitationOperation({supabase,user,body:await request.json()});
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  } catch(error) {
    return NextResponse.json({error:error.status?error.message:'No se pudo comprobar la invitación. Reintenta.'},{status:error.status||503,headers:{'Cache-Control':'no-store'}});
  }
}
