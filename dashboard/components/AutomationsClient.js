'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarClock,
  Euro,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  WandSparkles,
  Zap
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const statusOptions = ['all', 'scheduled', 'sent', 'failed'];
const typeOptions = [
  'all',
  'welcome_message',
  'late_checkout_offer',
  'spa_upsell',
  'experience_recommendation',
  'restaurant_promotion',
  'transfer_offer',
  'weather_trigger',
  'vip_followup',
  'birthday_message',
  'abandoned_interest_followup',
  'pre_arrival_7d',
  'pre_arrival_1d',
  'in_stay_upsell',
  'post_stay_review'
];

const formatAutomationLabel = (value) => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={[
      'rounded-lg border shadow-xl',
      isLight
        ? 'border-slate-200 bg-white text-slate-900 shadow-slate-200/70'
        : 'border-white/10 bg-[#0b1019]/88 text-slate-100 shadow-black/15',
      className
    ].join(' ')}
    >
      {children}
    </section>
  );
};

const Badge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const styles = {
    emerald: isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
    red: isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100',
    amber: isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    sky: isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    slate: isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone] || styles.slate}`}>
      {children}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-60">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </div>
      <Badge tone={tone}>
        <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        AI
      </Badge>
    </div>
  </Card>
);

export const AutomationsClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [messages, setMessages] = useState([]);
  const [rules, setRules] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [runningScheduler, setRunningScheduler] = useState(false);
  const [updatingAutomation, setUpdatingAutomation] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const inputClass = isLight
    ? 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500'
    : 'rounded-lg border border-white/10 bg-[#0b1019] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40';

  const loadAutomations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/automations', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load automations');
      }

      if (!shouldAcceptTenantPayload(body, 'automations')) {
        return;
      }

      setMessages(body.scheduledMessages || []);
      setRules(body.rules || []);
      setAutomations(body.automations || []);
      setMetrics(body.metrics || null);
      setHotel(body.hotel || null);
      setMigrationRequired(Boolean(body.migrationRequired));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutomation = async (automation) => {
    setUpdatingAutomation(automation.type);
    setError(null);

    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          automationType: automation.type,
          active: automation.active === false
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update automation');
      }

      await loadAutomations();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setUpdatingAutomation(null);
    }
  };

  useEffect(() => {
    loadAutomations();
  }, []);

  const runScheduler = async () => {
    setRunningScheduler(true);
    setRunResult(null);
    setError(null);

    try {
      const response = await fetch('/api/automations/run', {
        method: 'POST',
        headers: await getAuthHeaders()
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not run scheduler');
      }

      setRunResult(`Scheduler completed: ${body.scheduled || 0} messages scheduled.`);
      await loadAutomations();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setRunningScheduler(false);
    }
  };

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLowerCase();

    return messages.filter((message) => {
      const matchesStatus = statusFilter === 'all' || message.status === statusFilter;
      const matchesType = typeFilter === 'all' || message.automation_type === typeFilter;
      const haystack = [
        message.automation_type,
        message.status,
        message.message_preview,
        message.guest?.phone_number,
        message.guest?.current_room,
        message.reservation?.guest_name,
        message.reservation?.pms_reservation_id
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesStatus && matchesType && (!query || haystack.includes(query));
    });
  }, [messages, search, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    scheduled: messages.filter((item) => item.status === 'scheduled').length,
    sent: messages.filter((item) => item.status === 'sent').length,
    failed: messages.filter((item) => item.status === 'failed').length,
    rules: rules.length,
    activeAutomations: metrics?.activeAutomations ?? automations.filter((item) => item.active !== false).length,
    revenueGenerated: metrics?.revenueGenerated ?? 0,
    conversionRate: metrics?.conversionRate ?? 0,
    scheduledToday: metrics?.scheduledToday ?? 0,
    aiSuggestions: metrics?.aiSuggestions || []
  }), [automations, messages, metrics, rules]);

  const automationCards = useMemo(() => automations.map((automation) => {
    const relatedRuns = (metrics?.runs || []).filter((run) => run.automation_type === automation.type);
    const relatedMessages = messages.filter((message) => message.automation_type === automation.type);
    const lastRun = relatedMessages[0]?.scheduled_for || relatedMessages[0]?.created_at || automation.updated_at || automation.created_at;
    const revenue = relatedMessages.reduce((total, message) => total + Number(message.estimated_revenue || message.metadata?.estimated_revenue || 0), 0);
    const sent = relatedMessages.filter((message) => message.status === 'sent').length;
    const conversion = relatedMessages.length ? Math.round((sent / relatedMessages.length) * 100) : 0;

    return {
      ...automation,
      relatedRuns,
      relatedMessages,
      lastRun,
      revenue,
      conversion
    };
  }), [automations, messages, metrics]);

  return (
    <div className="space-y-6">
      <Card className={isLight ? 'overflow-hidden bg-gradient-to-br from-white via-white to-emerald-50/70 p-5' : 'overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.18),transparent_34%),#0b1019] p-5'}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="emerald">
                <WandSparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                AI Operations & Revenue Engine
              </Badge>
              <Badge tone="sky">WhatsApp ready</Badge>
              <Badge tone="slate">Cooldowns + fatigue guard</Badge>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Automation Center</h2>
            <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-300'}>
              Proactive AI workflows for welcomes, late checkout, spa, experiences, transfers and VIP follow-up. Messages stay tenant-safe, translated and controlled by hotel staff.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={loadAutomations}
              className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={runScheduler}
              disabled={runningScheduler}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60"
            >
              <Bot className={runningScheduler ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
              Run intelligence pass
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Zap} label="Active automations" value={stats.activeAutomations} tone="emerald" />
        <StatCard icon={Euro} label="Revenue generated" value={formatCurrency(stats.revenueGenerated)} tone="sky" />
        <StatCard icon={TrendingUp} label="Conversion rate" value={`${stats.conversionRate}%`} tone="emerald" />
        <StatCard icon={CalendarClock} label="Scheduled today" value={stats.scheduledToday} tone="amber" />
        <StatCard icon={Sparkles} label="AI suggestions" value={stats.aiSuggestions.length} tone="sky" />
      </div>

      {migrationRequired ? (
        <div className={isLight ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900' : 'rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100'}>
          Automation engine SQL migration required. Run <span className="font-semibold">supabase/sql/create_automation_engine.sql</span> manually to persist automation runs, revenue and engine settings.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">AI Suggested Automations</p>
              <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                Suggestions are safe by design: cooldowns, max per guest, quiet hours and opt-out hooks are ready.
              </p>
            </div>
            <Badge tone="emerald">Smart triggers</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(stats.aiSuggestions.length ? stats.aiSuggestions : [
              'Create a Hammam upsell automation for rainy days.',
              'Late checkout automation performs best for one-night departures.',
              'Follow up abandoned experience interest within 12 hours.'
            ]).map((suggestion) => (
              <div key={suggestion} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700' : 'rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-300'}>
                <Sparkles className="mb-2 h-4 w-4 text-emerald-400" aria-hidden="true" />
                {suggestion}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className={isLight ? 'h-5 w-5 text-emerald-600' : 'h-5 w-5 text-emerald-300'} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Safety layer</p>
              <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                No spam loops. Every automation respects hotel tenant context, guest fatigue and per-guest limits.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {['Cooldowns', 'Max per guest', 'Quiet hours', 'Translation'].map((item) => (
              <div key={item} className={isLight ? 'rounded-lg bg-slate-100 px-3 py-2 text-slate-700' : 'rounded-lg bg-white/[0.05] px-3 py-2 text-slate-300'}>
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Automation Playbooks</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              Hotel-controlled proactive journeys for operations and revenue.
            </p>
          </div>
          <Badge tone="sky">{automationCards.length} playbooks</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {automationCards.map((automation) => (
            <article
              key={automation.type}
              className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-emerald-300/30 hover:bg-white/[0.055]'}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{automation.name || formatAutomationLabel(automation.type)}</p>
                  <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                    {formatAutomationLabel(automation.trigger_type || automation.type)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleAutomation(automation)}
                  disabled={updatingAutomation === automation.type}
                  className={automation.active === false
                    ? (isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300')
                    : 'text-emerald-500 hover:text-emerald-400'}
                  aria-label={`Toggle ${automation.name}`}
                >
                  {automation.active === false ? <ToggleLeft className="h-7 w-7" aria-hidden="true" /> : <ToggleRight className="h-7 w-7" aria-hidden="true" />}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone={automation.active === false ? 'slate' : 'emerald'}>{automation.active === false ? 'Inactive' : 'Active'}</Badge>
                <Badge tone="slate">{formatAutomationLabel(automation.audience_type || 'all_guests')}</Badge>
                <Badge tone="amber">{automation.cooldown_minutes || 0}m cooldown</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className={isLight ? 'rounded-lg bg-slate-50 p-2 text-slate-600' : 'rounded-lg bg-white/[0.04] p-2 text-slate-400'}>
                  <p className="font-semibold">Revenue</p>
                  <p className="mt-1">{formatCurrency(automation.revenue || automation.actions?.estimated_revenue || 0)}</p>
                </div>
                <div className={isLight ? 'rounded-lg bg-slate-50 p-2 text-slate-600' : 'rounded-lg bg-white/[0.04] p-2 text-slate-400'}>
                  <p className="font-semibold">Conv.</p>
                  <p className="mt-1">{automation.conversion || 0}%</p>
                </div>
                <div className={isLight ? 'rounded-lg bg-slate-50 p-2 text-slate-600' : 'rounded-lg bg-white/[0.04] p-2 text-slate-400'}>
                  <p className="font-semibold">Last run</p>
                  <p className="mt-1 truncate">{automation.lastRun ? formatDate(automation.lastRun) : '-'}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">{hotel?.name || 'Current hotel'}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              SEND_AUTOMATIONS is off by default. Automated messages are prepared as safe previews until sending is enabled.
            </p>
          </div>
          <Badge tone="slate">Preview mode</Badge>
        </div>
      </Card>

      {runResult ? (
        <div className={isLight ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100'}>
          {runResult}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className={isLight ? 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400' : 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600'} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search guest, room, reservation or preview"
              className={`${inputClass} w-full pl-9`}
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All automation types' : formatAutomationLabel(type)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
            ))}
          </select>
        </div>
      </Card>

      {error ? (
        <div className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className={isLight ? 'border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900' : 'border-b border-white/10 px-4 py-3 text-sm font-semibold text-white'}>
          {loading ? 'Loading automations...' : `${filteredMessages.length} scheduled messages`}
        </div>
        <div className="divide-y divide-slate-200/10">
          {filteredMessages.map((message) => (
            <article key={message.id} className={isLight ? 'grid gap-4 p-4 hover:bg-slate-50 xl:grid-cols-[1fr_0.8fr_0.8fr_0.7fr]' : 'grid gap-4 p-4 hover:bg-white/[0.035] xl:grid-cols-[1fr_0.8fr_0.8fr_0.7fr]'}>
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="sky">{message.automation_type}</Badge>
                  <Badge tone={message.status === 'sent' ? 'emerald' : message.status === 'failed' ? 'red' : 'amber'}>
                    {message.status}
                  </Badge>
                  {message.automation_fallback ? <Badge tone="slate">fallback</Badge> : null}
                </div>
                <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-700' : 'mt-3 text-sm leading-6 text-slate-300'}>
                  {message.message_preview}
                </p>
              </div>
              <div className="text-sm">
                <p className="font-semibold">Guest</p>
                <p className={isLight ? 'mt-1 text-slate-600' : 'mt-1 text-slate-400'}>
                  {message.reservation?.guest_name || message.guest?.phone_number || 'Unknown guest'}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  Room {message.guest?.current_room || '-'}
                </p>
              </div>
              <div className="text-sm">
                <p className="font-semibold">Reservation</p>
                <p className={isLight ? 'mt-1 text-slate-600' : 'mt-1 text-slate-400'}>
                  {message.reservation?.pms_reservation_id || '-'}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  {message.reservation?.arrival_date || '-'} {'->'} {message.reservation?.departure_date || '-'}
                </p>
              </div>
              <div className="text-sm">
                <p className="font-semibold">Schedule</p>
                <p className={isLight ? 'mt-1 text-slate-600' : 'mt-1 text-slate-400'}>{formatDate(message.scheduled_for)}</p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  {message.ai_provider || '-'} / {message.ai_model || '-'}
                </p>
              </div>
            </article>
          ))}
          {!loading && filteredMessages.length === 0 ? (
            <div className={isLight ? 'px-4 py-12 text-center text-sm text-slate-500' : 'px-4 py-12 text-center text-sm text-slate-500'}>
              No scheduled automations yet.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
};
