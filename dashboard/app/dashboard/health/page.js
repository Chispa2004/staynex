import { HotelHealthClient } from '@/components/HotelHealthClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function DashboardHealthPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        fallbackTitle="Hotel Operational Health"
        fallbackDescription="Estado operativo de PMS, WhatsApp, IA, tickets, solicitudes a proveedores, QR de habitaciones y recepción."
      />

      <HotelHealthClient />
    </section>
  );
}
