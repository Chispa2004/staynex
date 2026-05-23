import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const AI_MODE = {
  ACTIVE: 'ai_active',
  HUMAN_TAKEOVER: 'human_takeover'
};

const safeMetadata = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const actorFromContext = ({ user, hotelUser }) => ({
  user_id: user?.id || hotelUser?.user_id || null,
  email: user?.email || hotelUser?.email || null,
  role: hotelUser?.role || null
});

export async function POST(request) {
  try {
    const {
      supabase,
      hotel,
      hotelUser,
      role,
      platformRole,
      user
    } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'inbox')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (platformRole === 'support') {
      return NextResponse.json({ error: 'Support sessions are read-only by default' }, { status: 403 });
    }

    const body = await request.json();
    const conversationId = body.conversationId;
    const action = body.action === 'resume' ? 'resume' : 'takeover';
    const reason = String(body.reason || '').trim() || null;

    if (!conversationId || !hotel?.id) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, hotel_id')
      .eq('id', conversationId)
      .eq('hotel_id', hotel.id)
      .maybeSingle();

    if (conversationError) {
      throw conversationError;
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found in active workspace' }, { status: 404 });
    }

    const { data: existingState, error: stateLookupError } = await supabase
      .from('conversation_ai_state')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (stateLookupError) {
      throw stateLookupError;
    }

    const now = new Date().toISOString();
    const existingMetadata = safeMetadata(existingState?.state_metadata);
    const previousTakeover = safeMetadata(existingMetadata.human_takeover);
    const actor = actorFromContext({ user, hotelUser });
    const takeoverMetadata = action === 'takeover'
      ? {
        ...previousTakeover,
        activated_by: actor,
        activated_at: now,
        resumed_by: null,
        resumed_at: null,
        reason
      }
      : {
        ...previousTakeover,
        resumed_by: actor,
        resumed_at: now,
        resume_reason: reason
      };
    const nextMode = action === 'takeover' ? AI_MODE.HUMAN_TAKEOVER : AI_MODE.ACTIVE;
    const nextMetadata = {
      ...existingMetadata,
      conversation_ai_mode: nextMode,
      human_takeover: takeoverMetadata,
      last_human_control_event: {
        action,
        at: now,
        by: actor,
        reason
      }
    };
    const payload = {
      hotel_id: hotel.id,
      conversation_id: conversationId,
      current_intent: existingState?.current_intent || 'manual_control',
      previous_intent: existingState?.previous_intent || null,
      intent_confidence: existingState?.intent_confidence || 1,
      last_offer_type: existingState?.last_offer_type || null,
      last_offer_sent_at: existingState?.last_offer_sent_at || null,
      last_ai_response: existingState?.last_ai_response || null,
      ai_summary: existingState?.ai_summary || null,
      ai_reasoning: existingState?.ai_reasoning || null,
      openai_enhanced: Boolean(existingState?.openai_enhanced),
      sentiment: existingState?.sentiment || 'neutral',
      escalation_level: action === 'takeover' ? 'reception_required' : existingState?.escalation_level || 'ai_handled',
      state_metadata: nextMetadata,
      updated_at: now
    };

    const { data: savedState, error: upsertError } = await supabase
      .from('conversation_ai_state')
      .upsert(payload, { onConflict: 'conversation_id' })
      .select('*')
      .single();

    if (upsertError) {
      throw upsertError;
    }

    console.info(action === 'takeover' ? 'takeover_activated' : 'takeover_resumed', {
      hotelId: hotel.id,
      conversationId,
      action,
      actor: actor.email || actor.user_id || actor.role,
      reason
    });

    return NextResponse.json({
      conversationId,
      conversation_ai_mode: nextMode,
      aiState: savedState
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Could not update takeover mode' },
      { status: 500 }
    );
  }
}
