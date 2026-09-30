import {NextResponse} from 'next/server';
import {context, hotel, messageDb, onboarding} from '@/lib/lab-fixture';
import {buildHotelOperationalHealthSnapshot} from '@/lib/system-health';
import {HEALTH_SOURCES} from '@/lib/health-coverage';
import {PMS_PROVIDER_CATALOG} from '@/lib/pms-providers';
export const dynamic='force-dynamic';
export async function GET(request) {
  const p=new URL(request.url).pathname;
  let body={};
  if(p==='/api/current-hotel')body={...context,directoryDeferred:true};
  if(p==='/api/workspace-directory')body=context;
  if(p==='/api/onboarding/state')body=onboarding;
  if(p==='/api/tickets/stats')body={hotelId:hotel.id,stats:{urgentTickets:1}};
  if(p==='/api/pms-connections')body={ok:true,hotel,hotelId:hotel.id,role:'admin',canManage:true,providers:PMS_PROVIDER_CATALOG,connections:[]};
  if(p==='/api/health/hotel')body={ok:true,hotel,hotelId:hotel.id,role:'admin',health:buildHotelOperationalHealthSnapshot({hotel,sources:Object.fromEntries(HEALTH_SOURCES.map(key=>[key,{status:'complete',returned:0,total:0}]))})};
  return NextResponse.json(body);
}
export async function POST(request) {
  const body=await request.json();
  // Attention's existing read protocol uses POST; every mutation remains blocked.
  if(new URL(request.url).pathname==='/api/message-attention' && body.action==='read') {
    const {data}=await messageDb.rpc('staynex_attention_read_v1',{p_conversation:body.conversationId,p_ids:body.messageIds});
    return NextResponse.json({...data,canManage:false});
  }
  return NextResponse.json({error:'Laboratorio sin mutaciones ni proveedores'},{status:403});
}
