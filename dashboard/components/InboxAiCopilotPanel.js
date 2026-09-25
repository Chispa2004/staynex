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
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { buildConversationCopilot } from '@/lib/ai-copilot';
import { localizeCopilotText } from '@/lib/i18n/copilot-phrases';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatCurrency = (value, currency = 'EUR') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatPercent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const formatLabel = (value) => String(value || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const translateSignal = (value, labels = {}) => labels[String(value || '').toLowerCase()] || formatLabel(value);

const sentimentLabels = {
  angry: 'Molesto',
  frustrated: 'Frustrado',
  negative: 'Negativo',
  positive: 'Positivo',
  happy: 'Contento',
  neutral: 'Neutral',
  calm: 'Tranquilo',
  confused: 'Confundido',
  urgent: 'Urgente'
};

const priorityLabels = {
  low: 'Baja',
  normal: 'Normal',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente'
};

const actionLabels = {
  'Review personally': 'Revisar personalmente',
  'Reply normally': 'Responder con normalidad'
};

const vipLabels = {
  'Standard guest': 'Huésped estándar'
};

const stayPhaseLabels = {
  pre_arrival: 'Pre-estancia',
  in_house: 'Durante estancia',
  pre_checkout: 'Antes de check-out',
  post_stay: 'Post-estancia',
  unknown: 'Sin fase PMS'
};

const roomStatusLabels = {
  clean: 'lista',
  dirty: 'pendiente',
  inspected: 'revisada',
  maintenance: 'mantenimiento',
  unknown: 'sin estado'
};

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

export const InboxAiCopilotPanel = ({
  conversation,
  humanEscalation,
  onOfferAction,
  onClose,
  compact = false
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const { tx } = useDashboardLanguage();
  const staffText = value => localizeCopilotText(value, tx);
  const [copied, setCopied] = useState(false);
  const offers = conversation?.offers || [];
  const upsells = conversation?.upsells || [];
  const experienceBookings = conversation?.experienceBookings || [];
  const activeOffer = offers[0] || null;
  const revenuePotential = offers.reduce((total, offer) => total + Number(offer.suggested_price || 0), 0);
  const copilot = conversation?.copilot || buildConversationCopilot(conversation || {});
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
      'flex h-full max-h-full min-h-0 min-w-0 flex-col overflow-hidden break-words',
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#080c14] text-slate-100'
    ].join(' ')}
    >
      <div className={isLight ? 'sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_35%),#fff] px-4 py-4' : 'sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_35%),#0b1019] px-4 py-4'}>
        <div className="flex items-center gap-3">
          <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-100' : 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 shadow-lg shadow-emerald-950/20'}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{tx("Asistencia IA")}</p>
            <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>{tx("Contexto operativo para recepción")}</p>
          </div>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label={tx('Cerrar asistencia IA')} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:bg-white/[0.08]'}>
            <XCircle className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="executive-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tx("Sentimiento")}</p>
            <div className="mt-2"><Pill tone={copilot.sentiment?.tone}>{tx(translateSignal(copilot.sentiment?.label || 'neutral', sentimentLabels))}</Pill></div>
            <p className="mt-2 text-xs text-slate-500">{formatPercent(copilot.sentiment?.confidence)} {tx('fiabilidad')}</p>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tx("Prioridad")}</p>
            <div className="mt-2"><Pill tone={copilot.priority?.tone}>{tx(translateSignal(copilot.priority?.level || 'low', priorityLabels))}</Pill></div>
            <p className="mt-2 text-xs text-slate-500">{formatPercent(copilot.priority?.confidence)} {tx('fiabilidad')}</p>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tx("Riesgo de escalación")}</p>
            <div className="mt-2"><Pill tone={copilot.escalationRisk?.tone}>{tx(translateSignal(copilot.escalationRisk?.level || 'low', priorityLabels))}</Pill></div>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tx("Perfil huésped")}</p>
            <div className="mt-2"><Pill tone={copilot.vip?.tone}>{staffText(vipLabels[copilot.vip?.label] || copilot.vip?.label || 'Huésped estándar')}</Pill></div>
            <p className="mt-2 text-xs text-slate-500">{formatPercent(copilot.vip?.probability)}</p>
          </div>
        </div>

        <Section title={tx("Siguiente paso recomendado")} icon={ShieldAlert}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={copilot.suggestedAction?.tone}>{staffText(actionLabels[copilot.suggestedAction?.title] || copilot.suggestedAction?.title || 'Responder con normalidad')}</Pill>
            <Pill tone="sky">{tx('Idioma del huésped')} {String(copilot.language || 'es').toUpperCase()}</Pill>
          </div>
          <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>
            {staffText(copilot.suggestedAction?.detail || 'Sin recomendación operativa todavía.')}
          </p>
        </Section>

        <Section title={tx("Respuesta sugerida")} icon={MessageSquareText}>
          <p className={isLight ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-slate-700' : 'rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-3 text-sm leading-6 text-slate-200'}>
            {copilot.suggestedReply?.text}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="emerald">{tx("Lista para revisar")}</Pill>
            <Pill tone="sky">{String(copilot.suggestedReply?.language || copilot.language || 'es').toUpperCase()}</Pill>
            <ActionButton onClick={copySuggestedReply} tone="emerald">
              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {tx(copied ? 'Copiada' : 'Copiar respuesta')}
            </ActionButton>
          </div>
        </Section>

        <Section title={tx("Resumen de conversación")} icon={BrainCircuit}>
          {summaryBullets.length ? (
            <ul className={isLight ? 'space-y-2 text-sm leading-6 text-slate-600' : 'space-y-2 text-sm leading-6 text-slate-400'}>
              {summaryBullets.slice(0, 5).map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span>{staffText(item)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>{tx("Todavía no hay resumen de conversación.")}</p>
          )}
        </Section>

        <Section title={tx("Oportunidad comercial")} icon={BadgeEuro}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={copilot.revenueOpportunity?.tone}>{staffText(copilot.revenueOpportunity?.label || 'Sin oportunidad comercial activa')}</Pill>
            {Number(copilot.revenueOpportunity?.amount || 0) > 0 ? (
              <Pill tone="emerald">{formatCurrency(copilot.revenueOpportunity.amount, copilot.revenueOpportunity.currency)}</Pill>
            ) : null}
            {upsells.slice(0, 3).map((upsell) => (
              <Pill key={upsell.id} tone="violet">{staffText(formatLabel(upsell.upsell_type))}</Pill>
            ))}
          </div>
        </Section>

        <Section title={tx("Contexto del huésped")} icon={UserRound}>
          <div className="flex flex-wrap gap-2">
            <Pill tone="slate">{tx('Habitación')} {copilot.guestSnapshot?.room || '-'}</Pill>
            <Pill tone="sky">{copilot.guestSnapshot?.bookingsCount || 0} {tx('reservas de experiencias')}</Pill>
            {copilot.guestSnapshot?.lastIntent ? <Pill tone="emerald">{staffText(formatLabel(copilot.guestSnapshot.lastIntent))}</Pill> : null}
          </div>
        </Section>

        <Section title={tx("Contexto PMS de la estancia")} icon={CalendarCheck}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={copilot.pmsContext?.stayPhase === 'pre_checkout' ? 'orange' : 'slate'}>
              {tx('Estancia')} {tx(translateSignal(copilot.pmsContext?.stayPhase || 'unknown', stayPhaseLabels))}
            </Pill>
            <Pill tone={copilot.pmsContext?.roomStatus?.housekeepingStatus === 'dirty' ? 'orange' : 'slate'}>
              {tx('Habitación')} {tx(translateSignal(copilot.pmsContext?.roomStatus?.housekeepingStatus || 'unknown', roomStatusLabels))}
            </Pill>
            <Pill tone={copilot.pmsContext?.roomStatus?.maintenanceStatus === 'maintenance' ? 'red' : 'slate'}>
              {tx('Mantenimiento')} {tx(translateSignal(copilot.pmsContext?.roomStatus?.maintenanceStatus || 'unknown', roomStatusLabels))}
            </Pill>
            {copilot.pmsContext?.upgradeEligible ? <Pill tone="emerald">{tx("Upgrade elegible")}</Pill> : null}
            {copilot.pmsContext?.lateCheckoutEligible ? <Pill tone="emerald">{tx("Late check-out elegible")}</Pill> : null}
            {Number(copilot.pmsContext?.revenuePotential || 0) > 0 ? (
              <Pill tone="emerald">{tx('Ingresos PMS')} {formatCurrency(copilot.pmsContext.revenuePotential)}</Pill>
            ) : null}
          </div>
          {copilot.pmsContext?.warnings?.length ? (
            <p className={isLight ? 'mt-3 text-xs leading-5 text-slate-500' : 'mt-3 text-xs leading-5 text-slate-500'}>
              {copilot.pmsContext.warnings.map(staffText).join(' / ')}
            </p>
          ) : null}
        </Section>

        {humanEscalation?.needsHuman ? (
          <Section title={tx("Atención de recepción")} icon={AlertTriangle}>
            <Pill tone="orange">{tx("Requiere humano")}</Pill>
            <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>
              {tx('Motivo')}: {staffText(formatLabel(humanEscalation.reason || 'revisión manual'))}
            </p>
          </Section>
        ) : null}

        <Section title={tx("Oferta sugerida")} icon={BadgeEuro}>
          {activeOffer ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{staffText(formatLabel(activeOffer.offer_type))}</p>
                  <Pill tone="emerald">{formatCurrency(activeOffer.suggested_price, activeOffer.currency)}</Pill>
                </div>
                <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-400'}>
                  {activeOffer.ai_reason || tx('Detectado por Staynex como posible oportunidad comercial.')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton tone="emerald" onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'send' })}>{tx("Preparar envío")}</ActionButton>
                <ActionButton onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'accept' })}>{tx("Marcar aceptada")}</ActionButton>
                <ActionButton tone="red" onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'reject' })}>{tx("Descartar")}</ActionButton>
                <ActionButton tone="orange" onClick={() => onOfferAction?.({ offerId: activeOffer.id, action: 'escalate' })}>{tx("Pasar a recepción")}</ActionButton>
              </div>
            </div>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>{tx("Sin oferta activa.")}</p>
          )}
        </Section>

        <Section title={tx("Revenue y upsells")} icon={Sparkles}>
          <div className="flex flex-wrap gap-2">
            <Pill tone={revenuePotential > 0 ? 'emerald' : 'slate'}>{tx('Potencial')} {formatCurrency(revenuePotential)}</Pill>
            {upsells.slice(0, 3).map((upsell) => (
              <Pill key={upsell.id} tone="violet">{staffText(formatLabel(upsell.upsell_type))}</Pill>
            ))}
          </div>
        </Section>

        <Section title={tx("Reservas de experiencias")} icon={CalendarCheck}>
          {experienceBookings.length ? (
            <div className="space-y-2">
              {experienceBookings.slice(0, 4).map((booking) => (
                <div key={booking.id} className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-300'}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{booking.experience_title}</span>
                    <Pill tone={booking.status === 'confirmed' ? 'emerald' : 'amber'}>{staffText(formatLabel(booking.status))}</Pill>
                  </div>
                  <p className="mt-1 text-xs opacity-75">
                    {booking.metadata?.revenue_owner === 'staynex' || booking.metadata?.revenue_type === 'partner_marketplace'
                      ? `${booking.partner_name || tx('Proveedor partner')} / ${tx('experiencia partner')}`
                      : `${booking.partner_name || tx('Concierge interno')} / ${tx('Potencial')} ${formatCurrency(booking.estimated_revenue)}`}
                  </p>
                </div>
              ))}
              <Link href="/dashboard/experience-bookings" className={isLight ? 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]'}>
                {tx('Abrir reservas de experiencias')}
              </Link>
            </div>
          ) : (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>{tx("No hay solicitudes de experiencias activas.")}</p>
          )}
        </Section>

        <Section title={tx("Contexto operativo")} icon={Clock3}>
          <div className="space-y-2">
            <Pill tone="slate">{tx('Habitación')} {conversation?.guest?.current_room || '-'}</Pill>
            <Pill tone="slate">{tx('Estado')} {staffText(formatLabel(conversation?.status || 'sin estado'))}</Pill>
          </div>
        </Section>
      </div>
    </aside>
  );
};
