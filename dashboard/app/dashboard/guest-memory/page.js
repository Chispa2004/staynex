import { PageHeader } from '@/components/PageHeader';
import { GuestMemoryClient } from '@/components/GuestMemoryClient';
import { isGuestMemoryEnabled } from '../../../../shared/guest-memory/feature-flag.js';

export const dynamic = 'force-dynamic';

export default function GuestMemoryPage() {
  if (!isGuestMemoryEnabled()) {
    return (
      <section className="space-y-6">
        <PageHeader
          eyebrowKey="screens.operations"
          titleKey="screens.guestMemory"
          description="Guest Memory is disabled for this pilot."
        />
      </section>
    );
  }

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
