'use client';

import { Edit3, ExternalLink, Power, Trash2 } from 'lucide-react';
import { ExperienceCategoryBadge } from './ExperienceCategoryBadge';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const formatCurrency = (value) => (
  value === '' || value === null || value === undefined
    ? 'No price'
    : new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(Number(value || 0))
);

export const ExperienceCard = ({
  experience,
  canManage,
  onEdit,
  onToggle,
  onDelete,
  busy = false
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <article className={cn('overflow-hidden rounded-xl border transition duration-200', ui.surface(isLight))}>
      {experience.image_url ? (
        <div className="aspect-[16/7] overflow-hidden bg-slate-900">
          <img src={experience.image_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ExperienceCategoryBadge category={experience.category} />
              <span className={ui.badge(isLight, experience.active ? 'emerald' : 'slate')}>
                {experience.active ? 'Active' : 'Inactive'}
              </span>
              {experience.vip_only ? <span className={ui.badge(isLight, 'violet')}>VIP</span> : null}
              {experience.indoor ? <span className={ui.badge(isLight, 'sky')}>Indoor</span> : null}
            </div>
            <h2 className={`mt-3 text-lg ${ui.text.title(isLight)}`}>{experience.title}</h2>
            <p className={`mt-2 line-clamp-3 ${ui.text.body(isLight)}`}>{experience.description}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>
              {formatCurrency(experience.price)}
            </p>
            {experience.commission_percentage ? (
              <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                {experience.commission_percentage}% commission
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(experience.tags || []).slice(0, 6).map((tag) => (
            <span key={tag} className={ui.badge(isLight, 'slate', true)}>{tag}</span>
          ))}
          {(experience.target_guest_types || []).slice(0, 4).map((target) => (
            <span key={target} className={ui.badge(isLight, 'emerald', true)}>{target}</span>
          ))}
        </div>

        <div className={`mt-4 grid gap-2 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          <p><span className="font-semibold">Partner:</span> {experience.partner_name || 'Internal concierge'}</p>
          <p><span className="font-semibold">Priority:</span> {experience.priority || 0}</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          {experience.booking_url ? (
            <a href={experience.booking_url} target="_blank" rel="noreferrer" className={ui.button(isLight, 'secondary')}>
              <ExternalLink className="h-4 w-4" />
              Partner link
            </a>
          ) : <span />}
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onEdit(experience)} disabled={busy} className={ui.iconButton(isLight, 'secondary')} title="Edit">
                <Edit3 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onToggle(experience)} disabled={busy} className={ui.iconButton(isLight, 'secondary')} title={experience.active ? 'Deactivate' : 'Activate'}>
                <Power className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onDelete(experience)} disabled={busy} className={ui.iconButton(isLight, 'danger')} title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
};
