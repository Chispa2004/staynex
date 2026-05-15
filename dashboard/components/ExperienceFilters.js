'use client';

import { Search } from 'lucide-react';
import { categoryLabels } from './ExperienceCategoryBadge';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { ui } from '@/lib/ui/styles';

export const EXPERIENCE_CATEGORIES = [
  'boat_tour',
  'beach_club',
  'restaurant',
  'nightlife',
  'romantic',
  'family',
  'kids',
  'culture',
  'golf',
  'wellness',
  'spa',
  'transfer',
  'adventure',
  'luxury',
  'indoor',
  'rainy_day'
];

export const ExperienceFilters = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  status,
  onStatusChange
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const inputClass = ui.input(isLight);

  return (
    <section className={`rounded-xl border p-4 ${ui.surface(isLight)}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
        <label className="relative">
          <Search className={isLight ? 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400' : 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600'} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search experiences, partners, tags..."
            className={`${inputClass} w-full pl-9`}
          />
        </label>
        <select value={category} onChange={(event) => onCategoryChange(event.target.value)} className={inputClass}>
          <option value="all">All categories</option>
          {EXPERIENCE_CATEGORIES.map((item) => (
            <option key={item} value={item}>{categoryLabels[item] || item}</option>
          ))}
        </select>
        <select value={status} onChange={(event) => onStatusChange(event.target.value)} className={inputClass}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="vip">VIP only</option>
          <option value="indoor">Indoor</option>
        </select>
      </div>
    </section>
  );
};
