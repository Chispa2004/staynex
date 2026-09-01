'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, CheckCircle2, Circle, Loader2, PlayCircle, ShieldAlert } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './Badge';
import { TicketAgeLabel } from './TicketAgeLabel';
import { TicketCategoryIcon } from './TicketCategoryIcon';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { getAuthHeaders } from '@/lib/auth-headers';

const STATUS_ACTIONS = [
  { value: 'open', labelKey: 'buttons.open', icon: Circle },
  { value: 'in_progress', labelKey: 'buttons.inProgress', icon: PlayCircle },
  { value: 'completed', labelKey: 'buttons.complete', icon: CheckCircle2 }
];

const sortByNewest = (items) => [...items].sort(
  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);

const formatDate = (value) => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const categoryLabels = {
  maintenance: 'Mantenimiento',
  emergency: 'Emergencia',
  housekeeping: 'Pisos',
  room_service: 'Servicio de habitaciones',
  hotel_info: 'Información del hotel',
  transport: 'Transporte',
  reception: 'Recepción',
  complaint: 'Incidencia huésped',
  guest_request: 'Solicitud huésped'
};

const priorityLabels = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente'
};

const departmentLabels = {
  reception: 'Recepción',
  'front desk': 'Recepción',
  maintenance: 'Mantenimiento',
  housekeeping: 'Pisos',
  operations: 'Operaciones'
};

const riskLabels = {
  low: 'Riesgo bajo',
  medium: 'Riesgo medio',
  high: 'Riesgo alto',
  urgent: 'Riesgo urgente'
};

const roomStatusLabels = {
  clean: 'Habitación lista',
  inspected: 'Habitación revisada',
  dirty: 'Habitación pendiente',
  occupied: 'Ocupada',
  vacant: 'Libre',
  maintenance: 'En mantenimiento',
  out_of_order: 'Fuera de servicio',
  unknown: 'Sin estado'
};

const formatText = (value, fallback, labels = {}) => {
  if (!value) {
    return fallback;
  }

  const normalized = String(value).trim();
  const key = normalized.toLowerCase();
  return labels[key] || labels[normalized] || normalized.replaceAll('_', ' ');
};

const getTicketPrimaryText = (ticket = {}) => (
  String(ticket.title || ticket.subject || ticket.short_description || ticket.description || '').trim()
  || 'Ticket sin título'
);

const getTicketSecondaryText = (ticket = {}) => {
  const description = String(ticket.description || '').trim();
  const primary = getTicketPrimaryText(ticket);
  return description && description !== primary ? description : null;
};

const isUrgentTicket = (ticket) => ticket.priority === 'urgent' || ticket.category === 'emergency';

const copilotToneClass = (tone = 'slate') => {
  const tones = {
    red: 'border-red-300/20 bg-red-500/10 text-red-100',
    orange: 'border-orange-300/20 bg-orange-400/10 text-orange-100',
    emerald: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    sky: 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    violet: 'border-violet-300/20 bg-violet-400/10 text-violet-100',
    slate: 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return tones[tone] || tones.slate;
};

const CopilotPill = ({ children, tone = 'slate' }) => (
  <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${copilotToneClass(tone)}`}>
    {children}
  </span>
);

const getTicketCopilot = (ticket) => ticket.copilot || {
  aiPriority: { level: ticket.priority || 'normal', tone: isUrgentTicket(ticket) ? 'red' : 'slate' },
  suggestedDepartment: 'reception',
  suggestedResolution: 'Revisa el ticket y responde al huésped con el siguiente paso claro.',
  satisfactionRisk: { level: isUrgentTicket(ticket) ? 'high' : 'low', tone: isUrgentTicket(ticket) ? 'red' : 'emerald' },
  sentiment: { label: 'neutral', tone: 'slate' },
  similarPastIncidents: []
};

const getResolutionCopy = (ticket, copilot) => {
  const housekeepingStatus = copilot.roomStatus?.housekeepingStatus || copilot.roomStatus?.housekeeping_status;
  const maintenanceStatus = copilot.roomStatus?.maintenanceStatus || copilot.roomStatus?.maintenance_status;
  const department = String(copilot.suggestedDepartment || '').toLowerCase();

  if (maintenanceStatus === 'maintenance' || maintenanceStatus === 'out_of_order') {
    return 'Confirma el estado con mantenimiento antes de cerrar el ticket.';
  }

  if (housekeepingStatus === 'dirty') {
    return 'Asigna pisos y responde al huésped cuando la habitación esté revisada.';
  }

  if (department.includes('maintenance') || ticket.category === 'maintenance') {
    return 'Asigna mantenimiento, confirma acceso a la habitación y avisa al huésped.';
  }

  if (department.includes('housekeeping') || ticket.category === 'housekeeping') {
    return 'Asigna pisos y marca el ticket como completado solo tras revisar la habitación.';
  }

  return 'Revisa el ticket y responde al huésped con el siguiente paso claro.';
};

const getTicketRowClass = (ticket) => {
  if (isUrgentTicket(ticket)) {
    return 'border-l-2 border-red-400 bg-red-500/[0.045] shadow-[inset_14px_0_28px_-24px_rgba(248,113,113,0.95)] hover:bg-red-500/[0.085]';
  }

  if (ticket.priority === 'high') {
    return 'border-l-2 border-orange-300 bg-orange-500/[0.035] hover:bg-orange-500/[0.075]';
  }

  return 'border-l-2 border-transparent hover:bg-white/[0.035]';
};

const mergeTicket = (items, ticket) => {
  const exists = items.some((item) => item.id === ticket.id);
  const nextItems = exists
    ? items.map((item) => (item.id === ticket.id ? { ...item, ...ticket } : item))
    : [ticket, ...items];

  return sortByNewest(nextItems);
};

export const TicketsTable = ({ tickets }) => {
  const router = useRouter();
  const { t } = useDashboardLanguage();
  const [items, setItems] = useState(() => sortByNewest(tickets));
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    setItems(sortByNewest(tickets));
  }, [tickets]);

  const updateStatus = async ({ ticketId, status }) => {
    setUpdatingId(ticketId);

    try {
      const response = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'No se pudo actualizar el estado del ticket');
      }

      setItems((current) => mergeTicket(current, body.ticket));
    } catch (caughtError) {
      console.error('Ticket status update failed', {
        ticketId,
        status,
        error: caughtError
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const openTicket = (ticketId) => {
    router.push(`/dashboard/tickets/${ticketId}`);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-borderline bg-panel/70 px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-200">{t('tickets.noTickets')}</p>
        <p className="mt-2 text-sm text-slate-500">{t('tickets.noTicketsDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
        <span>{t('tickets.count', { count: items.length })}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b1019]/88 shadow-2xl shadow-black/20">
        <div className="space-y-3 p-3 md:hidden">
          {items.map((ticket) => {
            const urgent = isUrgentTicket(ticket);
            const loading = updatingId === ticket.id;
            const copilot = getTicketCopilot(ticket);
            const primaryText = getTicketPrimaryText(ticket);
            const secondaryText = getTicketSecondaryText(ticket);

            return (
              <article
                key={ticket.id}
                role="button"
                tabIndex={0}
                onClick={() => openTicket(ticket.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    openTicket(ticket.id);
                  }
                }}
                className={`rounded-xl border border-white/10 p-4 transition focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${getTicketRowClass(ticket)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-100">{primaryText}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {ticket.room_number ? `Habitación ${ticket.room_number}` : t('tickets.noRoom')}
                    </p>
                    {secondaryText ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{secondaryText}</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
                      <TicketCategoryIcon category={ticket.category} />
                      <span className="truncate">{formatText(ticket.category, t('tickets.noData'), categoryLabels)}</span>
                    </div>
                  </div>
                  <PriorityBadge priority={ticket.priority} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  <TicketAgeLabel createdAt={ticket.created_at} urgent={urgent} />
                  <span className="text-xs text-slate-500">{formatDate(ticket.created_at)}</span>
                </div>
                <div className="mt-4 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.055] p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-100">
                    <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
                    Asistencia IA
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <CopilotPill tone={copilot.aiPriority?.tone}>{formatText(copilot.aiPriority?.level || ticket.priority, 'Normal', priorityLabels)}</CopilotPill>
                    <CopilotPill tone="sky">{formatText(copilot.suggestedDepartment, 'Recepción', departmentLabels)}</CopilotPill>
                    <CopilotPill tone={copilot.satisfactionRisk?.tone}>{formatText(copilot.satisfactionRisk?.level, 'Riesgo bajo', riskLabels)}</CopilotPill>
                    {copilot.roomStatus ? (
                      <CopilotPill tone={copilot.roomStatus.housekeepingStatus === 'dirty' ? 'orange' : 'slate'}>
                        {formatText(copilot.roomStatus.housekeepingStatus, 'Sin estado', roomStatusLabels)}
                      </CopilotPill>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                    {getResolutionCopy(ticket, copilot)}
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-1.5">
                  {STATUS_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    const active = ticket.status === action.value;

                    return (
                      <button
                        key={action.value}
                        type="button"
                        title={t(action.labelKey)}
                        disabled={active || loading}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateStatus({ ticketId: ticket.id, status: action.value });
                        }}
                        className={[
                          'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition',
                          active
                            ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
                            : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100',
                          loading ? 'cursor-wait opacity-70' : ''
                        ].join(' ')}
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                        <span className="sr-only">{t(action.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/[0.035]">
              <tr>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Problema</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.category')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.priority')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.status')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.date')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.age')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Asistencia IA</th>
                <th className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.quickActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((ticket) => {
                const urgent = isUrgentTicket(ticket);
                const copilot = getTicketCopilot(ticket);
                const primaryText = getTicketPrimaryText(ticket);
                const secondaryText = getTicketSecondaryText(ticket);

                return (
                  <tr
                    key={ticket.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openTicket(ticket.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        openTicket(ticket.id);
                      }
                    }}
                    className={`cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${getTicketRowClass(ticket)}`}
                  >
                    <td className="min-w-[260px] max-w-[340px] px-5 py-4">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-100">{primaryText}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {ticket.room_number ? `Habitación ${ticket.room_number}` : t('tickets.noRoom')}
                      </p>
                      {secondaryText ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{secondaryText}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <TicketCategoryIcon category={ticket.category} />
                        {formatText(ticket.category, t('tickets.noData'), categoryLabels)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400">
                      {formatDate(ticket.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      <TicketAgeLabel createdAt={ticket.created_at} urgent={urgent} />
                    </td>
                    <td className="min-w-[280px] px-5 py-4">
                      <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.045] px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CopilotPill tone={copilot.aiPriority?.tone}>
                            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                            {formatText(copilot.aiPriority?.level || ticket.priority, 'Normal', priorityLabels)}
                          </CopilotPill>
                          <CopilotPill tone="sky">{formatText(copilot.suggestedDepartment, 'Recepción', departmentLabels)}</CopilotPill>
                          <CopilotPill tone={copilot.satisfactionRisk?.tone}>{formatText(copilot.satisfactionRisk?.level, 'Riesgo bajo', riskLabels)}</CopilotPill>
                          {copilot.roomStatus ? (
                            <CopilotPill tone={copilot.roomStatus.housekeepingStatus === 'dirty' ? 'orange' : 'slate'}>
                              {formatText(copilot.roomStatus.housekeepingStatus, 'Sin estado', roomStatusLabels)}
                            </CopilotPill>
                          ) : null}
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                          {getResolutionCopy(ticket, copilot)}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex justify-end gap-1.5">
                        {STATUS_ACTIONS.map((action) => {
                          const Icon = action.icon;
                          const active = ticket.status === action.value;
                          const loading = updatingId === ticket.id;

                          return (
                            <button
                              key={action.value}
                              type="button"
                              title={t(action.labelKey)}
                              disabled={active || loading}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateStatus({
                                  ticketId: ticket.id,
                                  status: action.value
                                });
                              }}
                              className={[
                                'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
                                active
                                  ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
                                  : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100',
                                loading ? 'cursor-wait opacity-70' : ''
                              ].join(' ')}
                            >
                              {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              )}
                              <span className="sr-only">{t(action.labelKey)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
