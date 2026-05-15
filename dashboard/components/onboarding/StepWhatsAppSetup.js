'use client';

import { MessageCircle, Copy } from 'lucide-react';
import { useState } from 'react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const StepWhatsAppSetup = ({ hotel }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://your-backend-url';
  const webhookUrl = `${backendUrl.replace(/\/$/, '')}/webhooks/whatsapp`;
  const hasNumber = Boolean(hotel?.whatsapp_number);

  const copy = async () => {
    await navigator.clipboard?.writeText(webhookUrl);
  };

  const sendTestMessage = async () => {
    setTesting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/demo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: 'towels-208' })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not run WhatsApp test flow');
      }

      setFeedback({ type: 'success', text: 'Test message processed. Check Inbox and Tickets.' });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ExecutiveCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <ExecutiveBadge tone="emerald">Step 3</ExecutiveBadge>
          <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>WhatsApp setup</h2>
          <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Connect your Twilio WhatsApp sender by pointing inbound messages to Staynex.</p>
        </div>
        <ExecutiveBadge tone={hasNumber ? 'emerald' : 'amber'}>{hasNumber ? 'Number saved' : 'Pending Twilio'}</ExecutiveBadge>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>Twilio inbound webhook</p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={webhookUrl} className={isLight ? 'min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700' : 'min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300'} />
            <button type="button" onClick={copy} className={isLight ? 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100' : 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-200 hover:bg-white/[0.08]'}>
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>Paste this URL in Twilio WhatsApp Sandbox or Messaging Service webhook configuration.</p>
        </div>
        <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <MessageCircle className="h-5 w-5 text-emerald-400" />
          <p className={isLight ? 'mt-3 text-sm font-semibold text-slate-950' : 'mt-3 text-sm font-semibold text-white'}>Status</p>
          <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>
            {hasNumber ? `Configured number: ${hotel.whatsapp_number}` : 'Add the WhatsApp number in Hotel setup, then configure Twilio with the webhook URL.'}
          </p>
          <button type="button" onClick={sendTestMessage} disabled={testing} className="mt-4 rounded-lg border border-emerald-200/60 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200 disabled:opacity-60">
            {testing ? 'Testing...' : 'Run test message'}
          </button>
          {feedback ? (
            <p className={feedback.type === 'error' ? 'mt-3 text-sm text-red-400' : 'mt-3 text-sm text-emerald-500'}>{feedback.text}</p>
          ) : null}
        </div>
      </div>
    </ExecutiveCard>
  );
};
