'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Hotel,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  TrendingUp,
  XCircle
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const counts = [10, 50, 100, 500];

const fallbackHotelTypes = [
  { id: 'all', label: 'All hotel types' },
  { id: 'urban', label: 'Hotel urbano' },
  { id: 'resort', label: 'Resort vacacional' },
  { id: 'boutique', label: 'Boutique hotel' },
  { id: 'family', label: 'Hotel familiar' },
  { id: 'luxury', label: 'Hotel lujo' },
  { id: 'riad-marrakech', label: 'Riad en Marrakech' }
];

const fallbackScenarios = [
  { id: 'all', label: 'All scenarios' },
  { id: 'late_checkout', label: 'Late checkout' },
  { id: 'airport_transfer', label: 'Transfer aeropuerto' },
  { id: 'spa_booking', label: 'Reserva spa' },
  { id: 'restaurant', label: 'Restaurante' },
  { id: 'noise_complaint', label: 'Queja por ruido' },
  { id: 'broken_ac', label: 'Aire acondicionado roto' },
  { id: 'cleaning_request', label: 'Solicitud de limpieza' },
  { id: 'hours_question', label: 'Pregunta horarios' },
  { id: 'excursion_recommendation', label: 'Recomendacion de excursion' },
  { id: 'room_upgrade', label: 'Upgrade de habitacion' },
  { id: 'vip_guest', label: 'Huesped VIP' },
  { id: 'angry_guest', label: 'Huesped enfadado' },
  { id: 'french_guest', label: 'Huesped en frances' },
  { id: 'english_guest', label: 'Huesped en ingles' },
  { id: 'spanish_guest', label: 'Huesped en espanol' },
  { id: 'ambiguous_request', label: 'Peticion ambigua' },
  { id: 'real_urgency', label: 'Urgencia real' }
];

const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

const statusTone = (result) => {
  if (result?.pass) return 'emerald';
  if (result?.unsafe_response || result?.hallucination_warning) return 'red';
  return 'amber';
};

const StatusPill = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  return <span className={ui.badge(isLight, tone, true)}>{children}</span>;
};

const MetricCard = ({ icon: Icon, label, value, helper, tone = 'emerald' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{label}</p>
          <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
          {helper ? <p className={cn('mt-1 text-xs', isLight ? 'text-slate-500' : 'text-slate-500')}>{helper}</p> : null}
        </div>
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', ui.badge(isLight, tone))}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export const SimulationModeClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [count, setCount] = useState(10);
  const [hotelType, setHotelType] = useState('all');
  const [scenario, setScenario] = useState('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  const hotelTypes = useMemo(() => {
    const remote = result?.catalog?.hotelTypes?.map((item) => ({ id: item.id, label: item.label })) || [];
    return [{ id: 'all', label: 'All hotel types' }, ...remote].filter((item, index, list) => (
      list.findIndex((candidate) => candidate.id === item.id) === index
    ));
  }, [result]);
  const scenarios = useMemo(() => {
    const remote = result?.catalog?.scenarios || [];
    return [{ id: 'all', label: 'All scenarios' }, ...remote].filter((item, index, list) => (
      list.findIndex((candidate) => candidate.id === item.id) === index
    ));
  }, [result]);
  const visibleHotelTypes = hotelTypes.length > 1 ? hotelTypes : fallbackHotelTypes;
  const visibleScenarios = scenarios.length > 1 ? scenarios : fallbackScenarios;
  const selectedResult = (result?.results || []).find((item) => item.id === selectedId) || result?.results?.[0] || null;
  const metrics = result?.metrics || {};

  const runSimulation = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders())
        },
        body: JSON.stringify({ count, hotelType, scenario })
      });
      const body = await response.json();

      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Simulation failed');
      }

      setResult(body);
      setSelectedId(body.results?.[0]?.id || null);
    } catch (requestError) {
      setError(requestError.message || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="emerald">Safe sandbox</StatusPill>
              <StatusPill tone="sky">No WhatsApp delivery</StatusPill>
              <StatusPill tone="violet">Automations preview only</StatusPill>
            </div>
            <h2 className={cn('mt-4 text-xl font-semibold', ui.text.title(isLight))}>Run operational simulation</h2>
            <p className={cn('mt-2 max-w-3xl', ui.text.body(isLight))}>
              Generate fictional hotels, PMS context, guests and WhatsApp-style conversations to validate Staynex before a real go-live.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[130px_190px_220px_auto]">
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>Conversations</span>
              <select className={cn('w-full', ui.input(isLight))} value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {counts.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>Hotel type</span>
              <select className={cn('w-full', ui.input(isLight))} value={hotelType} onChange={(event) => setHotelType(event.target.value)}>
                {visibleHotelTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={ui.text.eyebrow(isLight)}>Scenario</span>
              <select className={cn('w-full', ui.input(isLight))} value={scenario} onChange={(event) => setScenario(event.target.value)}>
                {visibleScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={runSimulation} disabled={loading} className={cn(ui.button(isLight, 'primary'), 'min-h-11 self-end')}>
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Running...' : 'Run simulation'}
            </button>
          </div>
        </div>
        {error ? (
          <div className={cn('mt-4 rounded-lg border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
            {error}
          </div>
        ) : null}
      </section>

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={CheckCircle2} label="Success rate" value={formatPercent(metrics.successRate)} helper={`${metrics.total || 0} conversations`} />
            <MetricCard icon={AlertTriangle} label="Escalation accuracy" value={formatPercent(metrics.escalationAccuracy)} tone="amber" />
            <MetricCard icon={TicketCheck} label="Ticket accuracy" value={formatPercent(metrics.ticketCreationAccuracy)} tone="sky" />
            <MetricCard icon={TrendingUp} label="Revenue detection" value={formatPercent(metrics.revenueOpportunityDetection)} tone="violet" />
            <MetricCard icon={Bot} label="Avg confidence" value={Number(metrics.averageConfidence || 0).toFixed(2)} helper="AI decision confidence" />
            <MetricCard icon={XCircle} label="Failed conversations" value={metrics.failedConversations || 0} tone={metrics.failedConversations ? 'red' : 'emerald'} />
            <MetricCard icon={MessageSquareText} label="Repeated responses" value={metrics.repeatedResponses || 0} tone={metrics.repeatedResponses ? 'amber' : 'emerald'} />
            <MetricCard icon={ShieldCheck} label="Unsafe / hallucination" value={`${metrics.unsafeResponses || 0}/${metrics.hallucinationWarnings || 0}`} tone={(metrics.unsafeResponses || metrics.hallucinationWarnings) ? 'red' : 'emerald'} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <section className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className={ui.text.eyebrow(isLight)}>Simulation results</p>
                  <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>Conversation evaluation</h3>
                </div>
                <StatusPill tone="emerald">In-memory sandbox</StatusPill>
              </div>
              <div className="executive-scroll overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className={isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/[0.025] text-slate-500'}>
                    <tr>
                      <th className="px-5 py-3 font-semibold">Scenario</th>
                      <th className="px-5 py-3 font-semibold">Hotel</th>
                      <th className="px-5 py-3 font-semibold">Intent</th>
                      <th className="px-5 py-3 font-semibold">Language</th>
                      <th className="px-5 py-3 font-semibold">Ticket</th>
                      <th className="px-5 py-3 font-semibold">Revenue</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.results || []).map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          'cursor-pointer border-t transition',
                          isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-white/10 hover:bg-white/[0.035]',
                          selectedResult?.id === item.id ? (isLight ? 'bg-emerald-50/80' : 'bg-emerald-300/[0.06]') : ''
                        )}
                      >
                        <td className="px-5 py-3 font-semibold">{item.scenario_label}</td>
                        <td className="px-5 py-3">{item.hotel_name}</td>
                        <td className="px-5 py-3">{item.detected_intent}</td>
                        <td className="px-5 py-3 uppercase">{item.detected_language}</td>
                        <td className="px-5 py-3">{item.ticket_created ? item.ticket_category || 'yes' : 'no'}</td>
                        <td className="px-5 py-3">{item.revenue_opportunity ? 'yes' : 'no'}</td>
                        <td className="px-5 py-3">
                          <StatusPill tone={statusTone(item)}>{item.pass ? 'Pass' : 'Review'}</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <SimulationDetail result={selectedResult} />
          </div>
        </>
      ) : (
        <section className={cn('rounded-xl border border-dashed p-8 text-center', isLight ? 'border-slate-300 bg-white text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
          <Sparkles className="mx-auto h-8 w-8 text-emerald-300" aria-hidden="true" />
          <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>No simulation has run yet.</p>
          <p className="mt-1 text-sm">Choose a size, hotel type and scenario, then run a safe sandbox test.</p>
        </section>
      )}
    </div>
  );
};

const SimulationDetail = ({ result }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (!result) {
    return null;
  }

  return (
    <aside className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Conversation detail</p>
          <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>{result.scenario_label}</h3>
          <p className={cn('mt-1 text-sm', ui.text.muted(isLight))}>{result.hotel_name} / {result.guest_name}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-emerald-300" aria-hidden="true" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <StatusPill tone={statusTone(result)}>{result.pass ? 'Pass' : 'Needs review'}</StatusPill>
        <StatusPill tone="sky">Confidence {Number(result.confidence || 0).toFixed(2)}</StatusPill>
        <StatusPill tone={result.escalation_required ? 'amber' : 'emerald'}>{result.escalation_required ? 'Escalation' : 'No escalation'}</StatusPill>
        <StatusPill tone={result.revenue_opportunity ? 'violet' : 'slate'}>{result.revenue_opportunity ? 'Revenue opportunity' : 'No revenue'}</StatusPill>
      </div>

      <div className="mt-5 space-y-4">
        <DetailBlock title="Guest message" icon={MessageSquareText}>
          {(result.messages || []).map((message) => (
            <p key={message.content} className="whitespace-pre-wrap">{message.content}</p>
          ))}
        </DetailBlock>

        <DetailBlock title="AI response" icon={Bot}>
          {(result.ai_responses || []).map((message) => (
            <p key={message.content} className="whitespace-pre-wrap">{message.content}</p>
          ))}
        </DetailBlock>

        <DetailBlock title="Internal analysis" icon={Hotel}>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Intent</dt><dd className="text-right font-semibold">{result.detected_intent}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Language</dt><dd className="text-right font-semibold uppercase">{result.detected_language}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Ticket</dt><dd className="text-right font-semibold">{result.ticket_created ? result.ticket_category : 'none'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">PMS phase</dt><dd className="text-right font-semibold">{result.analysis?.pms_context?.stayPhase || 'unknown'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Guest type</dt><dd className="text-right font-semibold">{result.analysis?.guest_intelligence?.profileType || result.guest_type}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Automation</dt><dd className="text-right font-semibold">preview only</dd></div>
          </dl>
        </DetailBlock>

        {result.errors?.length || result.warnings?.length ? (
          <DetailBlock title="Errors and warnings" icon={AlertTriangle}>
            <ul className="space-y-2">
              {[...(result.errors || []), ...(result.warnings || [])].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </DetailBlock>
        ) : null}
      </div>
    </aside>
  );
};

const DetailBlock = ({ title, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border p-4 text-sm leading-6', ui.surface(isLight, 'subtle'))}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        <p className={cn('font-semibold', ui.text.title(isLight))}>{title}</p>
      </div>
      <div className={isLight ? 'text-slate-600' : 'text-slate-400'}>
        {children}
      </div>
    </section>
  );
};
