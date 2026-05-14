import { KnowledgeBaseEditor } from '@/components/KnowledgeBaseEditor';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function KnowledgePage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.settings"
        titleKey="screens.knowledgeBase"
        descriptionKey="screens.knowledgeDescription"
      />

      <KnowledgeBaseEditor />
    </section>
  );
}
