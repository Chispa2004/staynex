import { ExperiencesClient } from '@/components/ExperiencesClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function ExperiencesPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.settings"
        titleKey="screens.experiences"
        descriptionKey="screens.experiencesDescription"
      />

      <ExperiencesClient />
    </section>
  );
}
