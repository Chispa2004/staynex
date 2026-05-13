import { DemoControlCenter } from '@/components/DemoControlCenter';
import { DEMO_SCENARIOS } from '@/lib/demo';

export const dynamic = 'force-dynamic';

export default function DemoPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-300">Commercial demo</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white sm:text-3xl">
          Staynex Control Center
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Trigger realistic hotel guest conversations, create operational tickets and show how Staynex routes work across reception, housekeeping and maintenance.
        </p>
      </div>

      <DemoControlCenter scenarios={DEMO_SCENARIOS} />
    </section>
  );
}
