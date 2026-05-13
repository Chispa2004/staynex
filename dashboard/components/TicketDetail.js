'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Loader2, PlayCircle } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './Badge';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const STATUS_ACTIONS = [
  { value: 'open', label: 'Open', icon: Circle },
  { value: 'in_progress', label: 'In progress', icon: PlayCircle },
  { value: 'completed', label: 'Completed', icon: CheckCircle2 }
];

const formatDate = (value) => {
  if (!value) {
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const formatText = (value) => value?.replaceAll('_', ' ') || 'No data';

const senderLabel = {
  guest: 'Guest',
  ai: 'Staynex',
  staff: 'Staff'
};

export const TicketDetail = ({ initialTicket, initialMessages }) => {
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialMessages);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const realtimeEnabled = useMemo(() => Boolean(getSupabaseBrowser()), []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase) {
      return undefined;
    }

    const ticketChannel = supabase
      .channel(`ticket-${initialTicket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${initialTicket.id}`
        },
        (payload) => {
          setTicket((current) => ({ ...current, ...payload.new }));
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(`ticket-messages-${initialTicket.conversation_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${initialTicket.conversation_id}`
        },
        (payload) => {
          setMessages((current) => {
            if (current.some((message) => message.id === payload.new.id)) {
              return current;
            }

            return [...current, payload.new].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [initialTicket.id, initialTicket.conversation_id]);

  const updateStatus = async (status) => {
    setUpdating(true);
    setError(null);

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update ticket status');
      }

      setTicket((current) => ({ ...current, ...body.ticket }));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-300 shadow-lg shadow-black/10 transition hover:bg-white/[0.08] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>

        <span className={realtimeEnabled ? 'text-xs text-emerald-300' : 'text-xs text-amber-300'}>
          {realtimeEnabled ? 'Realtime on' : 'Realtime needs anon key'}
        </span>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-300">Ticket detail</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white">
              {ticket.title || 'Untitled ticket'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {ticket.description || 'No description'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_ACTIONS.map((action) => {
              const Icon = action.icon;
              const active = ticket.status === action.value;

              return (
                <button
                  key={action.value}
                  type="button"
                  disabled={active || updating}
                  onClick={() => updateStatus(action.value)}
                  className={[
                    'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white',
                    updating ? 'cursor-wait opacity-70' : ''
                  ].join(' ')}
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Room</dt>
            <dd className="mt-2 text-sm font-medium text-slate-100">{ticket.room_number || 'No room'}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Category</dt>
            <dd className="mt-2 text-sm font-medium capitalize text-slate-100">{formatText(ticket.category)}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Priority</dt>
            <dd className="mt-2"><PriorityBadge priority={ticket.priority} /></dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</dt>
            <dd className="mt-2"><StatusBadge status={ticket.status} /></dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Date</dt>
            <dd className="mt-2 text-sm font-medium text-slate-100">{formatDate(ticket.created_at)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/15">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white">Conversation</h2>
          <p className="mt-1 text-sm text-slate-500">{messages.length} messages</p>
        </div>

        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-5 py-8 text-center text-sm text-slate-500">
            No messages found for this conversation.
          </div>
        ) : (
          <ol className="space-y-3">
            {messages.map((message) => {
              const isAi = message.sender_type === 'ai';

              return (
                <li
                  key={message.id}
                  className={[
                    'rounded-lg border px-4 py-3 shadow-lg shadow-black/10',
                    isAi
                      ? 'border-emerald-300/20 bg-emerald-300/[0.09]'
                      : 'border-white/10 bg-white/[0.035]'
                  ].join(' ')}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-slate-100">
                      {senderLabel[message.sender_type] || formatText(message.sender_type)}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(message.created_at)}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {message.content}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
};
