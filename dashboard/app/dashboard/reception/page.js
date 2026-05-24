import { PageHeader } from '@/components/PageHeader';
import { ReceptionPreCheckinClient } from '@/components/ReceptionPreCheckinClient';

export const dynamic = 'force-dynamic';

export default function ReceptionPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        fallbackTitle="Reception / Pre Check-in"
        fallbackDescription="Search reservations and guests, review operational readiness and prepare arrivals or checkouts without editing PMS data."
      />

      <ReceptionPreCheckinClient />
    </section>
  );
}
