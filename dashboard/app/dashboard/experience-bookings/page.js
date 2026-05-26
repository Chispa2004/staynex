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
        fallbackDescription="Operational workspace to track guest experience requests and provider confirmations."
      />

      <ExperienceBookingsClient />
    </section>
  );
}
