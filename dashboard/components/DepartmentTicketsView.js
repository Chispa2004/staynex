'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DepartmentTicketTable } from './DepartmentTicketTable';
import { PageHeader } from './PageHeader';
import { TicketStatsCards } from './TicketStatsCards';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { PremiumEmptyState } from './PremiumEmptyState';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

export const DepartmentTicketsView = ({
  title,
  titleKey,
  eyebrow,
  description,
  descriptionKey,
  categories
}) => {
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
      const response = await fetch(`/api/tickets?categories=${encodeURIComponent(categories.join(','))}`, {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load tickets');
      }

      if (!shouldAcceptTenantPayload(body, 'department-tickets')) {
        return;
      }

      if (requestId !== requestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'department-tickets', hotelId: body.hotelId });
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
  }, [categories.join(',')]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          titleKey={titleKey}
          descriptionKey={descriptionKey}
          fallbackTitle={title}
          fallbackDescription={description}
          eyebrowKey={eyebrow === 'Operations' ? 'screens.operations' : undefined}
        />

        <button
          type="button"
          onClick={loadTickets}
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <PremiumEmptyState title="Loading tickets..." description="Staynex is loading this hotel workspace only." />
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">Could not load tickets.</p>
              <p className="mt-1 text-red-100/80">{error.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <TicketStatsCards tickets={tickets} />
          <DepartmentTicketTable tickets={tickets} categories={categories} />
        </>
      )}
    </section>
  );
};
