import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { getInboxConversations } from '@/lib/inbox';
import { canAccess, canManageHumanTakeover } from '@/lib/permissions';
import { getPilotAiSafetyReadiness } from '../../../../shared/pilot/ai-safety.js';

export async function GET(request) {
  try {
    const { supabase, hotel, hotelUser, fallback, role, user, platformRole, accessDenied } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'inbox')) {
      return NextResponse.json({ conversations: [], hotel, error: 'Access denied' }, { status: 403 });
    }
    const conversations = await getInboxConversations({
      supabase,
      hotel,
      hotelId: hotel?.id || null
    });

    return NextResponse.json({
      conversations,
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
    }, { status: 500 });
  }
}
