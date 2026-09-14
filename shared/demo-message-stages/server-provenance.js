// Server-only identity namespace shared with the SQL generator. Never classify
// external operations from browser flags, mutable metadata, names or phone alone.
import { createHash } from 'node:crypto';

export const DEMO_MESSAGE_STAGES_MARKER = 'staynex_message_stages_v1';
export const demoMessageStageId = (hotelId, slot, entity) => {
  const hex = createHash('sha256').update([DEMO_MESSAGE_STAGES_MARKER, hotelId.toLowerCase(), slot, entity].join(':')).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
};

// Call with identities loaded/authorized by the server. These reserved identities
// stay blocked even if optional metadata or the recipient is subsequently edited.
// This is a deny-only check: matching never grants access or bypasses authorization.
export const isDemoMessageStagesContext = ({ hotelId, guestId, reservationId, conversationId, messageId } = {}) => {
  if (typeof hotelId !== 'string' || !hotelId) return false;
  const identities = { guest: guestId, reservation: reservationId, conversation: conversationId, message: messageId };
  return ['ana', 'carlos', 'lucia'].some(slot => Object.entries(identities)
    .some(([entity, id]) => typeof id === 'string' && id === demoMessageStageId(hotelId, slot, entity)));
};

export const isDemoMessageStagesReservation = (row = {}) => isDemoMessageStagesContext({
  hotelId: row.hotel_id, reservationId: row.id, guestId: row.guest_id
});

export const demoExternalOperationError = () => Object.assign(
  new Error('Ejemplo simulado: las operaciones externas están bloqueadas. Puedes consultar el mensaje y cambiar su atención.'),
  { code: 'demo_external_blocked', statusCode: 409 }
);
