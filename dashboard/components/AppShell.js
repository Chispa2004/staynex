'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Activity,
  BarChart3,
  BrainCircuit,
  Bot,
  CalendarDays,
  ChevronDown,
  ConciergeBell,
  Inbox,
  BookOpen,
  LogOut,
  QrCode,
  Settings,
  Sparkles,
  TrendingUp,
  TicketCheck,
  Wrench
} from 'lucide-react';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { DashboardLanguageProvider, useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { DashboardThemeProvider, useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const navigationGroups = [
  {
    id: 'operations',
    labelKey: 'sidebarGroups.operations',
    defaultOpen: true,
    items: [
      { href: '/dashboard/inbox', labelKey: 'sidebar.inbox', icon: Inbox },
      { href: '/dashboard', labelKey: 'sidebar.tickets', icon: TicketCheck }
    ]
  },
  {
    id: 'teams',
    labelKey: 'sidebarGroups.teams',
    defaultOpen: false,
    items: [
      { href: '/dashboard/housekeeping', labelKey: 'sidebar.housekeeping', icon: Sparkles },
      { href: '/dashboard/maintenance', labelKey: 'sidebar.maintenance', icon: Wrench },
      { href: '/dashboard/reception', labelKey: 'sidebar.reception', icon: ConciergeBell }
    ]
  },
  {
    id: 'revenueAi',
    labelKey: 'sidebarGroups.revenueAi',
    defaultOpen: true,
    items: [
      { href: '/dashboard/analytics', labelKey: 'sidebar.analytics', icon: BarChart3 },
      { href: '/dashboard/ai-logs', labelKey: 'sidebar.aiLogs', icon: Activity },
      { href: '/dashboard/upsells', labelKey: 'sidebar.upsells', icon: TrendingUp },
      { href: '/dashboard/guest-memory', labelKey: 'sidebar.guestMemory', icon: BrainCircuit },
      { href: '/dashboard/automations', labelKey: 'sidebar.automations', icon: Bot }
    ]
  },
  {
    id: 'hotel',
    labelKey: 'sidebarGroups.hotel',
    defaultOpen: true,
    items: [
      { href: '/dashboard/reservations', labelKey: 'sidebar.reservations', icon: CalendarDays },
      { href: '/dashboard/qr-rooms', labelKey: 'sidebar.qrRooms', icon: QrCode },
      { href: '/dashboard/knowledge', labelKey: 'sidebar.knowledgeBase', icon: BookOpen },
      { href: '/settings', labelKey: 'sidebar.settings', icon: Settings }
    ]
  }
];

const defaultOpenGroups = navigationGroups.reduce((groups, group) => ({
  ...groups,
  [group.id]: group.defaultOpen
}), {});

const INBOX_UNREAD_TOTAL_KEY = 'staynex_inbox_unread_total';
const INBOX_UNREAD_EVENT = 'staynex:inbox-unread-updated';
const INBOX_HUMAN_TOTAL_KEY = 'staynex_inbox_human_total';
const INBOX_HUMAN_EVENT = 'staynex:inbox-human-updated';

const AppShellContent = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [urgentCount, setUrgentCount] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [inboxHumanCount, setInboxHumanCount] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionAccessToken, setSessionAccessToken] = useState(null);
  const [currentHotel, setCurrentHotel] = useState(null);
  const [openGroups, setOpenGroups] = useState(defaultOpenGroups);
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase) {
      setAuthLoading(false);
      if (!isLoginPage) {
        router.replace('/login');
      }
      return;
    }

    let active = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (error) {
        console.error('Session lookup failed', error);
      }

      setSessionAccessToken(data.session?.access_token || null);

      if (!data.session && !isLoginPage) {
        setIsAuthenticated(false);
        setAuthLoading(false);
        router.replace('/login');
      } else if (data.session && isLoginPage) {
        setIsAuthenticated(true);
        setAuthLoading(false);
        router.replace('/dashboard');
      } else {
        setIsAuthenticated(Boolean(data.session));
        setAuthLoading(false);
      }
    };

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(Boolean(session));
      setSessionAccessToken(session?.access_token || null);
      setAuthLoading(false);

      if (!session && !isLoginPage) {
        setCurrentHotel(null);
        router.replace('/login');
      }

      if (session && isLoginPage) {
        router.replace('/dashboard');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [isLoginPage, router]);

  useEffect(() => {
    if (isLoginPage || authLoading || !isAuthenticated) {
      return undefined;
    }

    let active = true;

    const loadCurrentHotel = async () => {
      try {
        const headers = sessionAccessToken
          ? { Authorization: `Bearer ${sessionAccessToken}` }
          : {};
        const response = await fetch('/api/current-hotel', {
          headers,
          cache: 'no-store'
        });
        const body = await response.json();

        if (active && response.ok) {
          setCurrentHotel(body.hotel || null);
        }
      } catch (error) {
        console.error('Current hotel lookup failed', error);
      }
    };

    loadCurrentHotel();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, isLoginPage, sessionAccessToken]);

  const handleLogout = async () => {
    if (logoutLoading) {
      return;
    }

    setLogoutLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = supabase ? await supabase.auth.signOut() : { error: null };

    if (error) {
      console.error('Logout failed', error);
    }

    setIsAuthenticated(false);
    setSessionAccessToken(null);
    setCurrentHotel(null);
    setLogoutLoading(false);
    router.replace('/login');
  };

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

  useEffect(() => {
    const activeGroup = navigationGroups.find((group) => group.items.some((item) => (
      item.href === '/dashboard'
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    )));

    if (activeGroup) {
      setOpenGroups((current) => ({
        ...current,
        [activeGroup.id]: true
      }));
    }
  }, [pathname]);

  if (isLoginPage) {
    return (
      <div className={theme === 'light' ? 'theme-light' : 'theme-dark'}>
        {children}
      </div>
    );
  }

  if (authLoading || !isAuthenticated) {
    return (
      <div className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} flex h-dvh items-center justify-center overflow-hidden bg-midnight text-slate-100`}>
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-xl shadow-slate-200/70' : 'rounded-lg border border-white/10 bg-[#0b1019] px-5 py-4 text-sm font-medium text-slate-300 shadow-xl shadow-black/25'}>
          Checking session...
        </div>
      </div>
    );
  }

  const sidebarHotelName = currentHotel?.name || 'Staynex';
  const sidebarHotelSubtitle = currentHotel?.brand_name
    || currentHotel?.description
    || t('app.hotelOperations');
  const isNavItemActive = (item) => item.href === '/dashboard'
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const groupHasActiveRoute = (group) => group.items.some(isNavItemActive);

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId]
    }));
  };

  return (
    <div className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} h-dvh overflow-hidden bg-midnight text-slate-100`}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
        <aside className={[
          'flex max-h-[42dvh] shrink-0 flex-col overflow-y-auto border-b shadow-2xl backdrop-blur-xl lg:h-full lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r',
          isLight
            ? 'border-slate-200 bg-white/95 shadow-slate-200/80'
            : 'border-white/10 bg-[#070b12]/95 shadow-black/30'
        ].join(' ')}
        >
          <div className="flex min-h-24 items-center gap-3 px-5 pb-3 pt-5">
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-emerald-300/20 bg-emerald-300 text-base font-black text-slate-950 shadow-lg shadow-emerald-500/15">
              <span className="absolute inset-x-0 top-0 h-px bg-white/70" />
              S
            </div>
            <div>
              <p className={isLight ? 'max-w-44 truncate text-base font-semibold leading-5 tracking-tight text-slate-950' : 'max-w-44 truncate text-base font-semibold leading-5 tracking-tight text-white'}>
                {sidebarHotelName}
              </p>
              <p className={isLight ? 'mt-0.5 max-w-44 truncate text-xs text-slate-600' : 'mt-0.5 max-w-44 truncate text-xs text-slate-500'}>
                {sidebarHotelSubtitle}
              </p>
            </div>
          </div>

          {urgentCount > 0 ? (
            <div className="px-4 pb-5 pt-1">
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

          <nav className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            {navigationGroups.map((group) => {
              const isOpen = openGroups[group.id];
              const activeGroup = groupHasActiveRoute(group);

              return (
                <section key={group.id} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={[
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition',
                      isLight
                        ? activeGroup
                          ? 'bg-slate-100 text-slate-800'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                        : activeGroup
                          ? 'bg-white/[0.045] text-slate-200'
                          : 'text-slate-500 hover:bg-white/[0.035] hover:text-slate-300'
                    ].join(' ')}
                    aria-expanded={isOpen}
                  >
                    <span>{t(group.labelKey)}</span>
                    <ChevronDown
                      className={[
                        'h-3.5 w-3.5 transition-transform',
                        isOpen ? 'rotate-0' : '-rotate-90'
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen ? (
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isNavItemActive(item);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={[
                              'group relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                              isLight
                                ? active
                                  ? 'bg-emerald-50 text-slate-950 shadow-sm shadow-emerald-100'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                : active
                                  ? 'bg-white/[0.075] text-white shadow-lg shadow-black/10'
                                  : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100'
                            ].join(' ')}
                          >
                            {active ? (
                              <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-emerald-300" />
                            ) : null}
                            <span className={[
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition',
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
                            <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
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
                    </div>
                  ) : null}
                </section>
              );
            })}
          </nav>

          <div className="mt-auto px-4 pb-5 pt-3">
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              className={[
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                isLight
                  ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  : 'border-white/10 bg-white/[0.025] text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
              ].join(' ')}
            >
              <span className={isLight ? 'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500' : 'flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-white/[0.025] text-slate-500'}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>{logoutLoading ? t('buttons.signingOut') : t('buttons.logout')}</span>
            </button>
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-6 sm:px-6 lg:px-10 lg:pb-8 lg:pt-8">
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
