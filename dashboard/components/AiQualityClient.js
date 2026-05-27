'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Languages,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TicketCheck,
  TrendingUp,
  XCircle
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';

const counts = [10, 50, 100, 500];

const hotelTypes = [
  { id: 'all', label: 'All hotel types' },
  { id: 'urban', label: 'Urban hotel' },
  { id: 'resort', label: 'Resort' },
  { id: 'boutique', label: 'Boutique hotel' },
  { id: 'family', label: 'Family hotel' },
  { id: 'luxury', label: 'Luxury hotel' },
  { id: 'riad-marrakech', label: 'Marrakech riad' }
];

const scenarios = [
  { id: 'all', label: 'All scenarios' },
  { id: 'late_checkout', label: 'Late checkout' },
  { id: 'airport_transfer', label: 'Airport transfer' },
  { id: 'spa_booking', label: 'Spa booking' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'noise_complaint', label: 'Noise complaint' },
  { id: 'broken_ac', label: 'Broken AC' },
  { id: 'cleaning_request', label: 'Cleaning request' },
  { id: 'hours_question', label: 'Hotel hours' },
  { id: 'excursion_recommendation', label: 'Experience recommendation' },
  { id: 'room_upgrade', label: 'Room upgrade' },
  { id: 'vip_guest', label: 'VIP guest' },
  { id: 'angry_guest', label: 'Angry guest' },
  { id: 'french_guest', label: 'French guest' },
  { id: 'english_guest', label: 'English guest' },
  { id: 'spanish_guest', label: 'Spanish guest' },
  { id: 'ambiguous_request', label: 'Ambiguous request' },
  { id: 'real_urgency', label: 'Real urgency' }
];

const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

const severityTone = (severity) => {
  if (severity === 'CRITICAL') return 'red';
  if (severity === 'HIGH') return 'amber';
  if (severity === 'MEDIUM') return 'sky';
  if (severity === 'LOW') return 'slate';
  return 'emerald';
};

const StatusPill = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return <span className={ui.badge(isLight, tone, true)}>{typeof children === 'string' ? tx(children) : children}</span>;
};

const MetricCard = ({ icon: Icon, label, value, helper, tone = 'emerald' }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx(label)}</p>
          <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
          {helper ? <p className={cn('mt-1 text-xs leading-5', ui.text.muted(isLight))}>{tx(helper)}</p> : null}
        </div>
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', ui.badge(isLight, tone))}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
};

const TrendList = ({ title, items = [], empty = 'No trend detected.' }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
      <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx(title)}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={`${item.label}-${item.count}`} className="flex items-center justify-between gap-3 text-sm">
            <span className={cn('min-w-0 truncate', ui.text.body(isLight))}>{tx(item.label)}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200')}>
              {item.count}
            </span>
          </div>
        )) : (
          <p className={cn('text-sm', ui.text.muted(isLight))}>{tx(empty)}</p>
        )}
      </div>
    </section>
  );
};

export const AiQualityClient = () => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [count, setCount] = useState(100);
  const [hotelType, setHotelType] = useState('all');
  const [scenario, setScenario] = useState('all');
  const [aiVersion, setAiVersion] = useState('local-quality-run');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  const selectedReplay = useMemo(() => {
    const selectedClassification = (result?.classifications || []).find((item) => item.resultId === selectedId);
    const selectedResult = (result?.simulation?.results || []).find((item) => item.id === selectedId);

    if (!selectedResult) return null;

    return {
      classification: selectedClassification,
      conversation: selectedResult
    };
  }, [result, selectedId]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/platform/ai-quality/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders())
        },
        body: JSON.stringify({ count, hotelType, scenario, aiVersion })
      });
      const body = await response.json();

      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'AI quality run failed');
      }

      setResult(body);
      setHistory(body.history || []);
      const firstReview = (body.classifications || []).find((item) => item.categories?.length)?.resultId
        || body.simulation?.results?.[0]?.id
        || null;
      setSelectedId(firstReview);
    } catch (requestError) {
      setError(requestError.message || 'AI quality run failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        const response = await fetch('/api/platform/ai-quality/history', {
          headers: await getAuthHeaders(),
          cache: 'no-store'
        });
        const body = await response.json();
        if (active && response.ok && body.ok) {
          setHistory(body.history || []);
        }
      } catch (requestError) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('AI quality history unavailable', requestError);
        }
      }
    };

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const metrics = result?.qualityMetrics || {};
  const simulationMetrics = result?.simulationMetrics || result?.simulation?.metrics || {};
  const classifications = result?.classifications || [];
  const reviews = classifications.filter((item) => item.categories?.length);
  const trends = result?.trends || {};

  return (
    <div className="space-y-5">
      <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="red">Internal only</StatusPill>
              <StatusPill tone="emerald">Simulation sandbox</StatusPill>
              <StatusPill tone="sky">No client visibility</StatusPill>
              <StatusPill tone="violet">AI training QA</StatusPill>
            </div>
            <h2 className={cn('mt-4 text-xl font-semibold', ui.text.title(isLight))}>{tx('Run Failure Intelligence analysis')}</h2>
            <p className={cn('mt-2 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
              {tx('Classify simulation failures, unsafe responses, weak revenue detection and escalation mistakes before any hotel goes live.')}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[130px_180px_210px_180px_auto]">
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>{tx('Conversations')}</span>
              <select className={cn('w-full', ui.input(isLight))} value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {counts.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>{tx('Hotel type')}</span>
              <select className={cn('w-full', ui.input(isLight))} value={hotelType} onChange={(event) => setHotelType(event.target.value)}>
                {hotelTypes.map((item) => <option key={item.id} value={item.id}>{tx(item.label)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>{tx('Scenario')}</span>
              <select className={cn('w-full', ui.input(isLight))} value={scenario} onChange={(event) => setScenario(event.target.value)}>
                {scenarios.map((item) => <option key={item.id} value={item.id}>{tx(item.label)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>{tx('AI version')}</span>
              <input className={cn('w-full', ui.input(isLight))} value={aiVersion} onChange={(event) => setAiVersion(event.target.value)} />
            </label>
            <button type="button" onClick={runAnalysis} disabled={loading} className={cn(ui.button(isLight, 'primary'), 'min-h-11 self-end')}>
              <FlaskConical className={loading ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
              {tx(loading ? 'Analyzing...' : 'Run QA analysis')}
            </button>
          </div>
        </div>

        {error ? (
          <div className={cn('mt-4 rounded-lg border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
            {tx(error)}
          </div>
        ) : null}
      </section>

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={BrainCircuit} label="Global AI score" value={formatPercent(metrics.globalAiScore)} helper={`${simulationMetrics.total || 0} simulated conversations`} />
            <MetricCard icon={ShieldCheck} label="Safety score" value={formatPercent(metrics.safetyScore)} tone={metrics.safetyScore < 90 ? 'amber' : 'emerald'} />
            <MetricCard icon={MessageSquareText} label="Conversation quality" value={formatPercent(metrics.conversationQuality)} tone="sky" />
            <MetricCard icon={Target} label="Escalation quality" value={formatPercent(metrics.escalationQuality)} tone="amber" />
            <MetricCard icon={Languages} label="Multilingual quality" value={formatPercent(metrics.multilingualQuality)} tone="violet" />
            <MetricCard icon={TrendingUp} label="Revenue intelligence" value={formatPercent(metrics.revenueIntelligenceQuality)} tone="emerald" />
            <MetricCard icon={TicketCheck} label="Ticket quality" value={formatPercent(metrics.ticketQuality)} tone="sky" />
            <MetricCard icon={BarChart3} label="PMS reliability" value={formatPercent(metrics.pmsContextReliability)} tone="violet" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <section className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
              <div className={cn('border-b px-5 py-4', isLight ? 'border-slate-200' : 'border-white/10')}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className={ui.text.eyebrow(isLight)}>{tx('Failure classification')}</p>
                    <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>{tx('Conversations requiring review')}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={result.criticalFailures ? 'red' : 'emerald'}>{result.criticalFailures || 0} critical</StatusPill>
                    <StatusPill tone={result.unsafeCount ? 'red' : 'emerald'}>{result.unsafeCount || 0} unsafe</StatusPill>
                    <StatusPill tone="amber">{result.totalFailures || 0} total failures</StatusPill>
                  </div>
                </div>
              </div>

              <div className="executive-scroll overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className={isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/[0.025] text-slate-500'}>
                    <tr>
                      <th className="px-5 py-3 font-semibold">{tx('Severity')}</th>
                      <th className="px-5 py-3 font-semibold">{tx('Scenario')}</th>
                      <th className="px-5 py-3 font-semibold">{tx('Language')}</th>
                      <th className="px-5 py-3 font-semibold">{tx('Intent')}</th>
                      <th className="px-5 py-3 font-semibold">{tx('Categories')}</th>
                      <th className="px-5 py-3 font-semibold">{tx('Review')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviews.length ? reviews : classifications.slice(0, 12)).map((item) => (
                      <tr
                        key={item.resultId}
                        onClick={() => setSelectedId(item.resultId)}
                        className={cn(
                          'cursor-pointer border-t transition',
                          isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-white/10 hover:bg-white/[0.035]',
                          selectedId === item.resultId ? (isLight ? 'bg-emerald-50/80' : 'bg-emerald-300/[0.06]') : ''
                        )}
                      >
                        <td className="px-5 py-3"><StatusPill tone={severityTone(item.severity)}>{item.severity || 'PASS'}</StatusPill></td>
                        <td className="px-5 py-3 font-semibold">{item.scenario}</td>
                        <td className="px-5 py-3 uppercase">{item.language || 'unknown'}</td>
                        <td className="px-5 py-3">{item.intent || 'unknown'}</td>
                        <td className="px-5 py-3">
                          <div className="flex max-w-xl flex-wrap gap-1.5">
                            {(item.categories || ['clean']).slice(0, 4).map((category) => (
                              <StatusPill key={category} tone={category === 'clean' ? 'emerald' : 'slate'}>{category}</StatusPill>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3">{tx(item.requiresManualReview ? 'manual' : 'auto')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <ConversationReplay replay={selectedReplay} />
          </div>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={ui.text.eyebrow(isLight)}>{tx('Failure trends')}</p>
                <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>{tx('Patterns before go-live')}</h3>
              </div>
              <StatusPill tone="sky">Historical run saved in memory</StatusPill>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <TrendList title="Scenarios with most failures" items={trends.scenariosWithMostFailures} />
              <TrendList title="Languages with worst performance" items={trends.languagesWithWorstPerformance} />
              <TrendList title="Problematic guest types" items={trends.problematicGuestTypes} />
              <TrendList title="Simulated hotels with most errors" items={trends.hotelsWithMostErrors} />
              <TrendList title="Dangerous intents" items={trends.dangerousIntents} />
              <TrendList title="Top failure categories" items={trends.topFailureCategories} />
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('AI improvement suggestions')}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(result.suggestions || []).length ? result.suggestions.map((suggestion) => (
                <div key={suggestion} className={cn('rounded-xl border p-4 text-sm leading-6', ui.surface(isLight, 'subtle'))}>
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                    <p className={ui.text.body(isLight)}>{tx(suggestion)}</p>
                  </div>
                </div>
              )) : (
                <p className={cn('text-sm', ui.text.muted(isLight))}>{tx('No improvement suggestion generated for this run.')}</p>
              )}
            </div>
          </section>

          <HistorySection history={history} />
        </>
      ) : (
        <section className={cn('rounded-xl border border-dashed p-8 text-center', isLight ? 'border-slate-300 bg-white text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
          <ShieldAlert className="mx-auto h-9 w-9 text-emerald-300" aria-hidden="true" />
          <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>{tx('No AI quality run yet.')}</p>
          <p className="mt-1 text-sm">{tx('Run a private simulation analysis to classify failures and review conversation replays.')}</p>
        </section>
      )}
    </div>
  );
};

const ConversationReplay = ({ replay }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const result = replay?.conversation;
  const classification = replay?.classification;

  if (!result) return null;

  return (
    <aside className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Conversation replay')}</p>
          <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>{tx(result.scenario_label)}</h3>
          <p className={cn('mt-1 text-sm', ui.text.muted(isLight))}>{result.hotel_name} / {result.guest_name}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-emerald-300" aria-hidden="true" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <StatusPill tone={severityTone(classification?.severity)}>{classification?.severity || 'PASS'}</StatusPill>
        <StatusPill tone="sky">{tx('Confidence')} {Number(result.confidence || 0).toFixed(2)}</StatusPill>
        <StatusPill tone={classification?.requiresManualReview ? 'red' : 'emerald'}>{classification?.requiresManualReview ? 'Manual review' : 'Auto review'}</StatusPill>
        <StatusPill tone={result.revenue_opportunity ? 'violet' : 'slate'}>{result.revenue_opportunity ? 'Revenue signal' : 'No revenue signal'}</StatusPill>
      </div>

      {classification?.unsafeReason ? (
        <div className={cn('mt-4 rounded-xl border px-4 py-3 text-sm leading-6', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          <p className="font-semibold">{tx('Unsafe reason')}</p>
          <p className="mt-1">{tx(classification.unsafeReason)}</p>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <ReplayBlock title="Guest message" icon={MessageSquareText}>
          {(result.messages || []).map((message) => (
            <p key={message.content} className="whitespace-pre-wrap">{message.content}</p>
          ))}
        </ReplayBlock>
        <ReplayBlock title="AI response" icon={Bot}>
          {(result.ai_responses || []).map((message) => (
            <p key={message.content} className="whitespace-pre-wrap">{message.content}</p>
          ))}
        </ReplayBlock>
        <ReplayBlock title="Failure categories" icon={AlertTriangle}>
          <div className="flex flex-wrap gap-1.5">
            {(classification?.categories || ['clean']).map((category) => (
              <StatusPill key={category} tone={category === 'clean' ? 'emerald' : 'amber'}>{category}</StatusPill>
            ))}
          </div>
        </ReplayBlock>
        <ReplayBlock title="Internal reasoning" icon={BrainCircuit}>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('Intent')}</dt><dd className="text-right font-semibold">{tx(result.detected_intent)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('Language')}</dt><dd className="text-right font-semibold uppercase">{result.detected_language}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('Escalation')}</dt><dd className="text-right font-semibold">{tx(result.escalation_required ? 'yes' : 'no')}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('Ticket')}</dt><dd className="text-right font-semibold">{tx(result.ticket_created ? result.ticket_category : 'none')}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('PMS phase')}</dt><dd className="text-right font-semibold">{tx(result.analysis?.pms_context?.stayPhase || 'unknown')}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('Guest profile')}</dt><dd className="text-right font-semibold">{tx(result.analysis?.guest_intelligence?.profileType || result.guest_type)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('Automation')}</dt><dd className="text-right font-semibold">{tx('preview only')}</dd></div>
          </dl>
        </ReplayBlock>
        {result.errors?.length || result.warnings?.length ? (
          <ReplayBlock title="Simulation warnings" icon={XCircle}>
            <ul className="space-y-2">
              {[...(result.errors || []), ...(result.warnings || [])].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>{tx(item)}</span>
                </li>
              ))}
            </ul>
          </ReplayBlock>
        ) : null}
      </div>
    </aside>
  );
};

const ReplayBlock = ({ title, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border p-4 text-sm leading-6', ui.surface(isLight, 'subtle'))}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        <p className={cn('font-semibold', ui.text.title(isLight))}>{tx(title)}</p>
      </div>
      <div className={isLight ? 'text-slate-600' : 'text-slate-400'}>
        {children}
      </div>
    </section>
  );
};

const HistorySection = ({ history = [] }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Historical AI quality logs')}</p>
          <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>{tx('Version comparison trail')}</h3>
        </div>
        <StatusPill tone="slate">{tx(`${history.length} runs`)}</StatusPill>
      </div>

      <div className="mt-4 space-y-3">
        {history.length ? history.slice(0, 6).map((item) => (
          <article key={item.id} className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{item.aiVersion}</p>
                <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{new Date(item.runAt).toLocaleString()} / {tx(`${item.filters?.count || 0} conversations`)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone="emerald">{tx('Score')} {formatPercent(item.qualityMetrics?.globalAiScore)}</StatusPill>
                <StatusPill tone={item.criticalFailures ? 'red' : 'emerald'}>{item.criticalFailures || 0} critical</StatusPill>
                <StatusPill tone={item.unsafeCount ? 'red' : 'slate'}>{item.unsafeCount || 0} unsafe</StatusPill>
              </div>
            </div>
          </article>
        )) : (
          <p className={cn('text-sm', ui.text.muted(isLight))}>{tx('No historical QA runs yet.')}</p>
        )}
      </div>
    </section>
  );
};
