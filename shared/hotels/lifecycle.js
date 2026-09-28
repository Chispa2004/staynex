// Archive is a hotel boundary, never a rewrite of the records it owns.
export const isArchivedHotel = (hotel = {}) => Boolean(hotel?.deleted_at || hotel?.archived_at
  || hotel?.status === 'archived' || hotel?.metadata?.archived
  || String(hotel?.name || '').endsWith(' (archived)'));
export const hotelOperationsHeld = (hotel = {}) => isArchivedHotel(hotel)
  || hotel?.metadata?.archive_operational_hold === true;
export const assertHotelOperationsAvailable = (hotel) => {
  if (!hotel?.id || hotelOperationsHeld(hotel)) {
    const error = new Error('Hotel archivado o con operaciones suspendidas. Se requiere revisión administrativa.');
    error.status = 409; error.code = 'hotel_operations_held'; throw error;
  }
};
