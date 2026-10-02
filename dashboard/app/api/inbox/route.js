import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { getInboxConversations } from '@/lib/inbox';
import { canAccess, canManageHumanTakeover } from '@/lib/permissions';
import { getPilotAiSafetyReadiness } from '../../../../shared/pilot/ai-safety.js';
import { parseMessageMetric, selectMessageMetric } from '../../../../shared/message-attention/metrics.js';
import { loadMessageMetrics } from '@/lib/message-metrics';

export async function GET(request) {
  try {
    const { supabase, hotel, hotelUser, fallback, role, user, platformRole, accessDenied } = await getCurrentHotelForRequest(request, {readOnly:true,includeDirectory:false});

    if (!user?.id || !hotel?.id || accessDenied || !canAccess(role, 'inbox')) {
      return NextResponse.json({ conversations: [], hotel, error: 'Access denied' }, { status: 403 });
    }
    const params=new URL(request.url).searchParams;
    const detailId=params.get('detail');
    if(detailId && !/^[0-9a-f-]{36}$/i.test(detailId))return NextResponse.json({error:'Conversación inválida'},{status:400});
    const filter=detailId ? null : parseMessageMetric(params);
    if (filter && filter.hotelId!==hotel.id) return NextResponse.json({error:'El filtro pertenece a otro hotel.'},{status:403});
    const metric=filter ? selectMessageMetric(await loadMessageMetrics({supabase,hotel,origin:filter.origin,date:filter.date || undefined}),filter) : null;
    const conversations = await getInboxConversations({
      supabase,
      hotel,
      hotelId: hotel?.id || null,
      conversationIds: detailId ? [detailId] : metric ? Object.keys(metric.byConversation) : null,
      includeDetails:params.get('view')!=='summary'
    });
    if (metric) {
      const threads=new Map(conversations.map(c=>[c.id,c]));
      const complete=Object.entries(metric.byConversation).every(([id,ids])=>{
        const thread=threads.get(id);
        return thread?.hotel_id===hotel.id && ids.every(messageId=>thread.messages.some(m=>m.id===messageId && m.hotel_id===hotel.id));
      });
      if (!complete) return NextResponse.json({error:'Los datos cambiaron durante la lectura. Actualiza para reintentar.'},{status:503});
    }

    return NextResponse.json({
      conversations,
      metric,
      hotel,
      hotelId: hotel?.id || null,
      actorId: user?.id || null,
      capabilities: {
        canManageOffers: Boolean(user?.id && !accessDenied && !fallback && platformRole !== 'support' && canAccess(role, 'upsells_manage')),
        canReply: Boolean(user?.id && hotel?.id && !accessDenied && !fallback && platformRole !== 'support' && canAccess(role, 'inbox')),
        canManageControl: Boolean(user?.id && hotel?.id && !accessDenied && canManageHumanTakeover({role,platformRole,fallback}))
      },
      pilotAiSafety: getPilotAiSafetyReadiness({ hotel, env: process.env }),
      staffLanguage: hotelUser?.preferred_translation_language || hotel?.default_language || 'es',
      fallback
    });
  } catch (error) {
    console.error('Inbox API failed', error);

    return NextResponse.json({
      conversations: [],
      hotel: null,
      error: error.message || 'Inbox lookup failed'
    }, { status: error.status || 500 });
  }
}
