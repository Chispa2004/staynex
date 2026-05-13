import { AlertCircle } from 'lucide-react';
import { InboxClient } from '@/components/InboxClient';
import { PageHeader } from '@/components/PageHeader';
import { getInboxConversations } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  let conversations = [];
  let error = null;

  try {
    conversations = await getInboxConversations();
  } catch (caughtError) {
    error = caughtError;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        titleKey="screens.inbox"
        descriptionKey="screens.inboxDescription"
      />

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">Could not load inbox.</p>
              <p className="mt-1 text-red-100/80">{error.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <InboxClient conversations={conversations} />
      )}
    </section>
  );
}
