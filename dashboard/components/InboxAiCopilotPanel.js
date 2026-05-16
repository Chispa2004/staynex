'use client';

import Link from 'next/link';
import { AlertTriangle, BadgeEuro, BrainCircuit, CalendarCheck, CheckCircle2, Clock3, Sparkles, UserRound, XCircle } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatCurrency = (value, currency = 'EUR') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
}).format(Number(value || 0));

const Pill = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tones = {
    emerald: isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    red: isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100',
    orange: isLight ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-orange-300/20 bg-orange-400/10 text-orange-100',
    violet: isLight ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-violet-300/20 bg-violet-400/10 text-violet-100',
    sky: isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    slate: isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
};

const Section = ({ title, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={isLight ? 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
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

export const InboxAiCopilotPanel = ({
  conversation,
  humanEscalation,
  onOfferAction,
  onClose,
  compact = false
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const offers = conversation?.offers || [];
  const upsells = conversation?.upsells || [];
  const experienceBookings = conversation?.experienceBookings || [];
  const memory = conversation?.guestMemory || [];
  const aiState = conversation?.aiState || null;
  const activeOffer = offers[0] || null;
  const revenuePotential = offers.reduce((total, offer) => total + Number(offer.suggested_price || 0), 0);

  return (
    <aside className={[
      'flex min-h-0 flex-col overflow-hidden',
      compact ? 'h-full' : '',
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#080c14] text-slate-100'
    ].join(' ')}
    >
      <div className={isLight ? 'flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4' : 'flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0b1019] px-4 py-4'}>
        <div>
          <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>AI Copilot</p>
          <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>Context, offers and operational signals</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:bg-white/[0.08]'}>
            <XCircle className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="executive-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Section title="AI State" icon={BrainCircuit}>
          <div className="flex flex-wrap gap-2">
            <Pill tone="violet">Intent: {aiState?.current_intent || 'learning'}</Pill>
            <Pill tone="sky">{Math.round(Number(aiState?.intent_confidence || 0) * 100)}% confidence</Pill>
            <Pill tone={aiState?.escalation_level === 'ai_handled' ? 'slate' : 'orange'}>{aiState?.escalation_level || 'ai_handled'}</Pill>
            <Pill tone={aiState?.sentiment === 'negative' ? 'red' : 'slate'}>{aiState?.sentiment || 'neutral'}</Pill>
            {aiState?.openai_enhanced ? <Pill tone="emerald">OpenAI enhanced</Pill> : null}
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
                    {booking.partner_name || 'Internal concierge'} / potential {formatCurrency(booking.estimated_revenue)}
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

        <Section title="Guest Memory" icon={UserRound}>
          {memory.length ? (
            <div className="space-y-2">
              {memory.slice(0, 8).map((item) => (
                <div key={item.id} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-300'}>
                  <span className="font-semibold">{item.memory_key}</span>: {item.memory_value}
                </div>
              ))}
            </div>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>No saved memory yet.</p>
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
