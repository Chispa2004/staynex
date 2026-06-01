'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  FileSpreadsheet,
  Mail,
  MessageSquareText,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { persistWorkspaceSelection } from '@/lib/workspace-context';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';

const plans = ['starter', 'professional', 'enterprise', 'enterprise_demo', 'pro_demo'];
const languages = ['es', 'en', 'fr', 'de'];
const healthFilters = ['all', 'Healthy', 'Needs setup', 'Attention', 'Inactive'];

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const initialForm = {
  name: '',
  brand_name: '',
  slug: '',
  timezone: 'Europe/Madrid',
  default_language: 'es',
  whatsapp_number: '',
  support_email: '',
  brand_color: '#34d399',
  subscription_plan: 'starter',
  admin_email: ''
};

const formatCurrency = (value) => new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'No activity';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const WorkspaceMark = ({ hotel, size = 'h-11 w-11' }) => (
  <span
    className={cn('flex shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-lg', size)}
    style={{ backgroundColor: hotel?.brand_color || '#34d399' }}
    aria-hidden="true"
  >
    {(hotel?.name || 'H').slice(0, 2).toUpperCase()}
  </span>
);

const StatCard = ({ icon: Icon, label, value, helper, isLight, tone = 'emerald' }) => {
  const { tx } = useDashboardLanguage();

  return (
    <article className={cn('premium-fade-in rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx(label)}</p>
          <p className={cn('mt-3 text-2xl font-semibold', ui.text.title(isLight))}>{value}</p>
          {helper ? <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx(helper)}</p> : null}
        </div>
        <span className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg border',
          tone === 'violet' ? ui.badge(isLight, 'violet') : tone === 'sky' ? ui.badge(isLight, 'sky') : ui.badge(isLight, 'emerald')
        )}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
};

const HealthBar = ({ value = 0, isLight }) => {
  const tone = value >= 75 ? 'bg-emerald-400' : value >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className={cn('h-2 overflow-hidden rounded-full', isLight ? 'bg-slate-100' : 'bg-white/10')}>
      <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
};

const DeleteHotelModal = ({ hotel, isLight, deleting, onCancel, onConfirm }) => {
  const { tx } = useDashboardLanguage();
  if (!hotel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <section className={cn('w-full max-w-lg rounded-2xl border p-6 shadow-2xl', isLight ? 'border-red-200 bg-white shadow-slate-300/40' : 'border-red-300/20 bg-[#0b1019] shadow-black/40')}>
        <div className="flex items-start gap-3">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className={ui.text.eyebrow(isLight)}>{tx('Delete Hotel Workspace')}</p>
            <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{hotel.name}</h2>
            <p className={cn('mt-2 text-sm leading-6', ui.text.body(isLight))}>
              {tx('This action will permanently remove the hotel workspace and related demo/test data.')}
            </p>
            <p className={cn('mt-2 text-xs leading-5', ui.text.muted(isLight))}>
              {tx('Staynex archives the workspace first, disables scoped operational records by hotel_id, and hides it from platform metrics to prevent accidental cross-hotel deletion.')}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={deleting} className={ui.button(isLight, 'secondary')}>
            {tx('Cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className={cn('inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60', isLight ? 'border-red-200 bg-red-600 text-white hover:bg-red-700' : 'border-red-300/20 bg-red-500 text-white hover:bg-red-400')}
          >
            <Trash2 className={deleting ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
            {tx(deleting ? 'Deleting...' : 'Delete hotel')}
          </button>
        </div>
      </section>
    </div>
  );
};

const PmsEcosystemSection = ({ ecosystem = {}, isLight }) => {
  const { tx } = useDashboardLanguage();
  const providers = ecosystem.connectorReadiness || [];
  const hotelsByPms = Object.entries(ecosystem.hotelsByPms || {});

  return (
    <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('PMS Ecosystem')}</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{tx('Multi-provider readiness')}</h2>
          <p className={cn('mt-2 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
            {tx('Operational view of connected PMS providers and the Morocco connector roadmap.')}
          </p>
        </div>
        <span className={ui.badge(isLight, 'sky')}>{tx(`${ecosystem.coveragePercent || 0}% coverage`)}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={PlugZap} isLight={isLight} label="Active PMS" value={ecosystem.activeProviders || 0} helper="Providers with live hotel connections" tone="sky" />
        <StatCard icon={Building2} isLight={isLight} label="Hotels by PMS" value={ecosystem.connectedHotels || 0} helper={hotelsByPms.length ? hotelsByPms.map(([key, count]) => `${key}: ${count}`).join(' / ') : 'No hotels connected yet'} />
        <StatCard icon={Sparkles} isLight={isLight} label="Morocco readiness" value="Pluriel + Ubikos" helper="Beta/coming-soon scaffolds ready" tone="violet" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {providers.map((provider) => (
          <article key={provider.key} className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{provider.name}</p>
                <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{provider.region}</p>
              </div>
              <span className={ui.badge(isLight, provider.status === 'Connected' ? 'emerald' : provider.status === 'Setup available' ? 'amber' : 'slate', true)}>
                {tx(provider.status)}
              </span>
            </div>
            <p className={cn('mt-3 text-sm leading-6', ui.text.body(isLight))}>{tx(provider.readiness)}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

const readinessTone = (status) => {
  if (status === 'healthy') return 'emerald';
  if (status === 'warning') return 'amber';
  if (status === 'critical') return 'red';
  return 'slate';
};

const GoLiveReadinessSection = ({ readiness = {}, hotels = [], isLight, loading }) => {
  const { tx } = useDashboardLanguage();
  const readinessHotels = readiness.hotels || [];
  const lowestHotels = readinessHotels.slice(0, 5);
  const readyCount = readiness.readyHotels || 0;
  const totalHotels = hotels.length || readinessHotels.length || 0;

  return (
    <section className={cn('overflow-hidden rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Go-Live Readiness')}</p>
          <h2 className={cn('mt-2 text-2xl font-semibold', ui.text.title(isLight))}>
            {tx('Readiness Center')}
          </h2>
          <p className={cn('mt-2 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
            {tx('Platform validation for PMS, WhatsApp, AI, revenue, automations, staff onboarding, GDPR and marketplace readiness before a hotel serves live guests.')}
          </p>
        </div>
        <div className={cn('min-w-40 rounded-xl border p-4 text-center', isLight ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-300/20 bg-emerald-300/10')}>
          <p className={ui.text.eyebrow(isLight)}>{tx('Average score')}</p>
          <p className={cn('mt-2 text-3xl font-semibold', ui.text.title(isLight))}>{loading ? '...' : `${readiness.averageScore || 0}%`}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx(`${readyCount}/${totalHotels} ready for live`)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldCheck} isLight={isLight} label="Ready hotels" value={readyCount} helper="No critical blockers" />
        <StatCard icon={AlertTriangle} isLight={isLight} label="Blocked hotels" value={readiness.blockedHotels || 0} helper="Critical go-live blockers" tone="sky" />
        <StatCard icon={Sparkles} isLight={isLight} label="Warnings" value={readiness.warningHotels || 0} helper="Setup improvements before launch" tone="violet" />
        <StatCard icon={PlugZap} isLight={isLight} label="Threshold" value="80%" helper="Required for Enable Live Mode" />
      </div>

      {readiness.blockedHotels > 0 ? (
        <div className={cn('mt-5 rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {tx('Hotel not ready for live guests where critical blockers exist.')}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {lowestHotels.map((hotel) => (
          <Link key={hotel.id} href={`/platform/hotels/${hotel.id}`} className={cn('rounded-xl border p-4 transition hover:-translate-y-0.5', isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.045]')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{hotel.name}</p>
                <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                  {hotel.criticalChecks ? tx(`${hotel.criticalChecks} critical blockers`) : tx('No critical blockers')} / {tx(`${hotel.warningChecks || 0} warnings`)}
                </p>
              </div>
              <span className={ui.badge(isLight, hotel.readyForLive ? 'emerald' : hotel.criticalChecks ? 'red' : 'amber')}>
                {hotel.score}%
              </span>
            </div>
            {hotel.topBlockers?.length ? (
              <p className={cn('mt-3 text-xs leading-5', ui.text.muted(isLight))}>
                {tx('Blockers')}: {hotel.topBlockers.map((blocker) => tx(blocker)).join(', ')}
              </p>
            ) : (
              <p className={cn('mt-3 text-xs leading-5', ui.text.muted(isLight))}>{tx('Ready for final launch review.')}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
};

const PartnerMarketplaceRevenueSection = ({ metrics, revenue, isLight, loading }) => {
  const { tx } = useDashboardLanguage();
  const rows = revenue.partnerMarketplace || [];
  const partnerMarketplaceMetrics = {
    totalPartnerLeads: Number(metrics.totalPartnerLeads || 0),
    totalPartnerBookings: Number(metrics.totalPartnerBookings || 0),
    grossPartnerRevenue: Number(metrics.totalPartnerRevenue || 0),
    staynexCommission: Number(metrics.totalPartnerCommission || 0),
    providerPayout: Number(metrics.totalProviderPayout || 0),
    topProvider: metrics.topPartnerProvider || 'No data',
    conversionRate: Number(metrics.partnerConversionRate || 0),
    failedProviderEmails: Number(metrics.failedProviderEmails || 0),
    pendingProviderEmails: Number(metrics.pendingProviderEmails || 0),
    partnerMarketplaceSqlReady: metrics.partnerMarketplaceSqlReady !== false
  };
  const statusTone = {
    converted: 'emerald',
    lead_sent: 'sky',
    pending_email: 'amber',
    email_failed: 'red',
    active: 'slate'
  };
  const statusLabel = {
    converted: 'Converted',
    lead_sent: 'Lead sent',
    pending_email: 'Pending email',
    email_failed: 'Email failed',
    active: 'Active'
  };

  return (
    <section
      id="partner-marketplace-revenue"
      className={cn(
        'overflow-hidden rounded-xl border p-5',
        isLight
          ? 'border-violet-200/80 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_32%),#fff] text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.08)]'
          : 'border-violet-300/15 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.16),transparent_34%),rgba(11,16,25,0.94)] text-slate-100 shadow-[0_18px_55px_rgba(0,0,0,0.24)]'
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Staynex Partner Network')}</p>
          <h2 className={cn('mt-2 text-2xl font-semibold', ui.text.title(isLight))}>{tx('Partner Marketplace Revenue')}</h2>
          <p className={cn('mt-2 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
            {tx('Platform-only view of external provider leads, Staynex commission and provider payouts.')}
          </p>
        </div>
        <span className={ui.badge(isLight, metrics.partnerMarketplaceSqlReady === false ? 'amber' : 'violet')}>
          {tx(metrics.partnerMarketplaceSqlReady === false ? 'Migration required' : 'Platform only')}
        </span>
      </div>

      {metrics.partnerMarketplaceSqlReady === false ? (
        <div className={cn('mt-4 rounded-xl border px-4 py-3 text-sm', isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-300/10 text-amber-100')}>
          {tx('Partner marketplace SQL migration required.')}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Sparkles} isLight={isLight} label="Partner Leads" value={partnerMarketplaceMetrics.totalPartnerLeads} helper={loading ? 'Loading provider leads...' : 'Provider leads created'} tone="violet" />
        <StatCard icon={CalendarCheck} isLight={isLight} label="Partner Bookings" value={partnerMarketplaceMetrics.totalPartnerBookings} helper="Confirmed or completed" />
        <StatCard icon={CircleDollarSign} isLight={isLight} label="Gross Partner Revenue" value={formatCurrency(partnerMarketplaceMetrics.grossPartnerRevenue)} helper="Total provider booking value" tone="sky" />
        <StatCard icon={CircleDollarSign} isLight={isLight} label="Staynex Commission" value={formatCurrency(partnerMarketplaceMetrics.staynexCommission)} helper="Platform revenue" />
        <StatCard icon={CircleDollarSign} isLight={isLight} label="Provider Payout" value={formatCurrency(partnerMarketplaceMetrics.providerPayout)} helper="Estimated provider share" tone="sky" />
        <StatCard icon={BarChart3} isLight={isLight} label="Conversion Rate" value={`${partnerMarketplaceMetrics.conversionRate}%`} helper="Bookings / leads" tone="sky" />
        <StatCard icon={AlertTriangle} isLight={isLight} label="Failed Emails" value={partnerMarketplaceMetrics.failedProviderEmails} helper={`${partnerMarketplaceMetrics.pendingProviderEmails} pending emails`} tone="sky" />
        <StatCard icon={Sparkles} isLight={isLight} label="Top Provider" value={partnerMarketplaceMetrics.topProvider} helper="Best marketplace source" tone="violet" />
      </div>

      <div className={cn('mt-5 overflow-hidden rounded-xl border', isLight ? 'border-slate-200 bg-white/80 shadow-sm' : 'border-white/10 bg-black/10')}>
        <div className={cn('grid gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] md:grid-cols-[1.1fr_1fr_0.5fr_0.8fr_0.8fr_0.8fr_0.7fr]', isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-white/10 bg-white/[0.03] text-slate-400')}>
          <span>{tx('Provider')}</span>
          <span>{tx('Hotel Source')}</span>
          <span>{tx('Bookings')}</span>
          <span>{tx('Revenue')}</span>
          <span>{tx('Staynex Commission')}</span>
          <span>{tx('Provider Payout')}</span>
          <span>{tx('Status')}</span>
        </div>
        <div className="divide-y divide-slate-200/10">
          {rows.map((row) => (
            <div key={row.key} className={cn('grid gap-3 px-4 py-3 text-sm transition md:grid-cols-[1.1fr_1fr_0.5fr_0.8fr_0.8fr_0.8fr_0.7fr] md:items-center', isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.035]')}>
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-black', isLight ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-violet-300/20 bg-violet-400/10 text-violet-100')}>
                  {(row.provider || 'P').slice(0, 2).toUpperCase()}
                </span>
                <strong className="truncate">{row.provider}</strong>
              </div>
              <span className={cn('truncate', ui.text.muted(isLight))}>{row.hotelSource || tx('Unknown hotel')}</span>
              <span>{row.bookings || 0}</span>
              <span>{formatCurrency(row.revenue)}</span>
              <span>{formatCurrency(row.staynexCommission)}</span>
              <span>{formatCurrency(row.providerPayout)}</span>
              <span className={ui.badge(isLight, statusTone[row.status] || 'slate')}>{tx(statusLabel[row.status] || row.status)}</span>
            </div>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <PremiumEmptyState
          icon={Sparkles}
          title="No partner marketplace revenue yet."
          description="Provider leads from Luxotour and other external partners will appear here once bookings are created."
          className="mt-4"
        />
      ) : null}
    </section>
  );
};

const CreateHotelForm = ({ isLight, saving, onSubmit, onCancel }) => {
  const { tx } = useDashboardLanguage();
  const [form, setForm] = useState(initialForm);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className={cn('rounded-xl border p-5', ui.surface(isLight))}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Create workspace')}</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{tx('New hotel tenant')}</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{tx('Creates the hotel, onboarding state and first invited admin.')}</p>
        </div>
        <button type="button" onClick={onCancel} className={ui.button(isLight, 'ghost')}>{tx('Cancel')}</button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Hotel name')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Brand name')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.brand_name} onChange={(event) => update('brand_name', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Workspace slug')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.slug} onChange={(event) => update('slug', event.target.value)} placeholder="hotel-costa-azul" />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Admin email')}</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.admin_email} onChange={(event) => update('admin_email', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Timezone')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.timezone} onChange={(event) => update('timezone', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Language')}</span>
          <select className={cn('w-full', ui.input(isLight))} value={form.default_language} onChange={(event) => update('default_language', event.target.value)}>
            {languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>WhatsApp</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.whatsapp_number} onChange={(event) => update('whatsapp_number', event.target.value)} placeholder="+34123456789" />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Support email')}</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.support_email} onChange={(event) => update('support_email', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Brand color')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.brand_color} onChange={(event) => update('brand_color', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Subscription plan')}</span>
          <select className={cn('w-full', ui.input(isLight))} value={form.subscription_plan} onChange={(event) => update('subscription_plan', event.target.value)}>
            {plans.map((plan) => <option key={plan} value={plan}>{plan.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tx(saving ? 'Creating...' : 'Create Hotel Workspace')}
        </button>
      </div>
    </form>
  );
};

const ProviderEmailTestPanel = ({ isLight }) => {
  const { tx } = useDashboardLanguage();
  const [form, setForm] = useState({
    to: '',
    subject: 'Staynex provider email test',
    message: 'This is a Staynex provider email delivery test.'
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const sendTest = async (event) => {
    event.preventDefault();
    setSending(true);
    setResult(null);

    try {
      const response = await fetch('/api/platform/test-provider-email', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message || body.error || body.reason || 'Email test failed');
      }

      setResult({
        type: 'success',
        message: `Sent${body.messageId ? ` / ${body.messageId}` : ''}`
      });
    } catch (error) {
      setResult({
        type: 'error',
        message: error.message
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', ui.badge(isLight, 'sky'))}>
          <Mail className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Provider email')}</p>
          <h2 className={cn('mt-2 text-lg font-semibold', ui.text.title(isLight))}>{tx('Test Provider Email')}</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{tx('Platform-only delivery test for provider leads.')}</p>
        </div>
      </div>

      <form onSubmit={sendTest} className="mt-4 space-y-3">
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Recipient')}</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.to} onChange={(event) => update('to', event.target.value)} placeholder="provider@example.com" required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Subject')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.subject} onChange={(event) => update('subject', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Message')}</span>
          <textarea className={cn('min-h-24 w-full', ui.input(isLight))} value={form.message} onChange={(event) => update('message', event.target.value)} />
        </label>
        <button type="submit" disabled={sending} className={ui.button(isLight, 'primary')}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          {tx(sending ? 'Sending...' : 'Send Test Email')}
        </button>
      </form>

      {result ? (
        <div className={cn(
          'mt-4 rounded-lg border px-3 py-2 text-sm',
          result.type === 'success'
            ? isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
            : isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100'
        )}>
          {tx(result.message)}
        </div>
      ) : null}
    </section>
  );
};

const GoogleSheetsSyncPanel = ({ isLight }) => {
  const { tx } = useDashboardLanguage();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const syncSheets = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const response = await fetch('/api/platform/sync-google-sheets', {
        method: 'POST',
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Google Sheets sync failed');
      }

      setResult({
        type: 'success',
        message: `${body.totalRows || 0} rows synced across ${(body.tabs || []).length} tabs.`,
        tabs: body.tabs || [],
        syncedAt: body.syncedAt
      });
    } catch (error) {
      setResult({
        type: 'error',
        message: error.message
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', ui.badge(isLight, 'emerald'))}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Platform BI')}</p>
          <h2 className={cn('mt-2 text-lg font-semibold', ui.text.title(isLight))}>{tx('Google Sheets Sync')}</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{tx('Push platform metrics to Staynex Platform Control.')}</p>
        </div>
      </div>

      <button type="button" disabled={syncing} onClick={syncSheets} className={cn('mt-4 w-full justify-center', ui.button(isLight, 'primary'))}>
        <FileSpreadsheet className={syncing ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
        {tx(syncing ? 'Syncing...' : 'Sync Google Sheets')}
      </button>

      {result ? (
        <div className={cn(
          'mt-4 rounded-lg border px-3 py-2 text-sm',
          result.type === 'success'
            ? isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
            : isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100'
        )}>
          <p>{tx(result.message)}</p>
          {result.syncedAt ? <p className="mt-1 text-xs opacity-80">{tx('Last sync')}: {formatDate(result.syncedAt)}</p> : null}
          {result.tabs?.length ? (
            <div className="mt-2 grid gap-1 text-xs opacity-90">
              {result.tabs.slice(0, 4).map((tab) => (
                <span key={tab.tabName}>{tab.tabName}: {tx(`${tab.rowsSynced} rows`)}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export const PlatformConsoleClient = () => {
  const router = useRouter();
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [data, setData] = useState({ hotels: [], metrics: {}, revenue: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [planFilter, setPlanFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const hotels = data.hotels || [];
  const metrics = data.metrics || {};
  const revenue = data.revenue || {};
  const readiness = data.readiness || {};
  const canCreate = data.platformRole === 'platform_admin';

  const loadPlatform = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/platform/hotels', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load platform console');
      }

      setData(body);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlatform();
  }, []);

  const sortedHotels = useMemo(() => [...hotels]
    .filter((hotel) => planFilter === 'all' || hotel.subscription_plan === planFilter)
    .filter((hotel) => healthFilter === 'all' || hotel.healthStatus === healthFilter)
    .sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '')), [healthFilter, hotels, planFilter]);

  const createHotel = async (form) => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/platform/hotels', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create hotel workspace');
      }

      setNotice(`Workspace created for ${body.hotel?.name || 'hotel'}. Admin invitation saved.`);
      setShowCreate(false);
      await loadPlatform({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteHotel = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirm: true })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete hotel workspace');
      }

      setNotice(`${deleteTarget.name} archived and removed from active platform workspaces.`);
      setDeleteTarget(null);
      await loadPlatform({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setDeleting(false);
    }
  };

  const enterSupport = async (hotel) => {
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotel.id}/support`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not enter support session');
      }

      window.sessionStorage.setItem('staynex_support_session', JSON.stringify(body.supportSession));
      persistWorkspaceSelection({
        hotelId: hotel.id,
        workspace: {
          hotel: body.hotel,
          role: 'support',
          supportSession: body.supportSession
        },
        notify: true
      });
      router.push(`/dashboard?hotelId=${encodeURIComponent(hotel.id)}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{tx('Platform operations')}</p>
          <h1 className={cn('mt-3 text-3xl font-semibold tracking-normal sm:text-4xl', ui.text.title(isLight))}>{tx('Staynex SaaS console')}</h1>
          <p className={cn('mt-3 max-w-2xl text-sm leading-6', ui.text.body(isLight))}>
            {tx('Internal operations hub for tenants, health, revenue, PMS status and support access.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => loadPlatform()} className={ui.button(isLight, 'secondary')}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            {tx('Refresh')}
          </button>
          {canCreate ? (
            <button type="button" onClick={() => setShowCreate(true)} className={ui.button(isLight, 'primary')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tx('Create Hotel Workspace')}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {tx(error)}
        </div>
      ) : null}
      {notice ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
          {tx(notice)}
        </div>
      ) : null}

      {showCreate ? <CreateHotelForm isLight={isLight} saving={saving} onSubmit={createHotel} onCancel={() => setShowCreate(false)} /> : null}
      <DeleteHotelModal
        hotel={deleteTarget}
        isLight={isLight}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteHotel}
      />

      <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', ui.badge(isLight, 'violet'))}>
              <BrainCircuit className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className={ui.text.eyebrow(isLight)}>{tx('Internal AI QA')}</p>
                <span className={ui.badge(isLight, 'red', true)}>{tx('Platform only')}</span>
              </div>
              <h2 className={cn('mt-2 text-lg font-semibold', ui.text.title(isLight))}>{tx('Failure Intelligence')}</h2>
              <p className={cn('mt-1 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
                {tx('Private simulation analysis for unsafe responses, missed escalations, language drift, ticket quality and revenue intelligence before go-live.')}
              </p>
            </div>
          </div>
          <Link href="/platform/ai-quality" className={cn(ui.button(isLight, 'secondary'), 'shrink-0')}>
            {tx('Open AI Quality')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Building2} isLight={isLight} label="Total hotels" value={loading ? '...' : metrics.totalHotels || 0} helper={`${metrics.activeHotels || 0} active`} />
        <StatCard icon={AlertTriangle} isLight={isLight} label="Need attention" value={loading ? '...' : metrics.hotelsNeedingAttention || 0} helper="Health, PMS or urgent issues" tone="sky" />
        <StatCard icon={CalendarCheck} isLight={isLight} label="Reservations" value={loading ? '...' : metrics.totalReservations || 0} helper={`${metrics.totalExperienceBookings || 0} experience bookings`} />
        <StatCard icon={MessageSquareText} isLight={isLight} label="AI conversations" value={loading ? '...' : metrics.totalAiConversations || 0} helper={`${metrics.aiHandledPercent || 0}% handled`} tone="violet" />
        <StatCard icon={CircleDollarSign} isLight={isLight} label="Revenue generated" value={loading ? '...' : formatCurrency(metrics.totalAiRevenue)} helper={`${metrics.offerConversionRate || 0}% offer conversion`} />
        <StatCard icon={PlugZap} isLight={isLight} label="PMS connected" value={loading ? '...' : metrics.pmsConnectedHotels || 0} helper={`${metrics.totalActiveUsers || 0} active users`} tone="sky" />
        <StatCard icon={Sparkles} isLight={isLight} label="Experience catalog" value={loading ? '...' : metrics.totalExperiences || 0} helper={`${metrics.totalLocalKnowledge || 0} local knowledge cards`} tone="violet" />
        <StatCard icon={BookOpen} isLight={isLight} label="WhatsApp ready" value={loading ? '...' : metrics.whatsappConfiguredHotels || 0} helper="Hotels with configured number" />
      </section>

      <PartnerMarketplaceRevenueSection
        metrics={metrics}
        revenue={revenue}
        isLight={isLight}
        loading={loading}
      />

      <GoLiveReadinessSection
        readiness={readiness}
        hotels={hotels}
        isLight={isLight}
        loading={loading}
      />

      <PmsEcosystemSection ecosystem={revenue.pmsEcosystem} isLight={isLight} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <section className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
          <div className={cn('border-b px-4 py-3', isLight ? 'border-slate-200' : 'border-white/10')}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx('Tenant workspaces')}</h2>
                <p className={cn('text-xs', ui.text.muted(isLight))}>{loading ? tx('Loading...') : tx(`${sortedHotels.length} of ${hotels.length} hotels`)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={cn('w-40', ui.input(isLight))}>
                  <option value="all">{tx('All plans')}</option>
                  {plans.map((plan) => <option key={plan} value={plan}>{plan.replaceAll('_', ' ')}</option>)}
                </select>
                <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)} className={cn('w-40', ui.input(isLight))}>
                  {healthFilters.map((health) => <option key={health} value={health}>{tx(health === 'all' ? 'All health' : health)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200/10">
            {sortedHotels.map((hotel) => (
              <article key={hotel.id} className={cn('premium-fade-in grid gap-4 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300/[0.035] xl:grid-cols-[minmax(0,1.15fr)_0.75fr_1fr_auto]', isLight ? 'hover:bg-slate-50 hover:shadow-sm' : '')}>
                <div className="flex min-w-0 gap-3">
                  <WorkspaceMark hotel={hotel} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/platform/hotels/${hotel.id}`} className={cn('truncate text-sm font-semibold hover:text-emerald-300', ui.text.title(isLight))}>
                        {hotel.name}
                      </Link>
                      <span className={ui.badge(isLight, hotel.subscription_plan ? 'emerald' : 'slate', true)}>{hotel.plan_label || tx('No plan')}</span>
                    </div>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{hotel.brand_name || hotel.name} / {hotel.workspace_slug || hotel.slug}</p>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx('Created')} {formatDate(hotel.created_at)}</p>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx('Last activity')}: {formatDate(hotel.lastActivityAt)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-xs font-semibold', ui.text.muted(isLight))}>{tx('Health')}</span>
                    <span className={cn('text-xs font-bold', ui.text.title(isLight))}>{hotel.healthScore || 0}%</span>
                  </div>
                  <div className="mt-2"><HealthBar value={hotel.healthScore || 0} isLight={isLight} /></div>
                  <p className={cn('mt-2 text-xs', ui.text.muted(isLight))}>{tx(hotel.healthStatus || 'Unknown')} / {tx('onboarding')} {hotel.onboarding?.percent || 0}%</p>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <span className={ui.badge(isLight, hotel.pms?.enabled ? 'emerald' : 'slate', true)}>PMS</span>
                    <span className={ui.badge(isLight, hotel.stats?.whatsappConfigured ? 'sky' : 'slate', true)}>WhatsApp</span>
                    <span className={ui.badge(isLight, (hotel.stats?.aiHandled || 0) > 0 ? 'violet' : 'slate', true)}>AI</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className={ui.text.muted(isLight)}>PMS</span><p className="font-semibold">{hotel.pms?.enabled ? hotel.pms.provider : tx('Disconnected')}</p></div>
                  <div><span className={ui.text.muted(isLight)}>WhatsApp</span><p className="font-semibold">{tx(hotel.stats?.whatsappConfigured ? 'Ready' : 'Missing')}</p></div>
                  <div><span className={ui.text.muted(isLight)}>{tx('Users')}</span><p className="font-semibold">{hotel.stats?.activeUsers || 0}/{hotel.stats?.users || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>{tx('Reservations')}</span><p className="font-semibold">{hotel.stats?.reservations || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>{tx('AI handled')}</span><p className="font-semibold">{hotel.stats?.aiHandled || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>{tx('Open tickets')}</span><p className="font-semibold">{hotel.stats?.openTickets || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>{tx('Bookings')}</span><p className="font-semibold">{hotel.stats?.experienceBookings || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>{tx('Revenue')}</span><p className="font-semibold">{formatCurrency((hotel.stats?.revenue || 0) + (hotel.stats?.offerRevenue || 0) + (hotel.stats?.experienceRevenue || 0))}</p></div>
                </div>

                <div className="flex items-center gap-2 lg:justify-end">
                  <button type="button" onClick={() => enterSupport(hotel)} className={ui.button(isLight, 'secondary')}>
                    <DoorOpen className="h-4 w-4" aria-hidden="true" />
                    {tx('Support')}
                  </button>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(hotel)}
                      className={cn('inline-flex items-center justify-center rounded-lg border p-2 transition', isLight ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15')}
                      aria-label={`Delete ${hotel.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  <Link href={`/platform/hotels/${hotel.id}`} className={ui.iconButton(isLight, 'ghost')} aria-label={`Open ${hotel.name}`}>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {!loading && hotels.length === 0 ? (
            <PremiumEmptyState
              icon={Building2}
              title={tx('No hotel workspaces yet')}
              description={tx('Create the first tenant workspace to start onboarding a hotel.')}
              className="m-4"
            />
          ) : null}
        </section>

        <aside className="space-y-6">
          {canCreate ? <GoogleSheetsSyncPanel isLight={isLight} /> : null}

          <ProviderEmailTestPanel isLight={isLight} />

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('Global revenue')}</p>
            <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{formatCurrency(metrics.totalAiRevenue)}</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>{tx('Upsell revenue')}</span><strong>{formatCurrency(metrics.totalUpsellRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>{tx('AI offer revenue')}</span><strong>{formatCurrency(metrics.totalOfferRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>{tx('Experience revenue')}</span><strong>{formatCurrency(metrics.totalExperienceRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>{tx('Experience bookings')}</span><strong>{formatCurrency(metrics.totalExperienceBookingRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>{tx('Accepted offers')}</span><strong>{metrics.acceptedOffers || 0}</strong></div>
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('Top hotels by revenue')}</p>
            <div className="mt-4 space-y-3">
              {(revenue.topHotels || []).filter((item) => item.revenue > 0).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{item.name}</span>
                  <strong>{formatCurrency(item.revenue)}</strong>
                </div>
              ))}
              {!(revenue.topHotels || []).some((item) => item.revenue > 0) ? (
                <p className={cn('text-sm', ui.text.muted(isLight))}>{tx('No revenue attributed yet.')}</p>
              ) : null}
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('Platform controls')}</p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> {tx('Platform-only access enforced')}</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> {tx('Support access is audit logged')}</p>
              <p className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-300" /> {tx('Billing-ready plan structure')}</p>
              <p className="flex items-center gap-2"><Users className="h-4 w-4 text-emerald-300" /> {tx('Global user operations')}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
