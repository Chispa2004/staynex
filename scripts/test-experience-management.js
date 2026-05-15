import assert from 'node:assert/strict';
import { detectExperienceOpportunities } from '../src/services/experience-intelligence.service.js';

const hotelExperiences = [
  {
    id: 'exp-mallorca-catamaran',
    title: 'Catamaran Sunset',
    slug: 'catamaran-sunset',
    description: 'Sunset catamaran experience along Mallorca calas.',
    category: 'boat_tour',
    tags: ['catamaran', 'sunset', 'sea'],
    target_guest_types: ['couples', 'family'],
    price: 120,
    commission_percentage: 12,
    partner_name: 'Mallorca Sea Concierge',
    priority: 90,
    active: true
  },
  {
    id: 'exp-family-water-park',
    title: 'Family Water Park',
    slug: 'family-water-park',
    description: 'Family-friendly water park plan for children.',
    category: 'family',
    tags: ['kids', 'water park'],
    target_guest_types: ['family', 'kids'],
    price: 45,
    priority: 70,
    active: true
  },
  {
    id: 'exp-hidden-other-hotel',
    title: 'Other hotel yacht',
    slug: 'other-yacht',
    description: 'This should not be present in another hotel catalog.',
    category: 'luxury',
    tags: ['yacht'],
    target_guest_types: ['vip'],
    price: 350,
    priority: 100,
    active: false
  }
];

const base = {
  hotel: {
    id: 'hotel-mallorca',
    name: 'Hotel Riu Mallorca',
    description: 'Mallorca beach hotel.'
  },
  hotelKnowledge: [],
  hotelExperiences,
  reservation: {
    id: 'reservation-1',
    arrival_date: '2026-07-15',
    departure_date: '2026-07-18'
  },
  guestMemory: [],
  conversationState: {},
  risk: { hasRisk: false },
  sentiment: 'neutral',
  language: 'en'
};

const boat = detectExperienceOpportunities({
  ...base,
  message: 'Do you recommend a catamaran or beaches?'
});
assert.equal(boat.primaryOpportunity.metadata.hotel_experience_id, 'exp-mallorca-catamaran');
assert.equal(boat.primaryOpportunity.suggestedPrice, 120);
assert.equal(boat.primaryOpportunity.metadata.partner_name, 'Mallorca Sea Concierge');

const family = detectExperienceOpportunities({
  ...base,
  message: 'We travel with children, any activities?'
});
assert.equal(family.opportunities.some((item) => item.metadata.hotel_experience_id === 'exp-family-water-park'), true);

const inactive = detectExperienceOpportunities({
  ...base,
  message: 'We want a yacht'
});
assert.equal(inactive.opportunities.some((item) => item.metadata.hotel_experience_id === 'exp-hidden-other-hotel'), false);

const complaint = detectExperienceOpportunities({
  ...base,
  message: 'The room is dirty and this is unacceptable',
  risk: { hasRisk: true },
  sentiment: 'negative'
});
assert.notEqual(complaint.primaryOpportunity?.timing.allowed, true);

console.log(JSON.stringify({
  ok: true,
  cases: [
    'catalog experience selected',
    'catalog price and partner metadata',
    'family target scoring',
    'inactive experience ignored',
    'complaint blocks experience selling'
  ]
}, null, 2));
