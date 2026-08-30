'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BrainCircuit, CheckCircle2, Circle, Loader2, PlayCircle, ShieldAlert } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './Badge';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const STATUS_ACTIONS = [
  { value: 'open', label: 'Abrir', icon: Circle },
  { value: 'in_progress', label: 'En progreso', icon: PlayCircle },
  { value: 'completed', label: 'Completar', icon: CheckCircle2 }
];

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

const sentimentLabels = {
  negative: 'Sentimiento negativo',
  neutral: 'Sentimiento neutral',
  positive: 'Sentimiento positivo'
};

const roomStatusLabels = {
  clean: 'Lista',
  inspected: 'Revisada',
  dirty: 'Pendiente',
  occupied: 'Ocupada',
  vacant: 'Libre',
  maintenance: 'Mantenimiento',
  out_of_order: 'Fuera de servicio',
  unknown: 'Sin estado'
};

const formatText = (value, fallback = 'Sin datos', labels = {}) => {
  if (!value) {
    return fallback;
  }

  const normalized = String(value).trim();
  const key = normalized.toLowerCase();
  return labels[key] || labels[normalized] || normalized.replaceAll('_', ' ');
};

const senderLabel = {
  guest: 'Huésped',
  ai: 'Staynex',
  staff: 'Equipo'
};

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
  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${copilotToneClass(tone)}`}>
    {children}
  </span>
);

const getResolutionCopy = (ticket) => {
  const copilot = ticket.copilot || {};
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

export const TicketDetail = ({ initialTicket, initialMessages }) => {
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialMessages);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const realtimeEnabled = useMemo(() => Boolean(getSupabaseBrowser()), []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const activeHotelId = initialTicket.hotel_id || null;

    if (!supabase || !activeHotelId) {
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
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          if (payload?.new?.hotel_id !== activeHotelId || payload?.new?.conversation_id !== initialTicket.conversation_id) {
            return;
          }

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
  }, [initialTicket.id, initialTicket.conversation_id, initialTicket.hotel_id]);

  const updateStatus = async (status) => {
    setUpdating(true);
    setError(null);

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/status`, {
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
          href="/dashboard/tickets"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-300 shadow-lg shadow-black/10 transition hover:bg-white/[0.08] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a tickets
        </Link>

        <span className={realtimeEnabled ? 'text-xs text-emerald-300' : 'text-xs text-amber-300'}>
          {realtimeEnabled ? 'Actualización en vivo' : 'Actualización manual'}
        </span>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-300">Detalle de ticket</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white">
              {ticket.title || 'Ticket sin título'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {ticket.description || 'Sin descripción'}
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
            No se pudo actualizar el ticket. Vuelve a intentarlo desde la cola.
          </div>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Habitación</dt>
            <dd className="mt-2 text-sm font-medium text-slate-100">{ticket.room_number || 'Sin habitación'}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Categoría</dt>
            <dd className="mt-2 text-sm font-medium text-slate-100">{formatText(ticket.category, 'Sin datos', categoryLabels)}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Prioridad</dt>
            <dd className="mt-2"><PriorityBadge priority={ticket.priority} /></dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Estado</dt>
            <dd className="mt-2"><StatusBadge status={ticket.status} /></dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Fecha</dt>
            <dd className="mt-2 text-sm font-medium text-slate-100">{formatDate(ticket.created_at)}</dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white">Asistencia IA para este ticket</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {getResolutionCopy(ticket)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopilotPill tone={ticket.copilot?.aiPriority?.tone}>
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {formatText(ticket.copilot?.aiPriority?.level || ticket.priority, 'Normal', priorityLabels)}
              </CopilotPill>
              <CopilotPill tone="sky">{formatText(ticket.copilot?.suggestedDepartment, 'Recepción', departmentLabels)}</CopilotPill>
              <CopilotPill tone={ticket.copilot?.satisfactionRisk?.tone}>
                {formatText(ticket.copilot?.satisfactionRisk?.level, 'Riesgo bajo', riskLabels)}
              </CopilotPill>
              <CopilotPill tone={ticket.copilot?.sentiment?.tone}>
                {formatText(ticket.copilot?.sentiment?.label, 'Sentimiento neutral', sentimentLabels)}
              </CopilotPill>
              {ticket.copilot?.roomStatus ? (
                <CopilotPill tone={ticket.copilot.roomStatus.housekeepingStatus === 'dirty' ? 'orange' : 'slate'}>
                  Habitación {formatText(ticket.copilot.roomStatus.housekeepingStatus, 'Sin estado', roomStatusLabels)} / {formatText(ticket.copilot.roomStatus.occupancyStatus, 'Sin estado', roomStatusLabels)}
                </CopilotPill>
              ) : null}
            </div>
          </div>
          {ticket.copilot?.similarPastIncidents?.length ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Incidencias parecidas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ticket.copilot.similarPastIncidents.map((incident) => (
                  <CopilotPill key={incident.id} tone="slate">
                    {incident.room_number || 'Sin habitación'} / {incident.title || 'Ticket'}
                  </CopilotPill>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/15">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white">Conversación</h2>
          <p className="mt-1 text-sm text-slate-500">{messages.length} mensajes</p>
        </div>

        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-5 py-8 text-center text-sm text-slate-500">
            No hay mensajes para esta conversación.
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
