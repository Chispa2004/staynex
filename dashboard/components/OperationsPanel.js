'use client';

import { ConciergeBell, Sparkles, Wrench } from 'lucide-react';
import { ExecutiveCard, ExecutiveBadge } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const departments = [
  { key: 'reception', label: 'Reception', icon: ConciergeBell, tone: 'sky' },
  { key: 'housekeeping', label: 'Housekeeping', icon: Sparkles, tone: 'emerald' },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench, tone: 'amber' }
];

export const OperationsPanel = ({ operations = {} }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Operations Overview</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Department workload and operational signals.</p>
        </div>
        <ExecutiveBadge tone="slate">Hotel OS</ExecutiveBadge>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {departments.map((department) => {
          const Icon = department.icon;
          const data = operations[department.key] || {};

          return (
            <div
              key={department.key}
              className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700' : 'flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300'}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className={isLight ? 'font-semibold text-slate-950' : 'font-semibold text-white'}>{department.label}</p>
                </div>
                <ExecutiveBadge tone={department.tone}>{data.openTickets || 0} open</ExecutiveBadge>
              </div>

              {department.key === 'reception' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Arrivals today" value={data.arrivalsToday || 0} />
                  <Metric label="Departures today" value={data.departuresToday || 0} />
                </div>
              ) : department.key === 'housekeeping' ? (
                <div>
                  <Metric label="Urgent rooms" value={(data.urgentRooms || []).length} />
                  <p className={isLight ? 'mt-3 text-xs text-slate-500' : 'mt-3 text-xs text-slate-500'}>
                    {(data.urgentRooms || []).length ? data.urgentRooms.join(', ') : 'No urgent room signal'}
                  </p>
                </div>
              ) : (
                <Metric label="Urgent technical tickets" value={data.urgentTickets || 0} />
              )}
            </div>
          );
        })}
      </div>
    </ExecutiveCard>
  );
};

const Metric = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-lg border border-slate-200 bg-white p-3' : 'rounded-lg border border-white/10 bg-black/15 p-3'}>
      <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>{label}</p>
      <p className={isLight ? 'mt-2 text-2xl font-semibold text-slate-950' : 'mt-2 text-2xl font-semibold text-white'}>{value}</p>
    </div>
  );
};
