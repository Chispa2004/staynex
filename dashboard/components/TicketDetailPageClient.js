'use client';

import { useEffect, useRef, useState } from 'react';
import { PremiumEmptyState } from './PremiumEmptyState';
import { TicketDetail } from './TicketDetail';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';

export const TicketDetailPageClient = ({ ticketId }) => {
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const loadTicket = async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoading(true);
      setTicket(null);
      setMessages([]);
      setError(null);

      try {
        const response = await fetch(`/api/tickets/${ticketId}`, {
          headers: await getAuthHeaders(),
          cache: 'no-store'
        });
        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.error || 'No se pudo cargar el ticket');
        }

        if (!shouldAcceptTenantPayload(body, 'ticket-detail')) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          if (process.env.NODE_ENV !== 'production') {
            console.info('stale response ignored', { surface: 'ticket-detail', hotelId: body.hotelId });
          }
          return;
        }

        setTicket(body.ticket);
        setMessages(body.messages || []);
      } catch (caughtError) {
        setError(caughtError);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    loadTicket();
  }, [ticketId]);

  if (loading) {
    return <PremiumEmptyState title="Cargando ticket..." description="Staynex está preparando el contexto operativo del hotel." />;
  }

  if (error || !ticket) {
    return <PremiumEmptyState title="Ticket no disponible" description="No está disponible en el hotel activo. Vuelve a la cola de tickets y actualiza." />;
  }

  return <TicketDetail initialTicket={ticket} initialMessages={messages} />;
};
