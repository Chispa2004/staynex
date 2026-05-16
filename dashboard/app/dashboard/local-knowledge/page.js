import { LocalKnowledgeClient } from '@/components/LocalKnowledgeClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function LocalKnowledgePage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.settings"
        titleKey="screens.localKnowledge"
        descriptionKey="screens.localKnowledgeDescription"
        fallbackTitle="Local Knowledge Studio"
        fallbackDescription="Simple local recommendation cards for the AI concierge and reception team."
      />

      <LocalKnowledgeClient />
    </section>
  );
}
