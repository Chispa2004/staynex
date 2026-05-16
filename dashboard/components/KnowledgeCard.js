'use client';

import { Edit3, ExternalLink, MapPin, Star, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

export const KnowledgeCard = ({
  item,
  canManage,
  busy = false,
  onEdit,
  onToggle,
  onDelete
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <article className={cn('overflow-hidden rounded-xl border transition hover:-translate-y-0.5', ui.surface(isLight))}>
      {item.image_url ? (
        <div className="h-36 overflow-hidden">
          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={ui.badge(isLight, 'sky')}>{item.category}</span>
              {item.featured ? <span className={ui.badge(isLight, 'amber')}><Star className="mr-1 h-3 w-3" />Featured</span> : null}
              {item.indoor ? <span className={ui.badge(isLight, 'violet')}>Indoor</span> : null}
              <span className={ui.badge(isLight, item.active ? 'emerald' : 'slate')}>{item.active ? 'Active' : 'Inactive'}</span>
            </div>
            <h2 className={cn('mt-3 text-lg font-semibold', ui.text.title(isLight))}>{item.title}</h2>
          </div>
          <span className={cn('rounded-full border px-2 py-1 text-xs font-semibold', isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.035] text-slate-400')}>
            P{item.priority || 0}
          </span>
        </div>

        <p className={cn('mt-3 line-clamp-3 text-sm', ui.text.body(isLight))}>
          {item.short_description || item.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(item.tags || []).slice(0, 5).map((tag) => <span key={tag} className={ui.badge(isLight, 'slate', true)}>{tag}</span>)}
          {(item.audience_tags || []).slice(0, 4).map((tag) => <span key={tag} className={ui.badge(isLight, 'emerald', true)}>{tag}</span>)}
          {(item.weather_tags || []).slice(0, 3).map((tag) => <span key={tag} className={ui.badge(isLight, 'sky', true)}>{tag}</span>)}
        </div>

        <div className={cn('mt-4 space-y-1 text-xs', ui.text.muted(isLight))}>
          {item.address ? (
            <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{item.address}</p>
          ) : null}
          {item.opening_hours ? <p>Hours: {item.opening_hours}</p> : null}
          {item.price_range ? <p>Price: {item.price_range}</p> : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {item.website_url ? (
            <a href={item.website_url} target="_blank" rel="noreferrer" className={ui.button(isLight, 'secondary')}>
              <ExternalLink className="h-4 w-4" />
              Website
            </a>
          ) : <span />}

          {canManage ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => onEdit(item)} disabled={busy} className={ui.iconButton(isLight, 'secondary')} title="Edit">
                <Edit3 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onToggle(item)} disabled={busy} className={ui.iconButton(isLight, 'secondary')} title={item.active ? 'Deactivate' : 'Activate'}>
                {item.active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => onDelete(item)} disabled={busy} className={ui.iconButton(isLight, 'danger')} title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
};
