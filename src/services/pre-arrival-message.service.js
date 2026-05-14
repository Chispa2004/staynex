const formatGuestName = (reservation) => reservation?.guest_name?.split(' ')[0] || 'there';

export const generate7DayPreArrivalMessage = (reservation) => {
  const guestName = formatGuestName(reservation);
  const arrivalDate = reservation?.arrival_date || 'your arrival date';
  const roomType = reservation?.room_type ? ` Your room type is ${reservation.room_type}.` : '';
  const boardBasis = reservation?.board_basis ? ` Your board basis is ${reservation.board_basis}.` : '';

  return [
    `Hola ${guestName} \u{1F44B}`,
    `Estamos deseando recibirte el ${arrivalDate}.`,
    `${roomType}${boardBasis}`,
    'Necesitas parking, transfer o recomendaciones?'
  ].filter(Boolean).join('\n');
};

export const generate1DayPreArrivalMessage = (reservation) => {
  const guestName = formatGuestName(reservation);
  const roomType = reservation?.room_type ? ` Hemos preparado tu reserva ${reservation.room_type}.` : '';

  return [
    `Hola ${guestName} \u{1F60A}`,
    'Tu llegada es manana.',
    `${roomType}`,
    'Puedes escribirnos directamente por este chat para cualquier cosa.'
  ].filter(Boolean).join('\n');
};
