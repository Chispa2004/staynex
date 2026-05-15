'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';

export const StepKnowledgeBase = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const generate = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/onboarding/knowledge-starter', {
        method: 'POST',
        headers: await getAuthHeaders()
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create starter knowledge base');
      }

      setFeedback({ type: 'success', text: `${body.count || 0} knowledge entries ready.` });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ExecutiveCard className="p-6">
      <ExecutiveBadge tone="violet">Step 4</ExecutiveBadge>
      <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>Knowledge Base</h2>
      <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Seed the hotel with useful answers for breakfast, WiFi, parking, restaurant, spa and policies.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['breakfast', 'wifi', 'checkout', 'parking', 'spa', 'pool', 'restaurant', 'room service'].map((item) => (
          <div key={item} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 text-sm font-semibold text-slate-300'}>
            {item}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={generate} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
          <Sparkles className="h-4 w-4" />
          {saving ? 'Generating...' : 'Generate starter knowledge base'}
        </button>
        <Link href="/dashboard/knowledge" className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
          <BookOpen className="h-4 w-4" />
          Edit Knowledge Base
        </Link>
      </div>

      {feedback ? <p className={feedback.type === 'error' ? 'mt-4 text-sm text-red-400' : 'mt-4 text-sm text-emerald-500'}>{feedback.text}</p> : null}
    </ExecutiveCard>
  );
};
