'use client';

import { Search } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { LOCAL_KNOWLEDGE_CATEGORIES } from '@/lib/local-knowledge-constants';

const audienceOptions = ['all', 'family', 'romantic', 'vip', 'business', 'kids', 'local', 'rainy_day'];
const weatherOptions = ['all', 'rainy', 'sunny', 'windy', 'indoor'];

export const KnowledgeFilters = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  audience,
  onAudienceChange,
  weather,
  onWeatherChange,
  status,
  onStatusChange
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border p-4', ui.surface(isLight))}>
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_160px_140px_140px]">
        <label className={cn('flex items-center gap-2 rounded-lg border px-3', isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#0b1019]')}>
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search places, tags, tips..."
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
          />
        </label>

        <select value={category} onChange={(event) => onCategoryChange(event.target.value)} className={ui.input(isLight)}>
          <option value="all">All categories</option>
          {LOCAL_KNOWLEDGE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <select value={audience} onChange={(event) => onAudienceChange(event.target.value)} className={ui.input(isLight)}>
          {audienceOptions.map((item) => <option key={item} value={item}>{item === 'all' ? 'All audiences' : item}</option>)}
        </select>

        <select value={weather} onChange={(event) => onWeatherChange(event.target.value)} className={ui.input(isLight)}>
          {weatherOptions.map((item) => <option key={item} value={item}>{item === 'all' ? 'Any weather' : item}</option>)}
        </select>

        <select value={status} onChange={(event) => onStatusChange(event.target.value)} className={ui.input(isLight)}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="featured">Featured</option>
          <option value="indoor">Indoor</option>
        </select>
      </div>
    </section>
  );
};
