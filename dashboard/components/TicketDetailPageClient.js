'use client';

import { useEffect, useRef, useState } from 'react';
import { PremiumEmptyState } from './PremiumEmptyState';
import { TicketDetail } from './TicketDetail';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

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
          throw new Error(body.error || 'Could not load ticket');
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
    return <PremiumEmptyState title="Loading ticket..." description="Staynex is loading this hotel workspace only." />;
  }

  if (error || !ticket) {
    return <PremiumEmptyState title="Ticket unavailable" description={error?.message || 'This ticket is not available in the active hotel.'} />;
  }

  return <TicketDetail initialTicket={ticket} initialMessages={messages} />;
};
