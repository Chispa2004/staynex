'use client';

import Link from 'next/link';
import { BookOpen, GraduationCap, PlugZap, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const settingsItems = [
  {
    href: '/dashboard/settings/academy',
    icon: GraduationCap,
    title: 'Staynex Academy',
    titleKey: 'screens.academy',
    descriptionKey: 'screens.academyDescription',
    description: 'Guia operativa para configurar y usar Staynex sin perderse.'
  },
  {
    href: '/dashboard/settings/knowledge',
    icon: BookOpen,
    title: 'Knowledge Base',
    titleKey: 'screens.knowledgeBase',
    descriptionKey: 'settings.knowledgeDescription',
    description: 'Edit hotel information used by Staynex to answer guest questions.'
  },
  {
    href: '/dashboard/settings/pms',
    icon: PlugZap,
    title: 'PMS Connections',
    titleKey: 'screens.pmsConnections',
    descriptionKey: 'settings.pmsDescription',
    description: 'Connect Apaleo and future PMS providers per hotel.'
  }
];

export default function SettingsPage() {
  const { t } = useDashboardLanguage();

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="sidebar.settings"
        titleKey="screens.settings"
        descriptionKey="screens.settingsDescription"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {settingsItems.map((item) => (
          <SettingsCard key={item.href} item={item} t={t} />
        ))}
      </div>

      <RetentionPanel />
    </section>
  );
}

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const SettingsCard = ({ item, t }) => {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="rounded-lg border border-borderline bg-panel/80 p-5 transition hover:bg-white/[0.04]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-borderline bg-white/[0.03] text-emerald-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{t(item.titleKey) || item.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{t(item.descriptionKey) || item.description}</p>
        </div>
      </div>
    </Link>
  );
};

const RetentionPanel = () => {
  const [context, setContext] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/current-hotel', {
          headers: await getAuthHeaders(),
          cache: 'no-store'
        });
        const body = await response.json();

        if (!cancelled && response.ok) {
          setContext(body);
        }
      } catch {
        if (!cancelled) {
          setContext(null);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const hotel = context?.hotel || {};
  const retentionDays = hotel.guest_data_retention_days || 30;
  const anonymizeDays = hotel.anonymize_after_checkout_days || retentionDays;
  const messageDays = hotel.delete_message_body_after_days || 90;
  const lastRun = hotel.last_data_retention_cleanup_at
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(hotel.last_data_retention_cleanup_at))
    : 'Not run yet';

  return (
    <section className="rounded-lg border border-borderline bg-panel/80 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Privacidad y retención de datos</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Staynex puede anonimizar automáticamente datos personales de huéspedes tras el checkout,
              manteniendo solo métricas agregadas para analítica operativa.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
          GDPR ready
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <RetentionMetric label="Guest data" value={`${retentionDays} days`} />
        <RetentionMetric label="Anonymize after checkout" value={`${anonymizeDays} days`} />
        <RetentionMetric label="Message bodies" value={`${messageDays} days`} />
        <RetentionMetric label="Last cleanup" value={lastRun} />
      </div>

      <div className="mt-5 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-sm leading-6 text-slate-300">
        Automatic guest data anonymization and cleanup are managed securely by Staynex according to the configured privacy policy.
        The hotel keeps operational visibility while personal guest details are protected after the retention period.
      </div>
    </section>
  );
};

const RetentionMetric = ({ label, value }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
    <p className="mt-2 text-sm font-semibold text-white">{value}</p>
  </div>
);
