import { GuestAiProfileClient } from '@/components/GuestAiProfileClient';
import { PageHeader } from '@/components/PageHeader';
import { isGuestMemoryEnabled } from '../../../../../shared/guest-memory/feature-flag.js';

export const dynamic = 'force-dynamic';

export default async function GuestAiProfilePage({ params }) {
  const { guestId } = await params;

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

  return <GuestAiProfileClient guestId={guestId} />;
}
