import { Suspense } from 'react';
import { ReservationsClient } from '@/components/ReservationsClient';

export default function ReservationsPage() {
  return <Suspense fallback={null}><ReservationsClient /></Suspense>;
}
