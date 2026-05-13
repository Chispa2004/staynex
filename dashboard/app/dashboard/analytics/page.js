import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { PageHeader } from '@/components/PageHeader';

export default function DashboardAnalyticsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        titleKey="screens.analytics"
        descriptionKey="screens.analyticsDescription"
      />
      <AnalyticsDashboard />
    </section>
  );
}
