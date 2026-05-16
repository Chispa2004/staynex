'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, PlayCircle } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './Badge';
import { TicketFilters } from './TicketFilters';
import { TicketAgeLabel } from './TicketAgeLabel';
import { TicketCategoryIcon } from './TicketCategoryIcon';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { getAuthHeaders } from '@/lib/auth-headers';

const STATUS_ACTIONS = [
  { value: 'open', labelKey: 'buttons.open', icon: Circle },
  { value: 'in_progress', labelKey: 'buttons.inProgress', icon: PlayCircle },
  { value: 'completed', labelKey: 'buttons.complete', icon: CheckCircle2 }
];

const STATUSES = ['open', 'in_progress', 'completed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const isUrgentTicket = (ticket) => ticket.priority === 'urgent' || ticket.category === 'emergency';

const sortByNewest = (items) => [...items].sort((a, b) => {
  const urgentDelta = Number(isUrgentTicket(b)) - Number(isUrgentTicket(a));

  if (urgentDelta !== 0) {
    return urgentDelta;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
});

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

const getTicketRowClass = (ticket) => {
  if (isUrgentTicket(ticket)) {
    return 'border-l-2 border-red-400 bg-red-500/[0.045] shadow-[inset_14px_0_28px_-24px_rgba(248,113,113,0.95)] hover:bg-red-500/[0.085]';
  }

  if (ticket.priority === 'high') {
    return 'border-l-2 border-orange-300 bg-orange-500/[0.035] hover:bg-orange-500/[0.075]';
  }

  return 'border-l-2 border-transparent hover:bg-white/[0.035]';
};

const mergeTicket = (items, ticket) => sortByNewest(
  items.map((item) => (item.id === ticket.id ? { ...item, ...ticket } : item))
);

export const DepartmentTicketTable = ({ tickets, categories }) => {
  const router = useRouter();
  const { t } = useDashboardLanguage();
  const [items, setItems] = useState(() => sortByNewest(tickets));
  const [updatingId, setUpdatingId] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    category: 'all'
  });

  useEffect(() => {
    setItems(sortByNewest(tickets));
  }, [tickets]);

  const filteredTickets = useMemo(() => items.filter((ticket) => (
    (filters.status === 'all' || ticket.status === filters.status)
    && (filters.priority === 'all' || ticket.priority === filters.priority)
    && (filters.category === 'all' || ticket.category === filters.category)
  )), [items, filters]);

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
    } catch (error) {
      console.error('Ticket status update failed', {
        ticketId,
        status,
        error
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <TicketFilters
        filters={filters}
        onChange={setFilters}
        categories={categories}
        priorities={PRIORITIES}
        statuses={STATUSES}
      />

      <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
        <span>{t('tickets.count', { count: filteredTickets.length })}</span>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] px-6 py-12 text-center shadow-2xl shadow-black/10">
          <p className="text-sm font-medium text-slate-200">{t('tickets.noMatchingTickets')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('tickets.tryAnotherFilter')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b1019]/88 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/[0.035]">
                <tr>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.room')}</th>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.category')}</th>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.priority')}</th>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.status')}</th>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.date')}</th>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.age')}</th>
                  <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.description')}</th>
                  <th className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('table.quickActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredTickets.map((ticket) => {
                  const urgent = isUrgentTicket(ticket);

                  return (
                    <tr
                      key={ticket.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          router.push(`/dashboard/tickets/${ticket.id}`);
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
                      <td className="min-w-80 px-5 py-4 text-sm leading-6 text-slate-300">
                        {ticket.description || ticket.title || t('tickets.noDescription')}
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
      )}
    </div>
  );
};
