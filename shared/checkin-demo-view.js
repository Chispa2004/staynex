// Presentation scope only. Never grants access or changes operational provenance.
export const CHECKIN_DEMO_HOTEL_ID = '1ef60a40-b65f-4bff-9bd3-22654e5029f2';
export const isCheckinDemoHotel = hotel => hotel?.id === CHECKIN_DEMO_HOTEL_ID && hotel.slug === 'hotel-demo-checkin';

// Closed demo threads remain stored for ticket/source traceability. Explicit
// conversation links still load them; only the current demo directory excludes them.
export const currentDemoConversation = (conversation, hotel) => !isCheckinDemoHotel(hotel)
  || conversation.status !== 'closed';
