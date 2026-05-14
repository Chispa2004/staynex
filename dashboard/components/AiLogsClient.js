'use client';

import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Database,
  RefreshCw,
  Search,
  TicketCheck,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const filterOptions = [
  { key: 'all', labelKey: 'aiLogs.filters.all' },
  { key: 'housekeeping', labelKey: 'aiLogs.filters.housekeeping' },
  { key: 'maintenance', labelKey: 'aiLogs.filters.maintenance' },
  { key: 'reception', labelKey: 'aiLogs.filters.reception' },
  { key: 'knowledge', labelKey: 'aiLogs.filters.knowledgeBase' },
  { key: 'tickets', labelKey: 'aiLogs.filters.ticketsOnly' },
  { key: 'lowConfidence', labelKey: 'aiLogs.filters.lowConfidence' }
];

const receptionCategories = new Set([
  'transport',
  'restaurant',
  'spa',
  'room_service',
  'reception',
  'complaint',
  'emergency'
]);

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const isToday = (value) => {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
};

const formatConfidence = (value) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '-';
  }

  return `${Math.round(numberValue * 100)}%`;
};

const TruncatedText = ({ children }) => (
  <span
    className="block max-w-[280px] overflow-hidden text-sm leading-5"
    style={{
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical'
    }}
  >
    {children || '-'}
  </span>
);

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={[
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
    emerald: isLight
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
    red: isLight
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-red-300/20 bg-red-500/10 text-red-100',
    amber: isLight
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    sky: isLight
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    purple: isLight
      ? 'border-violet-200 bg-violet-50 text-violet-800'
      : 'border-violet-300/20 bg-violet-400/10 text-violet-100',
    slate: isLight
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${styles[tone] || styles.slate}`}>
      {children}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
            {label}
          </p>
          <p className={isLight ? 'mt-3 text-3xl font-semibold text-slate-950' : 'mt-3 text-3xl font-semibold text-white'}>
            {value}
          </p>
        </div>
        <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
};

const getIntentTone = (intent) => {
  if (intent === 'emergency') {
    return 'red';
  }

  if (intent === 'complaint' || intent === 'maintenance_issue') {
    return 'amber';
  }

  if (intent === 'hotel_info') {
    return 'sky';
  }

  if (intent === 'housekeeping_request') {
    return 'emerald';
  }

  return 'slate';
};

const matchesFilter = (log, filter) => {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'housekeeping') {
    return log.ticket_category === 'housekeeping' || log.detected_intent === 'housekeeping_request';
  }

  if (filter === 'maintenance') {
    return log.ticket_category === 'maintenance' || log.detected_intent === 'maintenance_issue';
  }

  if (filter === 'reception') {
    return receptionCategories.has(log.ticket_category);
  }

  if (filter === 'knowledge') {
    return Boolean(log.knowledge_used);
  }

  if (filter === 'tickets') {
    return Boolean(log.ticket_created);
  }

  if (filter === 'lowConfidence') {
    return Number(log.confidence_score) < 0.7;
  }

  return true;
};

const matchesSearch = (log, search) => {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    log.detected_room,
    log.detected_intent,
    log.ticket_category,
    log.raw_guest_message,
    log.generated_response
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

const DetailRow = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'border-b border-slate-200 py-3 last:border-0' : 'border-b border-white/10 py-3 last:border-0'}>
      <dt className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>
        {label}
      </dt>
      <dd className={isLight ? 'mt-1 break-words text-sm leading-6 text-slate-900' : 'mt-1 break-words text-sm leading-6 text-slate-100'}>
        {value === null || value === undefined || value === '' ? '-' : String(value)}
      </dd>
    </div>
  );
};

const LogDetail = ({ log, onClose }) => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (!log) {
    return (
      <Card className="hidden min-h-[520px] p-5 xl:block">
        <div className={isLight ? 'flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500' : 'flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] text-center text-sm text-slate-500'}>
          {t('aiLogs.selectLog')}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className={isLight ? 'flex items-center justify-between gap-3 border-b border-slate-200 p-5' : 'flex items-center justify-between gap-3 border-b border-white/10 p-5'}>
        <div>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700' : 'text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300'}>
            {t('aiLogs.detailTitle')}
          </p>
          <h2 className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>
            {log.detected_intent || t('aiLogs.unknown')}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 xl:hidden' : 'rounded-lg border border-white/10 bg-white/[0.035] p-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white xl:hidden'}
          aria-label={t('aiLogs.closeDetail')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <dl className="p-5">
        <DetailRow label={t('aiLogs.columns.guestMessage')} value={log.raw_guest_message} />
        <DetailRow label={t('aiLogs.columns.aiResponse')} value={log.generated_response} />
        <DetailRow label="detected_language" value={log.detected_language} />
        <DetailRow label="detected_intent" value={log.detected_intent} />
        <DetailRow label="detected_room" value={log.detected_room} />
        <DetailRow label="knowledge_used" value={log.knowledge_used} />
        <DetailRow label="knowledge_key" value={log.knowledge_key} />
        <DetailRow label="ticket_created" value={log.ticket_created} />
        <DetailRow label="ticket_category" value={log.ticket_category} />
        <DetailRow label="ticket_id" value={log.ticket_id} />
        <DetailRow label="needs_human" value={log.needs_human} />
        <DetailRow label="human_reason" value={log.human_reason} />
        <DetailRow label="ai_provider" value={log.ai_provider} />
        <DetailRow label="ai_model" value={log.ai_model} />
        <DetailRow label="fallback_used" value={log.fallback_used} />
        <DetailRow label="confidence_score" value={log.confidence_score} />
        <DetailRow label="created_at" value={log.created_at} />
      </dl>
    </Card>
  );
};

export const AiLogsClient = () => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-logs', {
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || t('aiLogs.errors.loadFailed'));
      }

      setLogs(payload.logs || []);
      setSelectedLog((current) => {
        if (!current) {
          return payload.logs?.[0] || null;
        }

        return payload.logs?.find((log) => log.id === current.id) || payload.logs?.[0] || null;
      });
    } catch (loadError) {
      console.error('AI logs fetch failed', loadError);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => (
    logs.filter((log) => matchesFilter(log, activeFilter) && matchesSearch(log, search))
  ), [logs, activeFilter, search]);

  const stats = useMemo(() => {
    const confidenceValues = logs
      .map((log) => Number(log.confidence_score))
      .filter(Number.isFinite);
    const avgConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null;

    return {
      logsToday: logs.filter((log) => isToday(log.created_at)).length,
      ticketsCreated: logs.filter((log) => log.ticket_created).length,
      avgConfidence: avgConfidence === null ? '-' : formatConfidence(avgConfidence),
      knowledgeHits: logs.filter((log) => log.knowledge_used).length
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
            {t('screens.operations')}
          </p>
          <h1 className={isLight ? 'mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl' : 'mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl'}>
            {t('screens.aiLogs')}
          </h1>
          <p className={isLight ? 'mt-3 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-3 max-w-2xl text-sm leading-6 text-slate-400'}>
            {t('screens.aiLogsDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white'}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('buttons.refresh')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Activity} label={t('aiLogs.stats.logsToday')} value={stats.logsToday} />
        <StatCard icon={TicketCheck} label={t('aiLogs.stats.ticketsCreated')} value={stats.ticketsCreated} />
        <StatCard icon={BrainCircuit} label={t('aiLogs.stats.avgConfidence')} value={stats.avgConfidence} />
        <StatCard icon={Database} label={t('aiLogs.stats.knowledgeHits')} value={stats.knowledgeHits} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((item) => {
              const active = activeFilter === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveFilter(item.key)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                    isLight
                      ? active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                      : active
                        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                        : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>

          <label className={isLight ? 'flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500 xl:w-80' : 'flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-slate-500 xl:w-80'}>
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('aiLogs.searchPlaceholder')}
              className={isLight ? 'min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400' : 'min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600'}
            />
          </label>
        </div>
      </Card>

      {error ? (
        <Card className={isLight ? 'border-red-200 bg-red-50 p-5 text-red-800' : 'border-red-300/20 bg-red-500/10 p-5 text-red-100'}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t('aiLogs.errors.title')}</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <div className={isLight ? 'border-b border-slate-200 px-5 py-4' : 'border-b border-white/10 px-5 py-4'}>
            <p className={isLight ? 'text-sm font-semibold text-slate-700' : 'text-sm font-semibold text-slate-300'}>
              {t('aiLogs.results', { count: filteredLogs.length })}
            </p>
          </div>

          {loading ? (
            <div className={isLight ? 'p-8 text-center text-sm text-slate-500' : 'p-8 text-center text-sm text-slate-500'}>
              {t('aiLogs.loading')}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className={isLight ? 'p-8 text-center text-sm text-slate-500' : 'p-8 text-center text-sm text-slate-500'}>
              {logs.length === 0 ? t('aiLogs.empty') : t('aiLogs.noMatches')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left">
                <thead className={isLight ? 'bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500' : 'bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-slate-500'}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.date')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.language')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.intent')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.room')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.ticket')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.category')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.confidence')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.guestMessage')}</th>
                    <th className="px-4 py-3 font-semibold">{t('aiLogs.columns.aiResponse')}</th>
                  </tr>
                </thead>
                <tbody className={isLight ? 'divide-y divide-slate-200' : 'divide-y divide-white/10'}>
                  {filteredLogs.map((log) => {
                    const selected = selectedLog?.id === log.id;

                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={[
                          'cursor-pointer align-top transition',
                          isLight
                            ? selected
                              ? 'bg-emerald-50/80'
                              : 'hover:bg-slate-50'
                            : selected
                              ? 'bg-emerald-300/[0.06]'
                              : 'hover:bg-white/[0.035]'
                        ].join(' ')}
                      >
                        <td className={isLight ? 'whitespace-nowrap px-4 py-4 text-sm text-slate-600' : 'whitespace-nowrap px-4 py-4 text-sm text-slate-400'}>{formatDate(log.created_at)}</td>
                        <td className="px-4 py-4">
                          <Badge tone="purple">{(log.detected_language || '-').toUpperCase()}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={getIntentTone(log.detected_intent)}>{log.detected_intent || '-'}</Badge>
                        </td>
                        <td className={isLight ? 'px-4 py-4 text-sm font-semibold text-slate-800' : 'px-4 py-4 text-sm font-semibold text-slate-200'}>{log.detected_room || '-'}</td>
                        <td className="px-4 py-4">
                          <Badge tone={log.ticket_created ? 'emerald' : 'slate'}>
                            {log.ticket_created ? t('aiLogs.ticketCreated') : t('aiLogs.noTicket')}
                          </Badge>
                        </td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{log.ticket_category || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm font-semibold text-slate-800' : 'px-4 py-4 text-sm font-semibold text-slate-200'}>{formatConfidence(log.confidence_score)}</td>
                        <td className={isLight ? 'px-4 py-4 text-slate-700' : 'px-4 py-4 text-slate-300'}>
                          <TruncatedText>{log.raw_guest_message}</TruncatedText>
                        </td>
                        <td className={isLight ? 'px-4 py-4 text-slate-700' : 'px-4 py-4 text-slate-300'}>
                          <TruncatedText>{log.generated_response}</TruncatedText>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      </div>
    </div>
  );
};
