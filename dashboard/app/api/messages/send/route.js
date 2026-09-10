import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { getInternalApiHeaders } from '@/lib/internal-api';
import { canAccess } from '@/lib/permissions';
import { validateManualSend, manualDelivery, manualDeliveryText, normalizeManualDelivery } from '../../../../../shared/manual-send/contract.js';

const getBackendUrl = () => (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3000'
);
const rejectManualSend = (status, reason = 'access_denied') => {
  const delivery = manualDelivery('failed', reason);
  return NextResponse.json({ delivery, error: manualDeliveryText(delivery) }, { status });
};

export async function POST(request) {
  let dispatched = false;
  try {
    const { supabase, hotel, hotelUser, role, platformRole, fallback, accessDenied, accessDeniedReason } = await getCurrentHotelForRequest(request);

    if (accessDenied || fallback || !hotel?.id) {
      const status = ['missing_session', 'invalid_session'].includes(accessDeniedReason) ? 401 : 403;
      return rejectManualSend(status);
    }

    if (!canAccess(role, 'inbox')) {
      return rejectManualSend(403);
    }

    if (platformRole === 'support') {
      return rejectManualSend(403);
    }

    const body = await request.json();
    const validated = validateManualSend(body);
    const conversationId = validated.conversationId;

    if (!conversationId || !hotel?.id) {
      return rejectManualSend(400, 'invalid_conversation');
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('hotel_id', hotel.id)
      .maybeSingle();

    if (conversationError) {
      throw conversationError;
    }

    if (!conversation) {
      return rejectManualSend(404);
    }

    const headers = getInternalApiHeaders({ 'Content-Type': 'application/json' });
    dispatched = true;
    const response = await fetch(`${getBackendUrl()}/messages/send`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        conversationId,
        message: validated.message,
        attemptId: validated.attemptId,
        hotelId: hotel.id,
        staffLanguage: body.staffLanguage || hotelUser?.preferred_translation_language || hotel?.default_language || 'es'
      })
    });

    const payload = await response.json();

    const delivery = normalizeManualDelivery(payload.delivery);
    return NextResponse.json({ message: payload.message || null, delivery, error: delivery.status === 'failed' ? manualDeliveryText(delivery) : undefined }, {
      status: response.status
    });
  } catch (error) {
    const delivery = dispatched ? manualDelivery('unknown', 'response_unknown')
      : manualDelivery('failed', error.manualSendSafe ? error.code : error instanceof SyntaxError ? 'invalid_body' : 'persistence_failed', !error.manualSendSafe && !(error instanceof SyntaxError));
    return NextResponse.json(
      { delivery, error: manualDeliveryText(delivery) },
      { status: dispatched ? 504 : error.statusCode || (error instanceof SyntaxError ? 400 : 503) }
    );
  }
}
