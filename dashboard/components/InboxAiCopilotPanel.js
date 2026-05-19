'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  BadgeEuro,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MessageSquareText,
  ShieldAlert,
  Sparkles,
  UserRound,
  XCircle
} from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatCurrency = (value, currency = 'EUR') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatPercent = (value) => `${Math.round(Number(value || 0) * 100)}%`;

const Pill = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tones = {
    emerald: isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    red: isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100',
    orange: isLight ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-orange-300/20 bg-orange-400/10 text-orange-100',
    amber: isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    violet: isLight ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-violet-300/20 bg-violet-400/10 text-violet-100',
    sky: isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    slate: isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
};

const Section = ({ title, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={isLight ? 'premium-fade-in rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md' : 'premium-fade-in rounded-xl border border-white/10 bg-white/[0.025] p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.04]'}>
      <div className="mb-3 flex items-center gap-2">
        {Icon ? <Icon className={isLight ? 'h-4 w-4 text-slate-500' : 'h-4 w-4 text-slate-400'} /> : null}
        <h3 className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{title}</h3>
      </div>
      {children}
    </section>
  );
};

const ActionButton = ({ children, onClick, disabled = false, tone = 'slate', title }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const base = 'inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45';
  const tones = {
    emerald: isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15',
    red: isLight ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100' : 'border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15',
    orange: isLight ? 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100' : 'border-orange-300/20 bg-orange-400/10 text-orange-100 hover:bg-orange-400/15',
    slate: isLight ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
  };

  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${tones[tone] || tones.slate}`}>
      {children}
    </button>
  );
};

const safeCopilot = (conversation, humanEscalation) => {
  const lastGuest = [...(conversation?.messages || [])].reverse().find((message) => message.sender_type === 'guest');
  const language = lastGuest?.original_language || conversation?.guest?.preferred_language || 'en';

  return {
    sentiment: { label: conversation?.aiState?.sentiment || 'neutral', tone: 'slate', confidence: 0.55, reasons: ['Basic AI state signal'] },
    priority: { level: humanEscalation?.needsHuman ? 'high' : 'low', tone: humanEscalation?.needsHuman ? 'orange' : 'slate', confidence: 0.55, reasons: [humanEscalation?.reason || 'No urgent signal'] },
    suggestedAction: {
      title: humanEscalation?.needsHuman ? 'Review personally' : 'Reply normally',
      detail: humanEscalation?.needsHuman ? 'Reception should review the conversation before promising a resolution.' : 'No critical operational blocker is visible.',
      tone: humanEscalation?.needsHuman ? 'orange' : 'slate'
    },
    suggestedReply: {
      text: humanEscalation?.needsHuman
        ? 'Thanks for letting us know. I will ask reception to review this personally and come back to you shortly.'
        : 'Of course, I can help with that. Let me check the best option for your stay.',
      language,
      confidence: 0.55
    },
    summary: {
      bullets: [
        conversation?.guest?.current_room ? `Room ${conversation.guest.current_room}` : null,
        lastGuest?.content ? `Latest guest message: ${lastGuest.content}` : 'No recent guest message'
      ].filter(Boolean)
    },
    revenueOpportunity: { label: 'No active revenue signal', amount: 0, currency: 'EUR', confidence: 0.3, tone: 'slate', source: 'none' },
    vip: { probability: 0.12, label: 'Standard guest', tone: 'slate', reasons: ['No VIP signal'] },
    escalationRisk: { level: humanEscalation?.needsHuman ? 'medium' : 'low', tone: humanEscalation?.needsHuman ? 'orange' : 'emerald', reasons: [humanEscalation?.reason || 'No escalation pattern'] },
    language,
    guestSnapshot: {
      room: conversation?.guest?.current_room || null,
      phone: conversation?.guest?.phone_number || null,
      memoryCount: (conversation?.guestMemory || []).length,
      bookingsCount: (conversation?.experienceBookings || []).length,
      lastIntent: conversation?.aiState?.current_intent || conversation?.aiLog?.detected_intent || null
    }
  };
};

export const InboxAiCopilotPanel = ({
  conversation,
  humanEscalation,
  onOfferAction,
  onClose,
  compact = false
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [copied, setCopied] = useState(false);
  const offers = conversation?.offers || [];
  const upsells = conversation?.upsells || [];
  const experienceBookings = conversation?.experienceBookings || [];
  const memory = conversation?.guestMemory || [];
  const aiState = conversation?.aiState || null;
  const activeOffer = offers[0] || null;
  const revenuePotential = offers.reduce((total, offer) => total + Number(offer.suggested_price || 0), 0);
  const copilot = conversation?.copilot || safeCopilot(conversation, humanEscalation);
  const summaryBullets = copilot.summary?.bullets || [];

  const copySuggestedReply = async () => {
    if (!copilot.suggestedReply?.text || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(copilot.suggestedReply.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <aside className={[
      'flex min-h-0 flex-col overflow-hidden',
      compact ? 'h-full' : '',
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#080c14] text-slate-100'
    ].join(' ')}
    >
      <div className={isLight ? 'flex shrink-0 items-center justify-between border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_35%),#fff] px-4 py-4' : 'flex shrink-0 items-center justify-between border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_35%),#0b1019] px-4 py-4'}>
        <div className="flex items-center gap-3">
          <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-100' : 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 shadow-lg shadow-emerald-950/20'}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>AI Copilot</p>
            <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>Reception intelligence for this guest</p>
          </div>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:bg-white/[0.08]'}>
            <XCircle className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="executive-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sentiment</p>
            <div className="mt-2"><Pill tone={copilot.sentiment?.tone}>{copilot.sentiment?.label || 'neutral'}</Pill></div>
            <p className="mt-2 text-xs text-slate-500">{formatPercent(copilot.sentiment?.confidence)} confidence</p>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Priority</p>
            <div className="mt-2"><Pill tone={copilot.priority?.tone}>{copilot.priority?.level || 'low'}</Pill></div>
            <p className="mt-2 text-xs text-slate-500">{formatPercent(copilot.priority?.confidence)} confidence</p>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Escalation risk</p>
            <div className="mt-2"><Pill tone={copilot.escalationRisk?.tone}>{copilot.escalationRisk?.level || 'low'}</Pill></div>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">VIP probability</p>
            <div className="mt-2"><Pill tone={copilot.vip?.tone}>{copilot.vip?.label || 'Standard guest'}</Pill></div>
            <p className="mt-2 text-xs text-slate-500">{formatPercent(copilot.vip?.probability)}</p>
          </div>
        </div>

        <Section title="Suggested Action" icon={ShieldAlert}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={copilot.suggestedAction?.tone}>{copilot.suggestedAction?.title || 'Reply normally'}</Pill>
            <Pill tone="sky">Language {String(copilot.language || 'en').toUpperCase()}</Pill>
          </div>
          <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>
            {copilot.suggestedAction?.detail || 'No operational recommendation yet.'}
          </p>
        </Section>

        <Section title="Generate Professional Reply" icon={MessageSquareText}>
          <p className={isLight ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-slate-700' : 'rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-3 text-sm leading-6 text-slate-200'}>
            {copilot.suggestedReply?.text}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="emerald">Reply ready</Pill>
            <Pill tone="sky">{String(copilot.suggestedReply?.language || copilot.language || 'en').toUpperCase()}</Pill>
            <ActionButton onClick={copySuggestedReply} tone="emerald">
              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy reply'}
            </ActionButton>
          </div>
        </Section>

        <Section title="Conversation Summary" icon={BrainCircuit}>
          {summaryBullets.length ? (
            <ul className={isLight ? 'space-y-2 text-sm leading-6 text-slate-600' : 'space-y-2 text-sm leading-6 text-slate-400'}>
              {summaryBullets.slice(0, 5).map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>No conversation summary yet.</p>
          )}
        </Section>

        <Section title="Revenue Opportunity" icon={BadgeEuro}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={copilot.revenueOpportunity?.tone}>{copilot.revenueOpportunity?.label || 'No active revenue signal'}</Pill>
            {Number(copilot.revenueOpportunity?.amount || 0) > 0 ? (
              <Pill tone="emerald">{formatCurrency(copilot.revenueOpportunity.amount, copilot.revenueOpportunity.currency)}</Pill>
            ) : null}
            {upsells.slice(0, 3).map((upsell) => (
              <Pill key={upsell.id} tone="violet">{upsell.upsell_type}</Pill>
            ))}
          </div>
        </Section>

        <Section title="Guest Profile Snapshot" icon={UserRound}>
          <div className="flex flex-wrap gap-2">
            <Pill tone="slate">Room {copilot.guestSnapshot?.room || '-'}</Pill>
            <Pill tone="slate">Phone {copilot.guestSnapshot?.phone || '-'}</Pill>
            <Pill tone="violet">{copilot.guestSnapshot?.memoryCount || 0} memory signals</Pill>
            <Pill tone="sky">{copilot.guestSnapshot?.bookingsCount || 0} bookings</Pill>
            {copilot.guestSnapshot?.lastIntent ? <Pill tone="emerald">{copilot.guestSnapshot.lastIntent}</Pill> : null}
          </div>
          {memory.length ? (
            <div className="mt-3 space-y-2">
              {memory.slice(0, 4).map((item) => (
                <div key={item.id} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-300'}>
                  <span className="font-semibold">{item.memory_key}</span>: {item.memory_value}
                </div>
              ))}
            </div>
          ) : null}
        </Section>

        <Section title="Guest Stay Context" icon={CalendarCheck}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={copilot.pmsContext?.stayPhase === 'pre_checkout' ? 'orange' : 'slate'}>
              Stay {copilot.pmsContext?.stayPhase || 'unknown'}
            </Pill>
            <Pill tone={copilot.pmsContext?.roomStatus?.housekeepingStatus === 'dirty' ? 'orange' : 'slate'}>
              Room {copilot.pmsContext?.roomStatus?.housekeepingStatus || 'unknown'}
            </Pill>
            <Pill tone={copilot.pmsContext?.roomStatus?.maintenanceStatus === 'maintenance' ? 'red' : 'slate'}>
              Maintenance {copilot.pmsContext?.roomStatus?.maintenanceStatus || 'unknown'}
            </Pill>
            {copilot.pmsContext?.upgradeEligible ? <Pill tone="emerald">Upgrade eligible</Pill> : null}
            {copilot.pmsContext?.lateCheckoutEligible ? <Pill tone="emerald">Late checkout eligible</Pill> : null}
            {Number(copilot.pmsContext?.revenuePotential || 0) > 0 ? (
              <Pill tone="emerald">PMS revenue {formatCurrency(copilot.pmsContext.revenuePotential)}</Pill>
            ) : null}
          </div>
          {copilot.pmsContext?.warnings?.length ? (
            <p className={isLight ? 'mt-3 text-xs leading-5 text-slate-500' : 'mt-3 text-xs leading-5 text-slate-500'}>
              {copilot.pmsContext.warnings.join(' / ')}
            </p>
          ) : null}
        </Section>

        <Section title="AI State" icon={BrainCircuit}>
          <div className="flex flex-wrap gap-2">
            <Pill tone="violet">Intent: {aiState?.current_intent || conversation?.aiLog?.detected_intent || 'learning'}</Pill>
            <Pill tone="sky">{Math.round(Number(aiState?.intent_confidence || conversation?.aiLog?.confidence_score || 0) * 100)}% confidence</Pill>
            <Pill tone={aiState?.escalation_level === 'ai_handled' ? 'slate' : 'orange'}>{aiState?.escalation_level || 'ai_handled'}</Pill>
          </div>
          {(aiState?.ai_summary || aiState?.last_ai_response) ? (
            <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>
              {aiState.ai_summary || aiState.last_ai_response}
            </p>
          ) : null}
        </Section>

        {humanEscalation?.needsHuman ? (
          <Section title="Reception Attention" icon={AlertTriangle}>
            <Pill tone="orange">Needs human</Pill>
            <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>
              Reason: {humanEscalation.reason || 'manual review'}
            </p>
          </Section>
        ) : null}

        <Section title="AI Offer" icon={BadgeEuro}>
          {activeOffer ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{activeOffer.offer_type}</p>
                  <Pill tone="emerald">{formatCurrency(activeOffer.suggested_price, activeOffer.currency)}</Pill>
                </div>
                <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-400'}>
                  {activeOffer.ai_reason || 'Detected by AI Concierge Revenue Copilot'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton tone="emerald" onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'send' })}>Send AI Offer</ActionButton>
                <ActionButton onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'accept' })}>Accept Offer</ActionButton>
                <ActionButton tone="red" onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'reject' })}>Reject Offer</ActionButton>
                <ActionButton tone="orange" onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'escalate' })}>Escalate</ActionButton>
              </div>
            </div>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>No active AI offer.</p>
          )}
        </Section>

        <Section title="Revenue & Upsells" icon={Sparkles}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={revenuePotential > 0 ? 'emerald' : 'slate'}>Potential {formatCurrency(revenuePotential)}</Pill>
            {upsells.slice(0, 3).map((upsell) => (
              <Pill key={upsell.id} tone="violet">{upsell.upsell_type}</Pill>
            ))}
          </div>
        </Section>

        <Section title="Experience Bookings" icon={CalendarCheck}>
          {experienceBookings.length ? (
            <div className="space-y-2">
              {experienceBookings.slice(0, 4).map((booking) => (
                <div key={booking.id} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-300'}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{booking.experience_title}</span>
                    <Pill tone={booking.status === 'confirmed' ? 'emerald' : 'amber'}>{booking.status}</Pill>
                  </div>
                  <p className="mt-1 text-xs opacity-75">
                    {booking.metadata?.revenue_owner === 'staynex' || booking.metadata?.revenue_type === 'partner_marketplace'
                      ? `${booking.partner_name || 'Partner provider'} / partner experience`
                      : `${booking.partner_name || 'Internal concierge'} / potential ${formatCurrency(booking.estimated_revenue)}`}
                  </p>
                </div>
              ))}
              <Link href="/dashboard/experience-bookings" className={isLight ? 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]'}>
                Open booking workflow
              </Link>
            </div>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>No active experience booking request.</p>
          )}
        </Section>

        <Section title="Quick Actions" icon={CheckCircle2}>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton disabled title="Coming soon">Create ticket</ActionButton>
            <ActionButton tone="orange" disabled title="Coming soon">Escalate to reception</ActionButton>
            <ActionButton disabled title="Coming soon">Mark resolved</ActionButton>
            <ActionButton disabled title="Coming soon">Add memory</ActionButton>
            {conversation?.guest_id ? (
              <Link href={`/dashboard/guest-memory/${conversation.guest_id}`} className={isLight ? 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]'}>
                Guest profile
              </Link>
            ) : (
              <ActionButton disabled title="No guest linked">Guest profile</ActionButton>
            )}
            <ActionButton disabled title="Coming soon">Open reservation</ActionButton>
          </div>
        </Section>

        <Section title="Operational Context" icon={Clock3}>
          <div className="space-y-2">
            <Pill tone="slate">Phone {conversation?.guest?.phone_number || '-'}</Pill>
            <Pill tone="slate">Room {conversation?.guest?.current_room || '-'}</Pill>
            <Pill tone="slate">Status {conversation?.status || '-'}</Pill>
          </div>
        </Section>
      </div>
    </aside>
  );
};
