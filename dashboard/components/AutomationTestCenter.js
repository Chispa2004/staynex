'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  Play,
  Send,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

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

const formatLabel = (value) => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const priorityTone = (priority) => {
  if (priority === 'CRITICAL') return 'red';
  if (priority === 'HIGH') return 'amber';
  if (priority === 'MEDIUM') return 'sky';
  return 'slate';
};

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn(ui.card(isLight), className)}>
      {children}
    </section>
  );
};

const Badge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <span className={ui.badge(isLight, tone)}>
      {children}
    </span>
  );
};

const KeyValue = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.04] p-3'}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-60">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value ?? '-'}</p>
    </div>
  );
};

export function AutomationTestCenter() {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const inputClass = ui.input(isLight);
  const [scenarios, setScenarios] = useState([]);
  const [timeOptions, setTimeOptions] = useState([]);
  const [config, setConfig] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState('arriving_tomorrow');
  const [simulatedNow, setSimulatedNow] = useState('now');
  const [customNow, setCustomNow] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/automations/test-center', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load Automation Test Center');
      }

      setScenarios(body.scenarios || []);
      setTimeOptions(body.simulatedNowOptions || []);
      setConfig(body.config || null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const runPreview = async ({ sendTest = false } = {}) => {
    sendTest ? setSending(true) : setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/automations/test-center', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scenario_id: selectedScenario,
          simulatedNow,
          customNow: simulatedNow === 'custom' ? customNow : null,
          dryRun: true,
          sendTest
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not run Automation Test Center');
      }

      setResult(body);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setGenerating(false);
      setSending(false);
    }
  };

  const guest = result?.simulatedGuest;
  const safetyItems = useMemo(() => {
    const safety = result?.safety || config || {};
    return [
      ['Test mode', safety.testMode ?? safety.safeMode],
      ['No guest messages', safety.noGuestMessages ?? safety.liveGuestMessagesBlocked],
      ['Dry-run default', safety.dryRun ?? safety.dryRunDefault],
      ['Live sending blocked', safety.liveSendingBlocked ?? safety.liveGuestMessagesBlocked],
      ['SEND_AUTOMATIONS enabled', safety.sendAutomationsEnabled ?? safety.sendAutomations],
      ['Test send enabled', safety.automationTestSendEnabled ?? safety.sendEnabled],
      ['Internal number configured', safety.testWhatsappNumberConfigured ?? safety.testNumberConfigured],
      ['PMS untouched', safety.pmsTouched === false],
      ['Ubikos untouched', safety.ubikosTouched === false]
    ];
  }, [config, result]);

  return (
    <Card className={isLight ? 'overflow-hidden bg-gradient-to-br from-white via-white to-sky-50/80 p-5' : 'overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),#0b1019] p-5'}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="sky">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Test mode
            </Badge>
            <Badge tone="emerald">No guest messages</Badge>
            <Badge tone="amber">Safe preview</Badge>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Automation Test Center</h2>
          <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-300'}>
            Simulate guests, reservations, folios, sentiment and timing before connecting Ubikos real. Every run is dry-run by default and never uses the simulated guest phone for test sending.
          </p>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-3 xl:min-w-[390px]">
          <KeyValue label="Mode" value="Safe preview" />
          <KeyValue label="Internal send" value={config?.sendEnabled ? 'Enabled' : 'Disabled'} />
          <KeyValue label="Test number" value={config?.testNumberConfigured ? 'Configured' : 'Missing'} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.8fr_0.9fr_auto]">
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] opacity-60">Scenario</span>
          <select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)} className={inputClass}>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] opacity-60">Simulated now</span>
          <select value={simulatedNow} onChange={(event) => setSimulatedNow(event.target.value)} className={inputClass}>
            {timeOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] opacity-60">Custom datetime</span>
          <input
            type="datetime-local"
            value={customNow}
            onChange={(event) => setCustomNow(event.target.value)}
            disabled={simulatedNow !== 'custom'}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col justify-end gap-2 sm:flex-row lg:flex-col">
          <button
            type="button"
            onClick={() => runPreview({ sendTest: false })}
            disabled={loading || generating}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200/60 bg-sky-300 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/15 transition hover:bg-sky-200 disabled:cursor-wait disabled:opacity-60"
          >
            <Play className={generating ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
            Generate preview
          </button>
          <button
            type="button"
            onClick={() => runPreview({ sendTest: true })}
            disabled={loading || sending}
            className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60'}
          >
            <Send className={sending ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
            Send test to internal number
          </button>
        </div>
      </div>

      {error ? (
        <div className={cn(ui.notice(isLight, 'danger'), 'mt-4')}>
          {error}
        </div>
      ) : null}

      {result?.sendResult?.requested && result.sendResult.status !== 'sent_test' ? (
        <div className={cn(ui.notice(isLight, 'warning'), 'mt-4')}>
          {result.sendResult.warning}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
          <div className="space-y-4">
            <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-sky-400" aria-hidden="true" />
                <p className="text-sm font-semibold">Simulated guest data</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <KeyValue label="Guest" value={guest?.name} />
                <KeyValue label="Phone" value={guest?.phone_number || 'Missing'} />
                <KeyValue label="Room" value={guest?.room} />
                <KeyValue label="Language" value={guest?.language} />
                <KeyValue label="Reservation" value={guest?.pms_reservation_id || 'Missing PMS data'} />
                <KeyValue label="Balance" value={`${guest?.balance_due || 0} ${guest?.currency || 'EUR'}`} />
                <KeyValue label="Check-in" value={guest?.checkIn} />
                <KeyValue label="Check-out" value={guest?.checkOut} />
              </div>
            </section>

            <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <p className="text-sm font-semibold">Safety checks</p>
              </div>
              <div className="mt-3 grid gap-2">
                {safetyItems.map(([label, passed]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    {passed ? (
                      <Badge tone="emerald">safe</Badge>
                    ) : (
                      <Badge tone="amber">blocked</Badge>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {result.automationHealth ? (
              <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <p className="text-sm font-semibold">Automation health</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <KeyValue label="Generated" value={result.automationHealth.generated} />
                  <KeyValue label="Suppressed" value={result.automationHealth.suppressed} />
                  <KeyValue label="Duplicates blocked" value={result.automationHealth.duplicatesBlocked} />
                  <KeyValue label="Fatigue blocked" value={result.automationHealth.fatigueBlocked} />
                  <KeyValue label="Cooldown blocked" value={result.automationHealth.cooldownBlocked} />
                  <KeyValue label="Priority suppressed" value={result.automationHealth.prioritySuppressed} />
                </div>
                {result.automationHealth.fatigueGuardDecisions?.length ? (
                  <div className="mt-3 space-y-1.5">
                    {result.automationHealth.fatigueGuardDecisions.slice(0, 6).map((decision) => (
                      <div key={`${decision.automation_type}-${decision.decision}`} className="flex items-center justify-between gap-3 text-xs">
                        <span>{formatLabel(decision.automation_type)}</span>
                        <div className="flex items-center gap-2">
                          <Badge tone={priorityTone(decision.priority)}>{decision.priority}</Badge>
                          <Badge tone={decision.decision === 'generated' ? 'emerald' : 'amber'}>{formatLabel(decision.decision)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="space-y-4">
            {result.revenueFollowUp?.active ? (
              <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    <p className="text-sm font-semibold">Revenue follow-up dry-run</p>
                  </div>
                  <Badge tone="sky">Dry run</Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <KeyValue label="Guest message" value={result.revenueFollowUp.guest_message} />
                  <KeyValue label="Detected intent" value={formatLabel(result.revenueFollowUp.detected_intent)} />
                  <KeyValue label="Provider handoff" value={formatLabel(result.revenueFollowUp.provider_handoff)} />
                  <KeyValue label="Reservation request" value={formatLabel(result.revenueFollowUp.reservation_request)} />
                </div>
                <div className={isLight ? 'mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3' : 'mt-3 rounded-lg border border-white/10 bg-black/10 p-3'}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">Next message preview</p>
                  <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-700' : 'mt-2 text-sm leading-6 text-slate-300'}>
                    {result.revenueFollowUp.next_message}
                  </p>
                </div>
                <p className="mt-2 text-xs opacity-60">
                  Confirmation path: {formatLabel(result.revenueFollowUp.confirmation_request)}
                </p>
              </section>
            ) : null}

            <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <p className="text-sm font-semibold">Generated previews</p>
                </div>
                <Badge tone="sky">{result.previews?.length || 0}</Badge>
              </div>
              <div className="mt-3 grid gap-3">
                {(result.previews || []).map((preview) => (
                  <article key={preview.id} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.04] p-3'}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="emerald">{formatLabel(preview.automation_type)}</Badge>
                      <Badge tone={priorityTone(preview.priority)}>{preview.priority || 'LOW'}</Badge>
                      <Badge tone="slate">{formatDate(preview.scheduled_for)}</Badge>
                    </div>
                    <div className={isLight ? 'mt-3 rounded-lg border border-slate-200 bg-white p-3' : 'mt-3 rounded-lg border border-white/10 bg-black/10 p-3'}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">Guest message preview</p>
                      <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-700' : 'mt-2 text-sm leading-6 text-slate-300'}>
                        {preview.guest_message_preview || preview.message_body}
                      </p>
                    </div>
                    {preview.internal_reasoning ? (
                      <div className={isLight ? 'mt-3 rounded-lg border border-slate-200 bg-slate-100/70 p-3' : 'mt-3 rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">Internal reasoning</p>
                        <dl className="mt-2 grid gap-1.5 text-xs md:grid-cols-2">
                          {Object.entries(preview.internal_reasoning).map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-3">
                              <dt className="opacity-60">{formatLabel(key)}</dt>
                              <dd className="text-right font-semibold">{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs opacity-60">Trigger: {formatLabel(preview.trigger_reason)}</p>
                  </article>
                ))}
                {result.previews?.length === 0 ? (
                  <p className="text-sm opacity-60">No previews generated for this scenario.</p>
                ) : null}
              </div>
            </section>

            <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <p className="text-sm font-semibold">Skipped automations</p>
                </div>
                <Badge tone="amber">{result.skippedAutomations?.length || 0}</Badge>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(result.skippedAutomations || []).map((item) => (
                  <div key={item.type} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm' : 'rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm'}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.name}</p>
                      <Badge tone={priorityTone(item.priority)}>{item.priority || 'LOW'}</Badge>
                    </div>
                    <p className="mt-1 text-xs opacity-60">{formatLabel(item.reason)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <p className="text-sm font-semibold">Dry-run logs</p>
              </div>
              <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200/10">
                {(result.logs || []).slice(0, 14).map((log) => (
                  <div key={`${log.automation_type}-${log.status}`} className={isLight ? 'grid gap-2 border-b border-slate-200 px-3 py-2 text-xs last:border-b-0 md:grid-cols-[0.9fr_0.8fr_1fr]' : 'grid gap-2 border-b border-white/10 px-3 py-2 text-xs last:border-b-0 md:grid-cols-[0.9fr_0.8fr_1fr]'}>
                    <span className="font-semibold">{formatLabel(log.automation_type)}</span>
                    <span>{formatLabel(log.status)}</span>
                    <span className="opacity-60">{formatLabel(log.reason)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className={isLight ? 'mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600' : 'mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400'}>
          <Clock className="mb-2 h-4 w-4 text-sky-400" aria-hidden="true" />
          Choose a scenario and generate a safe preview. No PMS, Ubikos or live guest messaging will be touched.
        </div>
      )}
    </Card>
  );
}
