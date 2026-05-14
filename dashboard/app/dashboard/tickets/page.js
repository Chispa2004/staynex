import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RefreshButton } from '@/components/RefreshButton';
import { TicketsTable } from '@/components/TicketsTable';
import { getTickets } from '@/lib/tickets';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  let tickets = [];
  let error = null;

  try {
    tickets = await getTickets();
  } catch (caughtError) {
    error = caughtError;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          titleKey="screens.tickets"
          descriptionKey="screens.ticketsDescription"
        />

        <RefreshButton action="/dashboard/tickets" />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">No se pudieron cargar los tickets.</p>
              <p className="mt-1 text-red-100/80">{error.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <TicketsTable tickets={tickets} />
      )}
    </section>
  );
}
