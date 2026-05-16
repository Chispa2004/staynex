'use client';

import { Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { KnowledgeForm } from './KnowledgeForm';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const suggestions = [
  {
    title: 'Sunset rooftop',
    category: 'rooftop',
    tags: ['sunset', 'cocktails'],
    audience_tags: ['romantic', 'vip'],
    recommendation_contexts: ['sunset', 'dinner']
  },
  {
    title: 'Family beach',
    category: 'beach',
    tags: ['calm water', 'family'],
    audience_tags: ['family', 'kids'],
    recommendation_contexts: ['family', 'beach']
  },
  {
    title: 'Rainy day museum',
    category: 'museum',
    tags: ['culture', 'indoor'],
    audience_tags: ['family', 'couples'],
    recommendation_contexts: ['rainy_day'],
    indoor: true,
    weather_tags: ['rainy', 'indoor']
  }
];

export const QuickAddKnowledge = ({ canManage, onSubmit, saving }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(null);

  if (!canManage) {
    return null;
  }

  return (
    <section className={cn('rounded-xl border p-4', ui.surface(isLight))}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Quick add</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>Add a local recommendation in 30 seconds</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>Reception can capture insider tips without opening a complex CMS.</p>
        </div>
        <button type="button" onClick={() => { setPreset(null); setOpen((current) => !current); }} className={ui.button(isLight, 'primary')}>
          <Plus className="h-4 w-4" />
          Quick add
        </button>
      </div>

      {!open ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => {
                setPreset({
                  ...suggestion,
                  description: '',
                  short_description: '',
                  priority: 20,
                  active: true,
                  featured: true
                });
                setOpen(true);
              }}
              className={cn('rounded-lg border p-3 text-left text-sm transition', isLight ? 'border-slate-200 bg-slate-50 hover:bg-white' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]')}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-emerald-300" />
                {suggestion.title}
              </span>
              <span className={cn('mt-1 block text-xs', ui.text.muted(isLight))}>{suggestion.category}</span>
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-4">
          <KnowledgeForm
            item={preset}
            compact
            saving={saving}
            onSubmit={async (payload) => {
              await onSubmit(payload);
              setOpen(false);
              setPreset(null);
            }}
            onCancel={() => {
              setOpen(false);
              setPreset(null);
            }}
          />
        </div>
      ) : null}
    </section>
  );
};
