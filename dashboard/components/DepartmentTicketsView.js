import { AlertCircle } from 'lucide-react';
import { DepartmentTicketTable } from './DepartmentTicketTable';
import { PageHeader } from './PageHeader';
import { RefreshButton } from './RefreshButton';
import { TicketStatsCards } from './TicketStatsCards';
import { getTicketsByCategories } from '@/lib/tickets';

export const DepartmentTicketsView = async ({
  title,
  titleKey,
  eyebrow,
  description,
  descriptionKey,
  categories
}) => {
  let tickets = [];
  let error = null;

  try {
    tickets = await getTicketsByCategories(categories);
  } catch (caughtError) {
    error = caughtError;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          titleKey={titleKey}
          descriptionKey={descriptionKey}
          fallbackTitle={title}
          fallbackDescription={description}
          eyebrowKey={eyebrow === 'Operations' ? 'screens.operations' : undefined}
        />

        <RefreshButton />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-red-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">Could not load tickets.</p>
              <p className="mt-1 text-red-100/80">{error.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <TicketStatsCards tickets={tickets} />
          <DepartmentTicketTable tickets={tickets} categories={categories} />
        </>
      )}
    </section>
  );
};
