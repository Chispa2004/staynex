'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { DemoActionCard } from './DemoActionCard';
import { DemoStatsPanel } from './DemoStatsPanel';

export const DemoControlCenter = ({ scenarios }) => {
  const [stats, setStats] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    const response = await fetch('/api/demo/stats');
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || 'Could not load demo stats');
    }

    setStats(body.stats);
  };

  useEffect(() => {
    loadStats().catch((caughtError) => setError(caughtError.message));
  }, []);

  const runScenario = async (scenarioId) => {
    setRunningId(scenarioId);
    setError(null);

    try {
      const response = await fetch('/api/demo/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ scenarioId })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not run demo scenario');
      }

      setLastResult(body);
      await loadStats();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setRunningId(null);
    }
  };

  const cleanDemo = async () => {
    setCleaning(true);
    setError(null);

    try {
      const response = await fetch('/api/demo/clean', {
        method: 'DELETE'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not clean demo data');
      }

      setLastResult({
        scenario: { title: 'Demo data cleaned' },
        result: { ai: { reply: `Removed ${body.deletedGuests} demo guest records and related data.` } }
      });
      await loadStats();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((scenario) => (
            <DemoActionCard
              key={scenario.id}
              scenario={scenario}
              running={runningId === scenario.id}
              onRun={runScenario}
            />
          ))}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {lastResult ? (
          <div
            className={[
              'rounded-lg border bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/15',
              lastResult.result.ai?.emergency
                ? 'border-red-400/50 shadow-2xl shadow-red-500/10'
                : 'border-white/10'
            ].join(' ')}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {lastResult.result.ai?.emergency ? (
                    <AlertTriangle className="h-4 w-4 animate-pulse text-red-300" aria-hidden="true" />
                  ) : null}
                  <p className="text-sm font-semibold text-white">{lastResult.scenario.title}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {lastResult.result.ai?.reply}
                </p>
              </div>
              {lastResult.result.ticket ? (
                <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  Ticket created
                </span>
              ) : (
                <span className="w-fit rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
                  Knowledge answer
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <DemoStatsPanel stats={stats} />
        <button
          type="button"
          onClick={loadStats}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 shadow-lg shadow-black/10 transition hover:bg-white/[0.08]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Refresh stats
        </button>
        <button
          type="button"
          disabled={cleaning}
          onClick={cleanDemo}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 shadow-lg shadow-red-500/10 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Limpiar datos demo
        </button>
      </div>
    </div>
  );
};
