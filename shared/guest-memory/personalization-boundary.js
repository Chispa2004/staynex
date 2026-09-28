// Pure projections shared by server loaders and client presentation. Only an
// explicit server-side enabled value permits reusable personal context.
const pick = (source, fields) => Object.fromEntries(fields
  .filter(key => source?.[key] !== undefined).map(key => [key, source[key]]));

export const operationalStayContext = (context, enabled = false) => {
  if (!context || enabled === true) return context;
  const result = pick(context, [
    'id', 'hotel_id', 'guest_id', 'reservation_id', 'room_number', 'room_type',
    'rate_plan', 'arrival_date', 'departure_date', 'checked_in_at', 'checked_out_at',
    'nights', 'adults', 'children', 'language', 'country', 'stay_phase',
    'upgrade_eligible', 'late_checkout_eligible', 'last_updated_at'
  ]);
  if (context.raw_payload) result.raw_payload = pick(context.raw_payload,
    ['source', 'pms_provider', 'pms_reservation_id', 'status']);
  return result;
};

export const operationalPmsContext = (context, enabled = false) => {
  if (!context || enabled === true) return context;
  const result = pick(context, ['stayPhase', 'stay_phase', 'roomStatus', 'occupancy',
    'upgradeEligible', 'lateCheckoutEligible', 'operationalWarnings']);
  if (context.guestStayContext) result.guestStayContext = operationalStayContext(context.guestStayContext);
  if (context.recommendedActions) result.recommendedActions = context.recommendedActions
    .filter(action => ['offer_late_checkout', 'offer_upgrade', 'check_room_status_before_reply', 'escalate_to_maintenance'].includes(action));
  if (context.hotelSummary) result.hotelSummary = pick(context.hotelSummary,
    ['occupancy', 'rooms', 'upgradeOpportunities', 'lateCheckoutEligible']);
  return result;
};
