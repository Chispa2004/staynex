'use client';

import { Map, Sparkles } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const labels = {
  sea_beach: 'Sea & beach',
  family_experience: 'Family',
  couples_experience: 'Couples',
  vip_luxury: 'VIP / luxury',
  culture_local: 'Culture',
  bad_weather: 'Bad weather',
  business_traveler: 'Business',
  destination_personality: 'Destination',
  boat_tour: 'Boat tour',
  sunset_cruise: 'Sunset cruise',
  snorkeling: 'Snorkeling',
  beach_club: 'Beach club',
  family_activities: 'Family activities',
  water_park: 'Water park',
  romantic_dinner: 'Romantic dinner',
  spa_couple: 'Couples spa',
  wine_tasting: 'Wine tasting',
  yacht_experience: 'Yacht',
  private_transfer: 'Private transfer',
  premium_dining: 'Premium dining',
  golf: 'Golf',
  cultural_tour: 'Cultural tour',
  gastronomy_tour: 'Gastronomy',
  museum_visit: 'Museum',
  indoor_spa: 'Indoor spa',
  local_experiences: 'Local experiences'
};

const formatCurrency = (value, currency = 'EUR') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const ExperienceOpportunitiesPanel = ({ data = {} }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const recent = data.recent || [];
  const byCategory = data.byCategory || {};

  return (
    <ExecutiveCard className="p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Experience Opportunities</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Local concierge moments, detected without marketplace pressure.</p>
        </div>
        <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
          <Map className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Active" value={data.activeOpportunities || 0} />
        <Metric label="Potential" value={formatCurrency(data.potentialRevenue || 0)} />
        <Metric label="Avg confidence" value={`${data.averageConfidence || 0}%`} />
      </div>

      {Object.keys(byCategory).length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(byCategory).map(([category, count]) => (
            <ExecutiveBadge key={category} tone="emerald">
              {labels[category] || category} - {count}
            </ExecutiveBadge>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {recent.length ? recent.map((item) => (
          <div key={item.id} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={isLight ? 'text-sm font-semibold text-slate-800' : 'text-sm font-semibold text-slate-200'}>
                  {labels[item.experienceCategory] || item.experienceCategory || 'Experience moment'}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  {labels[item.offerType] || item.offerType} - {item.destinationPersonality || 'destination'} - {item.timingReason || 'experience timing'}
                </p>
              </div>
              <ExecutiveBadge tone={item.status === 'accepted' ? 'emerald' : item.status === 'rejected' ? 'red' : 'sky'}>
                {item.status}
              </ExecutiveBadge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>
                {formatCurrency(item.suggestedPrice, item.currency)}
              </span>
              <span className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>
                fatigue {item.fatigueScore ?? 0}
              </span>
            </div>
          </div>
        )) : (
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400'}>
            <div className="flex gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              Experience recommendations will appear when guests ask about activities, restaurants, beaches, culture or local plans.
            </div>
          </div>
        )}
      </div>
    </ExecutiveCard>
  );
};

const Metric = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
      <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>{label}</p>
      <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-950' : 'mt-2 text-xl font-semibold text-white'}>{value}</p>
    </div>
  );
};
