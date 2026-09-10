import crypto from 'node:crypto';
import { getSupabase } from './supabase.service.js';
import { sendManualWhatsAppMessage } from './twilio.service.js';
import { detectLanguage, translateForGuest } from './translation.service.js';
import { validateManualSend, manualSendError, manualDelivery, normalizeManualDelivery, classifyManualProviderError, classifyManualProviderResult, MANUAL_MESSAGE_MAX_LENGTH } from '../../shared/manual-send/contract.js';

export const createManualMessageSender = ({ getClient = getSupabase, send = sendManualWhatsAppMessage, translate = translateForGuest, detect = detectLanguage, newId = () => crypto.randomUUID() } = {}) => async (input) => {
  const { conversationId, message, staffLanguage = 'es', attemptId = newId() } = validateManualSend(input);
  const hotelId = input.hotelId;
  if (typeof hotelId !== 'string' || !hotelId.trim()) throw manualSendError('access_denied', 403);
  let client;
  try { client = getClient(); } catch { throw manualSendError('persistence_failed', 503, true); }
  const { data: conversation, error: conversationError } = await client.from('conversations')
    .select('id, hotel_id, guest_id').eq('id', conversationId).eq('hotel_id', hotelId).maybeSingle();
  if (conversationError) throw manualSendError('persistence_failed', 503, true);
  if (!conversation) throw manualSendError('access_denied', 404);
  const { data: guest, error: guestError } = await client.from('guests')
    .select('id, hotel_id, phone_number, preferred_language').eq('id', conversation.guest_id).eq('hotel_id', hotelId).maybeSingle();
  if (guestError) throw manualSendError('persistence_failed', 503, true);
  if (!guest || typeof guest.phone_number !== 'string' || !/^(whatsapp:)?\+[1-9]\d{6,14}$/.test(guest.phone_number)) throw manualSendError('recipient_unavailable', 400);

  const lookup = async () => {
    const { data, error } = await client.from('messages').select('*').eq('id', attemptId)
      .eq('hotel_id', hotelId).eq('conversation_id', conversationId).maybeSingle();
    if (error) throw manualSendError('persistence_failed', 503, true);
    return data;
  };
  const replay = (row) => {
    if (row.sender_type !== 'staff' || row.content !== message || row.metadata?.manual_send?.attempt_id !== attemptId) throw manualSendError('invalid_attempt', 409);
    return { message: row, delivery: normalizeManualDelivery(row.metadata.manual_send) };
  };
  const existing = await lookup();
  if (existing) return replay(existing); // Same operation is never sent twice.

  // Durable uncertainty is written BEFORE the provider boundary. A crash after
  // dispatch must never leave a row that invites a duplicate send.
  let metadata = { manual_send: manualDelivery('unknown', 'dispatch_unconfirmed', false, { attempt_id: attemptId }) };
  const record = { id: attemptId, hotel_id: hotelId, conversation_id: conversationId, sender_type: 'staff', content: message, metadata };
  const { data: created, error: insertError } = await client.from('messages').insert(record).select('*').single();
  if (insertError) {
    if (insertError.code === '23505') {
      const winner = await lookup();
      if (winner) return replay(winner);
      throw manualSendError('invalid_attempt', 409);
    }
    // No provider call has occurred. Never fall back to an insert without metadata.
    throw manualSendError('persistence_failed', 503, true);
  }
  if (!created) throw manualSendError('persistence_failed', 503, true);

  const finish = async (delivery) => {
    const savedDelivery = { ...delivery, attempt_id: attemptId, updated_at: new Date().toISOString() };
    const next = { ...metadata, manual_send: savedDelivery };
    let persisted = false;
    try {
      const { data, error } = await client.from('messages').update({ metadata: next }).eq('id', attemptId)
        .eq('hotel_id', hotelId).eq('conversation_id', conversationId).select('id').maybeSingle();
      persisted = !error && Boolean(data);
    } catch { /* Keep provider evidence even when persistence is unavailable. */ }
    try {
      await client.from('conversations').update({ last_message_at: created.created_at || new Date().toISOString() })
        .eq('id', conversationId).eq('hotel_id', hotelId);
    } catch { /* A conversation refresh failure cannot change the send result. */ }
    return { message: { ...created, metadata: next }, delivery: { ...savedDelivery, persisted } };
  };

  let outboundMessage;
  try {
    const guestLanguage = guest.preferred_language || 'es';
    const sourceLanguage = detect(message, staffLanguage);
    const translation = await translate({ hotelId, text: message, staffLanguage: sourceLanguage, guestLanguage });
    outboundMessage = translation.translatedText || message;
    if (typeof outboundMessage !== 'string' || !outboundMessage.trim() || outboundMessage.length > MANUAL_MESSAGE_MAX_LENGTH) {
      return finish(manualDelivery('failed', 'text_too_long'));
    }
    metadata = { ...metadata, translation_direction: 'staff_to_guest', guest_language: guestLanguage, staff_language: sourceLanguage, outbound_text: outboundMessage };
    const translatedFields = {
      original_language: sourceLanguage, translated_language: translation.translatedText ? translation.targetLanguage : null,
      translated_text: translation.translatedText || null, translation_provider: translation.provider || null,
      translation_confidence: translation.confidence ?? null
    };
    const prepare = values => client.from('messages').update(values).eq('id', attemptId)
      .eq('hotel_id', hotelId).eq('conversation_id', conversationId).select('id').maybeSingle();
    let prepared;
    try {
      prepared = await prepare({ metadata, ...translatedFields });
      if (prepared.error && Object.keys(translatedFields).some(field => prepared.error.message?.includes(field))) {
        prepared = await prepare({ metadata }); // metadata and hotel scope are never dropped.
      }
    } catch { return finish(manualDelivery('failed', 'persistence_failed', true)); }
    if (prepared.error || !prepared.data) return finish(manualDelivery('failed', 'persistence_failed', true));
    Object.assign(created, translatedFields);
  } catch {
    return finish(manualDelivery('failed', 'translation_failed', true));
  }
  let delivery;
  try {
    const providerResult = await send({ to: guest.phone_number, body: outboundMessage });
    delivery = classifyManualProviderResult(providerResult);
  } catch (error) {
    delivery = classifyManualProviderError(error);
  }
  return finish(delivery);
};

export const sendStaffMessage = createManualMessageSender();
