import { InboxClient } from '@/components/InboxClient';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  return (
    <section>
      <InboxClient conversations={[]} />
    </section>
  );
}
