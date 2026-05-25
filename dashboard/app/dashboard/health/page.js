import { HotelHealthClient } from '@/components/HotelHealthClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function DashboardHealthPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        fallbackTitle="Hotel Operational Health"
        fallbackDescription="Simple hotel-facing status for PMS, WhatsApp, AI, tickets, provider requests, QR rooms and reception readiness."
      />

      <HotelHealthClient />
    </section>
  );
}
