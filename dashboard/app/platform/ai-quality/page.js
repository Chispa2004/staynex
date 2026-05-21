import { AiQualityClient } from '@/components/AiQualityClient';
import { PageHeader } from '@/components/PageHeader';

export const metadata = {
  title: 'AI Quality - Staynex Platform',
  robots: {
    index: false,
    follow: false
  }
};

export default function PlatformAiQualityPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Internal QA"
        title="Failure Intelligence"
        description="Private Staynex quality lab for simulation failures, unsafe response review and AI improvement signals."
      />
      <AiQualityClient />
    </section>
  );
}
