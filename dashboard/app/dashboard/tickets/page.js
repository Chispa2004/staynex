import { Suspense } from 'react';
import { TicketsPageClient } from '@/components/TicketsPageClient';

export const dynamic = 'force-dynamic';

export default function TicketsPage() {
  return <Suspense fallback={null}><TicketsPageClient /></Suspense>;
}
