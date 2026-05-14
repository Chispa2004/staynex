'use client';

import Link from 'next/link';
import { AlertTriangle, BrainCircuit, MessageSquareText, TrendingUp } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const ConversationIntelligencePanel = ({ data = {} }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const states = data.states || [];

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>AI Conversation Intelligence</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Intent shifts, escalations and high-value conversations.</p>
        </div>
        <ExecutiveBadge tone="violet">
          <BrainCircuit className="mr-1 h-3.5 w-3.5" />
          Context
        </ExecutiveBadge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={AlertTriangle} label="Escalations" value={data.activeEscalations || 0} tone={(data.activeEscalations || 0) > 0 ? 'red' : 'slate'} />
        <Metric icon={AlertTriangle} label="Complaints" value={data.unresolvedComplaints || 0} tone={(data.unresolvedComplaints || 0) > 0 ? 'amber' : 'slate'} />
        <Metric icon={MessageSquareText} label="Frustration" value={data.repeatedFrustrations || 0} tone={(data.repeatedFrustrations || 0) > 0 ? 'red' : 'slate'} />
        <Metric icon={TrendingUp} label="High value" value={data.highValueConversations || 0} tone="emerald" />
        <Metric icon={BrainCircuit} label="Attention" value={data.guestsRequiringAttention || 0} tone={(data.guestsRequiringAttention || 0) > 0 ? 'amber' : 'slate'} />
        <Metric icon={BrainCircuit} label="OpenAI handled" value={data.openAiHandled || 0} tone="violet" />
        <Metric icon={TrendingUp} label="AI resolution" value={`${data.aiResolutionRate || 0}%`} tone="emerald" />
        <Metric icon={TrendingUp} label="Avg confidence" value={`${data.avgAiConfidence || 0}%`} tone="sky" />
        <Metric icon={MessageSquareText} label="Satisfaction" value={`${data.aiSatisfactionEstimate || 0}/100`} tone="emerald" />
        <Metric icon={TrendingUp} label="AI revenue" value={new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(data.aiRevenueGenerated || 0))} tone="emerald" />
      </div>

      <div className="mt-5 grid gap-2 lg:grid-cols-2">
        {states.length === 0 ? (
          <div className={isLight ? 'rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 lg:col-span-2' : 'rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm text-slate-500 lg:col-span-2'}>
            No active conversation state yet.
          </div>
        ) : states.map((state) => (
          <Link
            key={state.id}
            href={`/dashboard/inbox?conversationId=${state.conversation_id}`}
            className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:bg-white' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.055]'}
          >
            <div className="flex items-center justify-between gap-3">
                <p className={isLight ? 'truncate text-sm font-semibold text-slate-950' : 'truncate text-sm font-semibold text-white'}>{state.current_intent || 'learning'}</p>
              <div className="flex items-center gap-1.5">
                {state.openai_enhanced ? <ExecutiveBadge tone="violet">OpenAI</ExecutiveBadge> : null}
                <ExecutiveBadge tone={state.escalation_level === 'ai_handled' ? 'slate' : state.escalation_level === 'urgent' ? 'red' : 'amber'}>
                  {state.escalation_level}
                </ExecutiveBadge>
              </div>
            </div>
            <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
              {Math.round(Number(state.intent_confidence || 0) * 100)}% confidence - sentiment {state.sentiment || 'neutral'}
            </p>
          </Link>
        ))}
      </div>
    </ExecutiveCard>
  );
};

const Metric = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
      <div className="flex items-center justify-between gap-3">
        <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>{label}</p>
        <ExecutiveBadge tone={tone}>
          <Icon className="h-3.5 w-3.5" />
        </ExecutiveBadge>
      </div>
      <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-950' : 'mt-2 text-xl font-semibold text-white'}>{value}</p>
    </div>
  );
};
