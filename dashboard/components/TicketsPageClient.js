'use client';

import { AlertCircle, BrainCircuit, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { TicketsTable } from '@/components/TicketsTable';
import { PremiumLoadingState } from './PremiumLoadingState';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';

export const TicketsPageClient = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const loadTickets = async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setTickets([]);
    setError(null);

    try {
      const response = await fetch('/api/tickets', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load tickets');
      }

      if (!shouldAcceptTenantPayload(body, 'tickets')) {
        return;
      }

      if (requestId !== requestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'tickets', hotelId: body.hotelId });
        }
        return;
      }

      setTickets(body.tickets || []);
    } catch (caughtError) {
      setError(caughtError);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const copilotInsights = [
    {
      label: 'Urgent risk',
      value: tickets.filter((ticket) => ticket.copilot?.aiPriority?.level === 'urgent' || ticket.priority === 'urgent').length,
      icon: ShieldAlert
    },
    {
      label: 'High satisfaction risk',
      value: tickets.filter((ticket) => ticket.copilot?.satisfactionRisk?.level === 'high').length,
      icon: AlertCircle
    },
    {
      label: 'AI prioritized',
      value: tickets.filter((ticket) => ticket.copilot?.aiPriority?.level && ticket.copilot.aiPriority.level !== 'low').length,
      icon: BrainCircuit
    }
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          titleKey="screens.tickets"
          descriptionKey="screens.ticketsDescription"
        />

        <button
          type="button"
          onClick={loadTickets}
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          Refresh
        </button>
      </div>

      {!loading && !error ? (
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white">Today AI Copilot Insights</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Reception-facing risk, urgency and prioritization across the current ticket queue.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {copilotInsights.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {item.label}
                    </div>
                    <p className="mt-1 text-xl font-semibold text-white">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <PremiumLoadingState title="Loading tickets" description="Staynex is preparing this hotel's operational queue." rows={5} cards={3} />
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">No se pudieron cargar los tickets.</p>
              <p className="mt-1 text-red-100/80">{error.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <TicketsTable tickets={tickets} />
      )}
    </section>
  );
};
