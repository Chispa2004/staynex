import { InboxClient } from '@/components/InboxClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        titleKey="screens.inbox"
        descriptionKey="screens.inboxDescription"
      />

      <InboxClient conversations={[]} />
    </section>
  );
}
