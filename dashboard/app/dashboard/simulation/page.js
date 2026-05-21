import { SimulationModeClient } from '@/components/SimulationModeClient';
import { PageHeader } from '@/components/PageHeader';

export default function SimulationPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Sandbox"
        title="Staynex Simulation Mode"
        description="Run safe hotel, guest, PMS and WhatsApp-style conversation simulations without touching live hotel data."
      />
      <SimulationModeClient />
    </section>
  );
}
