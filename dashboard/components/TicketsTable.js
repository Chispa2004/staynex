'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, PlayCircle } from 'lucide-react';
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
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const formatText = (value, fallback) => value?.replaceAll('_', ' ') || fallback;

const isUrgentTicket = (ticket) => ticket.priority === 'urgent' || ticket.category === 'emergency';

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
        throw new Error(body.error || 'Could not update ticket status');
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
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {ticket.room_number || t('tickets.noRoom')}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm capitalize text-slate-300">
                      <TicketCategoryIcon category={ticket.category} />
                      <span className="truncate">{formatText(ticket.category, t('tickets.noData'))}</span>
                    </div>
                  </div>
                  <PriorityBadge priority={ticket.priority} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  <TicketAgeLabel createdAt={ticket.created_at} urgent={urgent} />
                  <span className="text-xs text-slate-500">{formatDate(ticket.created_at)}</span>
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
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.room')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.category')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.priority')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.status')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.date')}</th>
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.age')}</th>
                <th className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.quickActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((ticket) => {
                const urgent = isUrgentTicket(ticket);

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
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-100">
                      {ticket.room_number || t('tickets.noRoom')}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-slate-300">
                      <div className="flex items-center gap-2">
                        <TicketCategoryIcon category={ticket.category} />
                        {formatText(ticket.category, t('tickets.noData'))}
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
