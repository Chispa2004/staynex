import { AutomationsClient } from '@/components/AutomationsClient';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AutomationsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.operations"
        titleKey="screens.automations"
        descriptionKey="screens.automationsDescription"
      />

      <AutomationsClient />
    </section>
  );
}
