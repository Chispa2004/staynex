'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Clock3, RefreshCw, Search, XCircle } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const statusOptions = ['all', 'scheduled', 'sent', 'failed'];
const typeOptions = ['all', 'pre_arrival_7d', 'pre_arrival_1d', 'in_stay_upsell', 'post_stay_review'];

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
  const [hotel, setHotel] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [runningScheduler, setRunningScheduler] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState(null);

  const inputClass = isLight
    ? 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500'
    : 'rounded-lg border border-white/10 bg-[#0b1019] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40';

  const getAuthHeaders = async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

    return data?.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  };

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

      setMessages(body.scheduledMessages || []);
      setRules(body.rules || []);
      setHotel(body.hotel || null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
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
    rules: rules.length
  }), [messages, rules]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Clock3} label="Scheduled" value={stats.scheduled} tone="amber" />
        <StatCard icon={CheckCircle2} label="Sent" value={stats.sent} tone="emerald" />
        <StatCard icon={XCircle} label="Failed" value={stats.failed} tone="red" />
        <StatCard icon={Bot} label="Active rules" value={stats.rules} tone="sky" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">{hotel?.name || 'Current hotel'}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              SEND_AUTOMATIONS is off by default. Scheduled messages are previews until sending is enabled.
            </p>
          </div>
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
            Run Scheduler
          </button>
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
              <option key={type} value={type}>{type === 'all' ? 'All automation types' : type}</option>
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
