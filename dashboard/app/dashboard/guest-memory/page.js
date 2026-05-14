import { PageHeader } from '@/components/PageHeader';
import { GuestMemoryClient } from '@/components/GuestMemoryClient';

export const dynamic = 'force-dynamic';

export default function GuestMemoryPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        titleKey="screens.guestMemory"
        descriptionKey="screens.guestMemoryDescription"
      />

      <GuestMemoryClient />
    </section>
  );
}
