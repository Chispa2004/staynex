import { daysBetweenDates, determineStayPhase } from './pms-checkin.service.js';
import { detectLowOccupancy, detectHighOccupancy } from './pms-occupancy.service.js';

const normalize = (value) => String(value || '').trim().toLowerCase();

export const detectVipGuest = ({ reservation = {}, guestMemory = [] } = {}) => {
  const text = normalize([
    reservation.room_type,
    reservation.rate_plan,
    reservation.notes,
    reservation.guest_name,
    ...guestMemory.map((item) => `${item.memory_key || ''} ${item.memory_value || ''}`)
  ].join(' '));
  let score = 15;

  if (/vip|suite|premium|executive|presidential|luxury/.test(text)) score += 45;
  if (/anniversary|honeymoon|cumple|birthday|celebration/.test(text)) score += 15;
  if (/repeat|returning|loyal|high_spender/.test(text)) score += 20;
  if (Number(reservation.adults || 0) >= 3) score += 5;

  return Math.min(100, score);
};

export const detectUpgradeOpportunity = ({ reservation = {}, occupancy = null } = {}) => {
  const roomType = normalize(reservation.room_type);
  const status = normalize(reservation.status);

  if (status === 'checked_out' || status === 'completed' || status === 'cancelled') {
    return false;
  }

  if (/suite|premium|presidential|deluxe/.test(roomType)) {
    return false;
  }

  if (detectHighOccupancy(occupancy)) {
    return false;
  }

  return true;
};

export const detectLateCheckoutEligibility = ({ reservation = {}, occupancy = null, now = new Date() } = {}) => {
  const daysToDeparture = daysBetweenDates(now, reservation.departure_date);

  if (![0, 1].includes(daysToDeparture)) {
    return false;
  }

  return !detectHighOccupancy(occupancy);
};

export const calculateGuestRevenuePotential = ({
  reservation = {},
  occupancy = null,
  guestMemory = [],
  now = new Date()
} = {}) => {
  let potential = 0;
  const vipScore = detectVipGuest({ reservation, guestMemory });

  if (detectUpgradeOpportunity({ reservation, occupancy })) potential += 120;
  if (detectLateCheckoutEligibility({ reservation, occupancy, now })) potential += 45;
  if (vipScore >= 70) potential += 80;
  if (detectLowOccupancy(occupancy)) potential += 35;

  return potential;
};

export const detectRevenueSignals = ({
  reservation = {},
  occupancy = null,
  guestMemory = [],
  now = new Date()
} = {}) => {
  const stayPhase = determineStayPhase(reservation, now);
  const vipScore = detectVipGuest({ reservation, guestMemory });
  const upgradeEligible = detectUpgradeOpportunity({ reservation, occupancy });
  const lateCheckoutEligible = detectLateCheckoutEligibility({ reservation, occupancy, now });
  const memoryText = normalize(guestMemory.map((item) => `${item.memory_key} ${item.memory_value}`).join(' '));

  return {
    stayPhase,
    vipScore,
    revenuePotential: calculateGuestRevenuePotential({ reservation, occupancy, guestMemory, now }),
    upgradeEligible,
    lateCheckoutEligible,
    transferLikely: stayPhase === 'pre_arrival' || /transfer|airport|taxi|traslado|aeropuerto/.test(memoryText),
    experienceLikely: /experience|tour|excursion|actividad|spa|hammam|restaurant/.test(memoryText) || vipScore >= 60
  };
};
