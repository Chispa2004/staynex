import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const isMissingTable = (error, tableName) => (
  error?.message?.includes(tableName)
  || error?.details?.includes(tableName)
  || error?.hint?.includes(tableName)
);

const ensureConversion = async ({ supabase, hotelId, offer, status }) => {
  const { data: existing, error: existingError } = await supabase
    .from('upsell_conversions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('conversation_id', offer.conversation_id)
    .eq('upsell_type', offer.offer_type)
    .eq('source', 'ai_offer')
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingTable(existingError, 'upsell_conversions')) return null;
    throw existingError;
  }

  const now = new Date().toISOString();
  const record = {
    hotel_id: hotelId,
    guest_id: offer.guest_id,
    reservation_id: offer.reservation_id,
    conversation_id: offer.conversation_id,
    upsell_type: offer.offer_type,
    source: 'ai_offer',
    status,
    estimated_amount: offer.suggested_price || 0,
    currency: offer.currency || 'EUR',
    notes: `AI offer ${offer.id}`,
    updated_at: now
  };

  if (status === 'sent') {
    record.offer_sent_at = now;
  }

  if (status === 'accepted') {
    record.offer_sent_at = existing?.offer_sent_at || now;
    record.accepted_at = now;
  }

  const query = existing?.id
    ? supabase.from('upsell_conversions').update(record).eq('id', existing.id)
    : supabase.from('upsell_conversions').insert(record);
  const { data, error } = await query.select('*').single();

  if (error) {
    if (isMissingTable(error, 'upsell_conversions')) return null;
    throw error;
  }

  return data;
};

export async function PATCH(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'upsells')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const body = await request.json();
    const { offerId, action } = body;

    if (!hotel?.id || !offerId || !['send', 'accept', 'reject', 'escalate'].includes(action)) {
      return NextResponse.json({ error: 'Invalid AI offer action' }, { status: 400 });
    }

    const { data: offer, error: offerError } = await supabase
      .from('ai_offers')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('id', offerId)
      .maybeSingle();

    if (offerError) throw offerError;

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updates = { updated_at: now };
    let conversionStatus = null;

    if (action === 'send') {
      updates.status = 'sent';
      conversionStatus = 'sent';
    }

    if (action === 'accept') {
      updates.status = 'accepted';
      updates.accepted_at = now;
      conversionStatus = 'accepted';
    }

    if (action === 'reject') {
      updates.status = 'rejected';
      updates.rejected_at = now;
      conversionStatus = 'rejected';
    }

    if (action === 'escalate') {
      updates.metadata = {
        ...(offer.metadata || {}),
        escalated_to_reception: true,
        escalated_at: now
      };
    }

    const { data: updatedOffer, error: updateError } = await supabase
      .from('ai_offers')
      .update(updates)
      .eq('id', offer.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    const conversion = conversionStatus
      ? await ensureConversion({
        supabase,
        hotelId: hotel.id,
        offer: updatedOffer,
        status: conversionStatus
      })
      : null;

    return NextResponse.json({
      offer: updatedOffer,
      conversion
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
