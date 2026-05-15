import { TicketDetailPageClient } from '@/components/TicketDetailPageClient';

export const dynamic = 'force-dynamic';

export default async function TicketDetailPage({ params }) {
  const { id } = await params;

  return <TicketDetailPageClient ticketId={id} />;
}
