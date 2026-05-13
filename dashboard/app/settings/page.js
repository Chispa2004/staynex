'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

const settingsItems = [
  {
    href: '/dashboard/settings/knowledge',
    title: 'Knowledge Base',
    description: 'Edit hotel information used by Staynex to answer guest questions.'
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
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-borderline bg-panel/80 p-5 transition hover:bg-white/[0.04]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-borderline bg-white/[0.03] text-emerald-300">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t('screens.knowledgeBase')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{t('settings.knowledgeDescription')}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
