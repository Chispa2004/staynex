import { PageHeader } from '@/components/PageHeader';
import { UpsellsClient } from '@/components/UpsellsClient';

export const dynamic = 'force-dynamic';

export default function UpsellsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        titleKey="screens.upsells"
        descriptionKey="screens.upsellsDescription"
      />

      <UpsellsClient />
    </section>
  );
}
