'use client';

import { useEffect, useMemo, useState } from 'react';
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
  LayoutDashboard,
  LogOut,
  PlugZap,
  QrCode,
  Rocket,
  Settings,
  Sparkles,
  TrendingUp,
  TicketCheck,
  UserCog,
  Wrench
} from 'lucide-react';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { HotelWorkspaceSwitcher } from './HotelWorkspaceSwitcher';
import { DashboardLanguageProvider, useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { DashboardThemeProvider, useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  clearWorkspaceSelection,
  getWorkspaceRequestHeaders,
  persistWorkspaceSelection,
  switchWorkspace
} from '@/lib/workspace-context';
import {
  canAccess,
  canAccessRoute,
  filterNavigationByRole,
  getFirstAllowedRoute,
  ROLE_LABELS
} from '@/lib/permissions';

const navigationGroups = [
  {
    id: 'operations',
    labelKey: 'sidebarGroups.operations',
    defaultOpen: true,
    items: [
      { href: '/dashboard', labelKey: 'screens.dashboard', icon: LayoutDashboard },
      { href: '/dashboard/inbox', labelKey: 'sidebar.inbox', icon: Inbox },
      { href: '/dashboard/tickets', labelKey: 'sidebar.tickets', icon: TicketCheck }
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
      { href: '/dashboard/onboarding', labelKey: 'sidebar.onboarding', icon: Rocket },
      { href: '/dashboard/settings/pms', labelKey: 'sidebar.pmsConnections', icon: PlugZap },
      { href: '/dashboard/settings/users', labelKey: 'sidebar.users', icon: UserCog },
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
  const [hotelContext, setHotelContext] = useState({
    role: 'owner',
    permissions: ['all'],
    platformRole: 'none',
    platformPermissions: [],
    multiPropertyAccess: false,
    canSwitchWorkspaces: false,
    canCreateWorkspaces: false,
    availableHotels: [],
    hotelUser: null,
    fallback: true,
    accessDenied: false,
    accessDeniedReason: null
  });
  const [hotelContextLoaded, setHotelContextLoaded] = useState(false);
  const [switchingHotel, setSwitchingHotel] = useState(false);
  const [welcomeState, setWelcomeState] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [openGroups, setOpenGroups] = useState(defaultOpenGroups);
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const isLoginPage = pathname === '/login';
  const isOnboardingPage = pathname === '/dashboard/onboarding';
  const activeRole = hotelContext.role || 'owner';
  const allowedNavigationGroups = useMemo(
    () => filterNavigationByRole(navigationGroups, activeRole),
    [activeRole]
  );

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

      // LoginClient owns invitation resolution and role-based routing on /login.
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
        const headers = {
          ...(sessionAccessToken ? { Authorization: `Bearer ${sessionAccessToken}` } : {}),
          ...getWorkspaceRequestHeaders()
        };
        const response = await fetch('/api/current-hotel', {
          headers,
          cache: 'no-store'
        });
        const body = await response.json();

        if (active && response.ok) {
          setCurrentHotel(body.hotel || null);
          if (body.hotel?.id) {
            persistWorkspaceSelection({
              hotelId: body.hotel.id,
              workspace: {
                hotel: body.hotel,
                role: body.role,
                hotelUser: body.hotelUser
              }
            });
          }
          setHotelContext({
            role: body.role || 'owner',
            permissions: body.permissions || ['all'],
            platformRole: body.platformRole || 'none',
            platformPermissions: body.platformPermissions || [],
            multiPropertyAccess: Boolean(body.multiPropertyAccess),
            canSwitchWorkspaces: Boolean(body.canSwitchWorkspaces),
            canCreateWorkspaces: Boolean(body.canCreateWorkspaces),
            availableHotels: body.availableHotels || [],
            hotelUser: body.hotelUser || null,
            fallback: Boolean(body.fallback),
            accessDenied: Boolean(body.accessDenied),
            accessDeniedReason: body.accessDeniedReason || null
          });
          setHotelContextLoaded(true);
        } else if (active) {
          setHotelContextLoaded(true);
        }
      } catch (error) {
        console.error('Current hotel lookup failed', error);
        if (active) {
          setHotelContextLoaded(true);
        }
      }
    };

    loadCurrentHotel();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, isLoginPage, sessionAccessToken]);

  useEffect(() => {
    if (isLoginPage || authLoading || !isAuthenticated) {
      return undefined;
    }

    let active = true;

    const loadOnboardingState = async () => {
      try {
        const headers = sessionAccessToken
          ? { Authorization: `Bearer ${sessionAccessToken}` }
          : {};
        const response = await fetch('/api/onboarding/state', {
          headers,
          cache: 'no-store'
        });
        const body = await response.json();

        if (!active || !response.ok) {
          return;
        }

        const completed = Boolean(body.state?.onboarding_completed);
        setOnboardingCompleted(completed);

        if (!hotelContext.accessDenied && !completed && !isOnboardingPage && canAccess(activeRole, 'onboarding')) {
          router.replace('/dashboard/onboarding');
        }
      } catch (error) {
        console.warn('Onboarding state lookup failed', error);
      }
    };

    loadOnboardingState();
    const handleOnboardingUpdate = (event) => {
      const completed = Boolean(event.detail?.state?.onboarding_completed);
      setOnboardingCompleted(completed);
    };

    window.addEventListener('staynex:onboarding-updated', handleOnboardingUpdate);

    return () => {
      active = false;
      window.removeEventListener('staynex:onboarding-updated', handleOnboardingUpdate);
    };
  }, [activeRole, authLoading, hotelContext.accessDenied, isAuthenticated, isLoginPage, isOnboardingPage, router, sessionAccessToken]);

  useEffect(() => {
    if (isLoginPage || authLoading || !isAuthenticated || !hotelContextLoaded) {
      return;
    }

    if (hotelContext.accessDenied) {
      return;
    }

    if (pathname.startsWith('/platform')) {
      if (!hotelContext.platformPermissions?.includes('platform_console')) {
        router.replace(getFirstAllowedRoute(activeRole));
      }

      return;
    }

    if (!canAccessRoute(activeRole, pathname)) {
      router.replace(getFirstAllowedRoute(activeRole));
    }
  }, [activeRole, authLoading, hotelContext.accessDenied, hotelContextLoaded, isAuthenticated, isLoginPage, pathname, router]);

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
    clearWorkspaceSelection();
    setHotelContextLoaded(false);
    setLogoutLoading(false);
    router.replace('/login');
  };

  const handleHotelSwitch = async (hotelId) => {
    if (!hotelId || hotelId === currentHotel?.id || switchingHotel) {
      return;
    }

    setSwitchingHotel(true);

    try {
      const body = await switchWorkspace({
        hotelId,
        accessToken: sessionAccessToken
      });

      setCurrentHotel(body.hotel || null);
      setHotelContext({
        role: body.role || 'owner',
        permissions: body.permissions || ['all'],
        platformRole: body.platformRole || 'none',
        platformPermissions: body.platformPermissions || [],
        multiPropertyAccess: Boolean(body.multiPropertyAccess),
        canSwitchWorkspaces: Boolean(body.canSwitchWorkspaces),
        canCreateWorkspaces: Boolean(body.canCreateWorkspaces),
        availableHotels: body.availableHotels || [],
        hotelUser: body.hotelUser || null,
        fallback: Boolean(body.fallback),
        accessDenied: Boolean(body.accessDenied),
        accessDeniedReason: body.accessDeniedReason || null
      });
      router.replace(getFirstAllowedRoute(body.role || 'owner'));
      router.refresh();
    } catch (error) {
      console.error('Hotel switch failed', error);
    } finally {
      setSwitchingHotel(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedWelcome = window.sessionStorage.getItem('staynex_invitation_welcome');

    if (storedWelcome) {
      try {
        setWelcomeState(JSON.parse(storedWelcome));
      } catch (error) {
        console.warn('Invitation welcome state could not be parsed', error);
      }

      window.sessionStorage.removeItem('staynex_invitation_welcome');
    }
  }, [pathname]);

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
  const activeGroup = allowedNavigationGroups.find((group) => group.items.some((item) => (
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
  }, [allowedNavigationGroups, pathname]);

  if (isLoginPage) {
    return (
      <div className={theme === 'light' ? 'theme-light' : 'theme-dark'}>
        {children}
      </div>
    );
  }

  if (authLoading || !isAuthenticated || !hotelContextLoaded) {
    return (
      <div className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} flex h-dvh items-center justify-center overflow-hidden bg-midnight text-slate-100`}>
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-xl shadow-slate-200/70' : 'rounded-lg border border-white/10 bg-[#0b1019] px-5 py-4 text-sm font-medium text-slate-300 shadow-xl shadow-black/25'}>
          Checking session...
        </div>
      </div>
    );
  }

  const workspaceBrandColor = currentHotel?.brand_color || '#34d399';
  const workspaceSecondaryColor = currentHotel?.secondary_color || '#0f766e';
  const isNavItemActive = (item) => item.href === '/dashboard'
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const groupHasActiveRoute = (group) => group.items.some(isNavItemActive);
  const availableHotels = hotelContext.availableHotels || [];

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId]
    }));
  };

  if (hotelContext.accessDenied) {
    const reasonCopy = {
      disabled: 'Your Staynex access is disabled. Please contact your hotel administrator.',
      invitation_pending: 'Your invitation is still pending. Log in with the invited email or contact your administrator.',
      no_active_assignment: 'No active hotel assignment is available for your user.'
    };

    return (
      <div className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} flex h-dvh items-center justify-center overflow-hidden bg-midnight px-4 text-slate-100`}>
        <section className={isLight ? 'w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl shadow-slate-200/80' : 'w-full max-w-lg rounded-xl border border-white/10 bg-[#0b1019] p-6 text-white shadow-2xl shadow-black/30'}>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-orange-300/30 bg-orange-300/10 text-orange-400">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Access needs attention</h1>
          <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-400'}>
            {reasonCopy[hotelContext.accessDeniedReason] || 'Your account is not assigned to an active hotel yet.'}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className={isLight ? 'mt-6 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'mt-6 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}
          >
            {logoutLoading ? t('buttons.signingOut') : t('buttons.logout')}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} h-dvh overflow-hidden bg-midnight text-slate-100`}
      style={{
        '--workspace-brand': workspaceBrandColor,
        '--workspace-secondary': workspaceSecondaryColor
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
        <aside className={[
          'flex max-h-[42dvh] shrink-0 flex-col overflow-y-auto border-b shadow-2xl backdrop-blur-xl lg:h-full lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r',
          isLight
            ? 'border-slate-200 bg-white/95 shadow-slate-200/80'
            : 'border-white/10 bg-[#070b12]/95 shadow-black/30'
        ].join(' ')}
        >
          <HotelWorkspaceSwitcher
            currentHotel={currentHotel}
            availableHotels={availableHotels}
            activeRole={activeRole}
            switching={switchingHotel}
            canSwitchWorkspaces={hotelContext.canSwitchWorkspaces}
            canCreateWorkspaces={hotelContext.canCreateWorkspaces}
            onSwitch={handleHotelSwitch}
            accessToken={sessionAccessToken}
            onWorkspaceCreated={handleHotelSwitch}
          />

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

          {!onboardingCompleted && !isOnboardingPage && canAccess(activeRole, 'onboarding') ? (
            <div className="px-4 pb-5">
              <Link
                href="/dashboard/onboarding"
                className={isLight ? 'flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800' : 'flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2.5 text-xs font-semibold text-emerald-100'}
              >
                <Rocket className="h-4 w-4" />
                Finish onboarding
              </Link>
            </div>
          ) : null}

          <nav className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            {allowedNavigationGroups.map((group) => {
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
                            {item.href === '/dashboard/tickets' && urgentCount > 0 ? (
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
            {welcomeState ? (
              <div className={isLight ? 'mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-sm shadow-emerald-100' : 'mb-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm text-emerald-100 shadow-lg shadow-emerald-950/10'}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">Welcome to {welcomeState.hotelName || sidebarHotelName}</p>
                    <p className="mt-1 opacity-80">Your role is {ROLE_LABELS[welcomeState.role] || welcomeState.role}. Staynex linked your invitation automatically.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWelcomeState(null)}
                    className={isLight ? 'rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100' : 'rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/15'}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
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
