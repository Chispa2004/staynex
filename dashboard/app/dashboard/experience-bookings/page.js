import { ExperienceBookingsClient } from '@/components/ExperienceBookingsClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function ExperienceBookingsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        titleKey="screens.experienceBookings"
        descriptionKey="screens.experienceBookingsDescription"
        fallbackTitle="Experience Bookings"
        fallbackDescription="Operational workflow for reception to review, confirm and track guest experience requests."
      />

      <ExperienceBookingsClient />
    </section>
  );
}
