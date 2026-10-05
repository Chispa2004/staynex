'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {ticketDashboardReturn} from '../../shared/pending-tickets.js';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
export function DashboardReturnLink() {
  const href=ticketDashboardReturn(useSearchParams()),{tx}=useDashboardLanguage();
  return href?<Link href={href} className="inline-flex rounded py-2 text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500">{tx('Volver al Dashboard')}</Link>:null;
}
