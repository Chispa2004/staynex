'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ExternalLink, FlaskConical, MessageCircle } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';

const tomorrow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const StepTestFlow = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [creating, setCreating] = useState(false);
  const [demoing, setDemoing] = useState(false);
  const [result, setResult] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const createReservation = async () => {
    setCreating(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/reservations/create-test', {
        method: 'POST',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: 'Laura Garcia',
          guest_email: 'laura@example.com',
          guest_phone: '+34600000000',
          arrival_date: tomorrow(14),
          departure_date: tomorrow(17),
          adults: 2,
          children: 0,
          room_type: 'Deluxe',
          rate_plan: 'Breakfast included',
          board_basis: 'breakfast',
          notes: 'Created from onboarding test flow'
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create test reservation');
      }

      setResult(body.reservation);
      setFeedback({ type: 'success', text: 'Test reservation created. Token and WhatsApp link are ready.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setCreating(false);
    }
  };

  const createDemoData = async () => {
    setDemoing(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/onboarding/demo-data', {
        method: 'POST',
        headers: await getAuthHeaders()
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create demo data');
      }

      setFeedback({ type: 'success', text: 'Demo conversation and ticket created.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setDemoing(false);
    }
  };

  return (
    <ExecutiveCard className="p-6">
      <ExecutiveBadge tone="amber">Step 7</ExecutiveBadge>
      <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>Test flow</h2>
      <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Create a real Staynex test reservation through the current reservation simulator, generate a token and verify Inbox readiness.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={createReservation} disabled={creating} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
          <FlaskConical className="h-4 w-4" />
          {creating ? 'Creating...' : 'Create test reservation'}
        </button>
        <button type="button" onClick={createDemoData} disabled={demoing} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-60'}>
          <MessageCircle className="h-4 w-4" />
          {demoing ? 'Creating...' : 'Create demo data'}
        </button>
      </div>

      {result ? (
        <div className={isLight ? 'mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4' : 'mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>Reservation ready</p>
          <p className={isLight ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-400'}>Token: <span className="font-mono">{result.reservation_access_token || 'generated'}</span></p>
          {result.whatsapp_link ? (
            <a href={result.whatsapp_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200">
              Open WhatsApp
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      ) : null}

      {feedback ? <p className={feedback.type === 'error' ? 'mt-4 text-sm text-red-400' : 'mt-4 text-sm text-emerald-500'}>{feedback.text}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/dashboard/inbox" className={isLight ? 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>Open Inbox</Link>
        <Link href="/dashboard/reservations" className={isLight ? 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>Open Reservations</Link>
      </div>
    </ExecutiveCard>
  );
};
