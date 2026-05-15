'use client';

import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { ui } from '@/lib/ui/styles';

const categoryTones = {
  boat_tour: 'sky',
  beach_club: 'sky',
  restaurant: 'amber',
  nightlife: 'violet',
  romantic: 'violet',
  family: 'emerald',
  kids: 'emerald',
  culture: 'slate',
  golf: 'emerald',
  wellness: 'emerald',
  spa: 'emerald',
  transfer: 'sky',
  adventure: 'orange',
  luxury: 'violet',
  indoor: 'slate',
  rainy_day: 'slate'
};

export const categoryLabels = {
  boat_tour: 'Boat tour',
  beach_club: 'Beach club',
  restaurant: 'Restaurant',
  nightlife: 'Nightlife',
  romantic: 'Romantic',
  family: 'Family',
  kids: 'Kids',
  culture: 'Culture',
  golf: 'Golf',
  wellness: 'Wellness',
  spa: 'Spa',
  transfer: 'Transfer',
  adventure: 'Adventure',
  luxury: 'Luxury',
  indoor: 'Indoor',
  rainy_day: 'Rainy day'
};

export const ExperienceCategoryBadge = ({ category }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <span className={ui.badge(isLight, categoryTones[category] || 'slate')}>
      {categoryLabels[category] || category}
    </span>
  );
};
