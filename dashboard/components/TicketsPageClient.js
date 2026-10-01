'use client';
import Link from 'next/link';
import { AlertCircle, BrainCircuit, ShieldAlert, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TicketsTable } from '@/components/TicketsTable';
import { TicketFilters } from './TicketFilters';
import { PremiumLoadingState } from './PremiumLoadingState';
import { useOperationalMetrics } from '@/lib/useOperationalMetrics';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { OperationalMetricSummary, OperationalPagination, operationalLabels } from './OperationalMetricSummary';

export const TicketsPageClient = () => {
  const list=useOperationalMetrics('tickets'),{t,tx}=useDashboardLanguage(),{theme}=useDashboardTheme();
  const {data,loading,error}=list, metrics=data?.metrics, isLight=theme==='light';
  const filters={status:list.params.get('status')||'all',priority:list.params.get('priority')||'all',category:list.params.get('category')||'all'};
  const surface=isLight?'border-slate-200 bg-white text-slate-900':'border-white/10 bg-white/[0.04] text-slate-100';
  const insights=[['urgent_risk',ShieldAlert],['satisfaction_risk',AlertCircle],['ai_prioritized',BrainCircuit]];
  return <section data-density-page className="space-y-4">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <PageHeader titleKey="screens.tickets" descriptionKey="screens.ticketsDescription" />
      <button type="button" onClick={list.load} className={`rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 ${surface}`}>{t('buttons.refresh')}</button>
    </div>
    <div className={`rounded-xl border p-3 ${surface}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" aria-hidden="true" />{tx('Asistencia IA · estado actual')}</h2>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {insights.map(([metric,Icon])=>{
          const content=<><span className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-4 w-4" aria-hidden="true" />{tx(operationalLabels[metric])}</span><span className="mt-1 block text-xl font-semibold">{metrics?.stats[metric]??'…'}</span></>;
          const className=`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${surface} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`;
          return metrics?<Link key={metric} className={className} href={list.href({metric,q:null,status:null,priority:null,category:null})}>{content}</Link>:<div key={metric} className={className}>{content}</div>;
        })}
      </div>
    </div>
    <div className={`space-y-2 rounded-xl border p-3 ${surface}`}>
    <OperationalMetricSummary compact metrics={metrics} kind="tickets" href={list.href} loading={loading} error={error} />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <TicketFilters embedded filters={filters} onChange={list.change} categories={metrics?.categories||[]} statuses={['open','in_progress','completed']} priorities={['low','normal','high','urgent']} />
    {!loading && !error ? <OperationalPagination metrics={metrics} href={list.href} /> : null}
    </div>
    </div>
    {loading?<PremiumLoadingState title={tx('Consultando registros…')} rows={5} cards={3} />:error?<div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">{tx(error)}</div>:<>
      {metrics.total===0?<p>{tx('No hay registros que cumplan estos filtros.')}</p>:<TicketsTable compact tickets={data.tickets} hotelId={data.hotelId} onUpdated={list.load} />}
      <OperationalPagination metrics={metrics} href={list.href} />
    </>}
  </section>;
};
