// Offline replay of unedited, fictional provider outputs. No model or database calls.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluationCases } from './fixtures/guest-service-quality/cases.js';
import { finalizeServiceReply } from '../shared/guest-service/quality.js';

const raw = JSON.parse(fs.readFileSync(new URL('../docs/evidence/guest-service-quality-raw.json', import.meta.url), 'utf8'));
const replay = evaluationCases.map(input => {
  const sample = raw.find(r => r.id === input.id && r.phase === 'after-v3');
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  if (!sample || sample.error || sample.inputHash !== inputHash) throw Error(`Missing or changed sample: ${input.id}`);
  const ticket = sample.output.create_ticket ? {
    id: 'simulated-record', hotel_id: input.hotel.id, guest_id: input.guest.id,
    conversation_id: 'synthetic-conversation', category: sample.output.ticket.category
  } : null;
  const presented = finalizeServiceReply({
    primary: sample.output, ticket, hotel: input.hotel, hotelId: input.hotel.id,
    guestId: input.guest.id, conversationId: 'synthetic-conversation',
    language: input.conversationContext.language, emergency: sample.output.emergency,
    knownRoom: input.guest.current_room, context: input.conversationContext, message: input.message
  });
  return {id: input.id, inputHash, providerReply: sample.output.reply,
    applicationReply: presented.reply, simulatedPersistence: Boolean(ticket),
    scope: 'Final presentation only, not a full processGuestMessage execution'};
});
console.log(JSON.stringify(replay, null, 2));
