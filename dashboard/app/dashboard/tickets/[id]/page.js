import { notFound } from 'next/navigation';
import { TicketDetail } from '@/components/TicketDetail';
import { getTicketDetail } from '@/lib/tickets';

export const dynamic = 'force-dynamic';

export default async function TicketDetailPage({ params }) {
  const { id } = await params;
  const detail = await getTicketDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <TicketDetail
      initialTicket={detail.ticket}
      initialMessages={detail.messages}
    />
  );
}
