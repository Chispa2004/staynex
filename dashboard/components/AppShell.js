'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Activity,
  BarChart3,
  ConciergeBell,
  Inbox,
  BookOpen,
  MessageSquareText,
  PlayCircle,
  QrCode,
  Settings,
  Sparkles,
  TicketCheck,
  Wrench
} from 'lucide-react';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { DashboardLanguageProvider, useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { DashboardThemeProvider, useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const navigation = [
  { href: '/dashboard/inbox', labelKey: 'sidebar.inbox', icon: Inbox },
  { href: '/dashboard', labelKey: 'sidebar.tickets', icon: TicketCheck },
  { href: '/dashboard/demo', labelKey: 'sidebar.demo', icon: PlayCircle },
  { href: '/dashboard/housekeeping', labelKey: 'sidebar.housekeeping', icon: Sparkles },
  { href: '/dashboard/maintenance', labelKey: 'sidebar.maintenance', icon: Wrench },
  { href: '/dashboard/reception', labelKey: 'sidebar.reception', icon: ConciergeBell },
  { href: '/conversations', labelKey: 'sidebar.conversations', icon: MessageSquareText },
  { href: '/dashboard/analytics', labelKey: 'sidebar.analytics', icon: BarChart3 },
  { href: '/dashboard/ai-logs', labelKey: 'sidebar.aiLogs', icon: Activity },
  { href: '/dashboard/qr-rooms', labelKey: 'sidebar.qrRooms', icon: QrCode },
  { href: '/dashboard/settings/knowledge', labelKey: 'sidebar.knowledgeBase', icon: BookOpen },
  { href: '/settings', labelKey: 'sidebar.settings', icon: Settings }
];

const INBOX_UNREAD_TOTAL_KEY = 'staynex_inbox_unread_total';
const INBOX_UNREAD_EVENT = 'staynex:inbox-unread-updated';
const INBOX_HUMAN_TOTAL_KEY = 'staynex_inbox_human_total';
const INBOX_HUMAN_EVENT = 'staynex:inbox-human-updated';

const AppShellContent = ({ children }) => {
  const pathname = usePathname();
  const [urgentCount, setUrgentCount] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [inboxHumanCount, setInboxHumanCount] = useState(0);
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    const loadUrgentCount = async () => {
      try {
        const response = await fetch('/api/demo/stats');
        const body = await response.json();

        if (response.ok) {
          setUrgentCount(body.stats?.urgentTickets || 0);
        }
      } catch (error) {
        console.error('Urgent counter failed', error);
      }
    };

    loadUrgentCount();
  }, [pathname]);

  useEffect(() => {
    const loadInboxCounts = () => {
      const storedCount = Number(window.localStorage.getItem(INBOX_UNREAD_TOTAL_KEY) || 0);
      const storedHumanCount = Number(window.localStorage.getItem(INBOX_HUMAN_TOTAL_KEY) || 0);
      setInboxUnreadCount(Number.isFinite(storedCount) ? storedCount : 0);
      setInboxHumanCount(Number.isFinite(storedHumanCount) ? storedHumanCount : 0);
    };

    const handleUnreadUpdate = (event) => {
      setInboxUnreadCount(event.detail?.total || 0);
    };

    const handleHumanUpdate = (event) => {
      setInboxHumanCount(event.detail?.total || 0);
    };

    loadInboxCounts();
    window.addEventListener(INBOX_UNREAD_EVENT, handleUnreadUpdate);
    window.addEventListener(INBOX_HUMAN_EVENT, handleHumanUpdate);
    window.addEventListener('storage', loadInboxCounts);

    return () => {
      window.removeEventListener(INBOX_UNREAD_EVENT, handleUnreadUpdate);
      window.removeEventListener(INBOX_HUMAN_EVENT, handleHumanUpdate);
      window.removeEventListener('storage', loadInboxCounts);
    };
  }, []);

  return (
    <div className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} h-screen overflow-hidden bg-midnight text-slate-100`}>
      <div className="flex h-screen flex-col overflow-hidden lg:flex-row">
        <aside className={[
          'max-h-[42vh] shrink-0 overflow-y-auto border-b shadow-2xl backdrop-blur-xl lg:h-screen lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r',
          isLight
            ? 'border-slate-200 bg-white/95 shadow-slate-200/80'
            : 'border-white/10 bg-[#070b12]/95 shadow-black/30'
        ].join(' ')}
        >
          <div className="flex h-20 items-center gap-3 px-5">
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-emerald-300/20 bg-emerald-300 text-base font-black text-slate-950 shadow-lg shadow-emerald-500/15">
              <span className="absolute inset-x-0 top-0 h-px bg-white/70" />
              S
            </div>
            <div>
              <p className={isLight ? 'text-base font-semibold leading-5 tracking-tight text-slate-950' : 'text-base font-semibold leading-5 tracking-tight text-white'}>Staynex</p>
              <p className={isLight ? 'mt-0.5 text-xs text-slate-600' : 'mt-0.5 text-xs text-slate-500'}>{t('app.hotelOperations')}</p>
            </div>
          </div>

          {urgentCount > 0 ? (
            <div className="px-4 pb-4">
              <div className={[
                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-semibold uppercase shadow-lg',
                isLight
                  ? 'border-red-200 bg-red-50 text-red-800 shadow-red-100/70'
                  : 'border-red-400/25 bg-red-500/[0.08] text-red-100 shadow-red-500/10'
              ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 animate-pulse" aria-hidden="true" />
                  {t('app.urgent')}
                </span>
                <span className={isLight ? 'rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-black text-white' : 'rounded-full bg-red-400 px-2 py-0.5 text-[11px] font-black text-red-950'}>
                  {urgentCount}
                </span>
              </div>
            </div>
          ) : null}

          <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-4 lg:pb-0">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = item.href === '/dashboard'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'group relative flex min-w-fit items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                    isLight
                      ? active
                        ? 'bg-emerald-50 text-slate-950 shadow-sm shadow-emerald-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      : active
                        ? 'bg-white/[0.08] text-white shadow-lg shadow-black/10'
                        : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100'
                  ].join(' ')}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-emerald-300" />
                  ) : null}
                  <span className={[
                    'flex h-8 w-8 items-center justify-center rounded-lg border transition',
                    isLight
                      ? active
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-500 group-hover:text-slate-900'
                      : active
                        ? 'border-emerald-300/20 bg-emerald-300/15 text-emerald-200'
                        : 'border-white/5 bg-white/[0.025] text-slate-500 group-hover:text-slate-200'
                  ].join(' ')}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {item.href === '/dashboard' && urgentCount > 0 ? (
                    <span className={isLight ? 'rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700' : 'rounded-full border border-red-300/20 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-100'}>
                      {urgentCount}
                    </span>
                  ) : null}
                  {item.href === '/dashboard/inbox' && inboxUnreadCount > 0 ? (
                    <span className={isLight ? 'rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800' : 'rounded-full border border-emerald-300/20 bg-emerald-300/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100'}>
                      {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                    </span>
                  ) : null}
                  {item.href === '/dashboard/inbox' && inboxHumanCount > 0 ? (
                    <span className={isLight ? 'rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-800' : 'rounded-full border border-orange-300/20 bg-orange-400/15 px-1.5 py-0.5 text-[10px] font-bold text-orange-100'}>
                      {inboxHumanCount > 99 ? '99+' : inboxHumanCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <div className="mb-6 flex justify-end gap-2">
              <ThemeToggle />
              <LanguageSelector />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export const AppShell = ({ children }) => (
  <DashboardThemeProvider>
    <DashboardLanguageProvider>
      <AppShellContent>{children}</AppShellContent>
    </DashboardLanguageProvider>
  </DashboardThemeProvider>
);
