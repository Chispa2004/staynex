'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  MessageSquareText,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { persistWorkspaceSelection } from '@/lib/workspace-context';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';

const plans = ['starter', 'professional', 'enterprise', 'enterprise_demo', 'pro_demo'];
const languages = ['es', 'en', 'fr', 'de'];
const healthFilters = ['all', 'Healthy', 'Needs setup', 'Attention', 'Inactive'];

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const initialForm = {
  name: '',
  brand_name: '',
  slug: '',
  timezone: 'Europe/Madrid',
  default_language: 'es',
  whatsapp_number: '',
  support_email: '',
  brand_color: '#34d399',
  subscription_plan: 'starter',
  admin_email: ''
};

const formatCurrency = (value) => new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'No activity';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const WorkspaceMark = ({ hotel, size = 'h-11 w-11' }) => (
  <span
    className={cn('flex shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-lg', size)}
    style={{ backgroundColor: hotel?.brand_color || '#34d399' }}
    aria-hidden="true"
  >
    {(hotel?.name || 'H').slice(0, 2).toUpperCase()}
  </span>
);

const StatCard = ({ icon: Icon, label, value, helper, isLight, tone = 'emerald' }) => (
  <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className={ui.text.eyebrow(isLight)}>{label}</p>
        <p className={cn('mt-3 text-2xl font-semibold', ui.text.title(isLight))}>{value}</p>
        {helper ? <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{helper}</p> : null}
      </div>
      <span className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg border',
        tone === 'violet' ? ui.badge(isLight, 'violet') : tone === 'sky' ? ui.badge(isLight, 'sky') : ui.badge(isLight, 'emerald')
      )}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  </article>
);

const HealthBar = ({ value = 0, isLight }) => {
  const tone = value >= 75 ? 'bg-emerald-400' : value >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className={cn('h-2 overflow-hidden rounded-full', isLight ? 'bg-slate-100' : 'bg-white/10')}>
      <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
};

const CreateHotelForm = ({ isLight, saving, onSubmit, onCancel }) => {
  const [form, setForm] = useState(initialForm);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className={cn('rounded-xl border p-5', ui.surface(isLight))}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Create workspace</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>New hotel tenant</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>Creates the hotel, onboarding state and first invited admin.</p>
        </div>
        <button type="button" onClick={onCancel} className={ui.button(isLight, 'ghost')}>Cancel</button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Hotel name</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Brand name</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.brand_name} onChange={(event) => update('brand_name', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Workspace slug</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.slug} onChange={(event) => update('slug', event.target.value)} placeholder="hotel-costa-azul" />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Admin email</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.admin_email} onChange={(event) => update('admin_email', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Timezone</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.timezone} onChange={(event) => update('timezone', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Language</span>
          <select className={cn('w-full', ui.input(isLight))} value={form.default_language} onChange={(event) => update('default_language', event.target.value)}>
            {languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>WhatsApp</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.whatsapp_number} onChange={(event) => update('whatsapp_number', event.target.value)} placeholder="+34123456789" />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Support email</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.support_email} onChange={(event) => update('support_email', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Brand color</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.brand_color} onChange={(event) => update('brand_color', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Subscription plan</span>
          <select className={cn('w-full', ui.input(isLight))} value={form.subscription_plan} onChange={(event) => update('subscription_plan', event.target.value)}>
            {plans.map((plan) => <option key={plan} value={plan}>{plan.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Creating...' : 'Create Hotel Workspace'}
        </button>
      </div>
    </form>
  );
};

export const PlatformConsoleClient = () => {
  const router = useRouter();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [data, setData] = useState({ hotels: [], metrics: {}, revenue: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [planFilter, setPlanFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const hotels = data.hotels || [];
  const metrics = data.metrics || {};
  const revenue = data.revenue || {};
  const canCreate = data.platformRole === 'platform_admin';

  const loadPlatform = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/platform/hotels', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load platform console');
      }

      setData(body);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlatform();
  }, []);

  const sortedHotels = useMemo(() => [...hotels]
    .filter((hotel) => planFilter === 'all' || hotel.subscription_plan === planFilter)
    .filter((hotel) => healthFilter === 'all' || hotel.healthStatus === healthFilter)
    .sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '')), [healthFilter, hotels, planFilter]);

  const createHotel = async (form) => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/platform/hotels', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create hotel workspace');
      }

      setNotice(`Workspace created for ${body.hotel?.name || 'hotel'}. Admin invitation saved.`);
      setShowCreate(false);
      await loadPlatform({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const enterSupport = async (hotel) => {
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotel.id}/support`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not enter support session');
      }

      window.sessionStorage.setItem('staynex_support_session', JSON.stringify(body.supportSession));
      persistWorkspaceSelection({
        hotelId: hotel.id,
        workspace: {
          hotel: body.hotel,
          role: 'support',
          supportSession: body.supportSession
        }
      });
      router.push('/dashboard');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">Platform operations</p>
          <h1 className={cn('mt-3 text-3xl font-semibold tracking-normal sm:text-4xl', ui.text.title(isLight))}>Staynex SaaS console</h1>
          <p className={cn('mt-3 max-w-2xl text-sm leading-6', ui.text.body(isLight))}>
            Internal operations hub for tenants, health, revenue, PMS status and support access.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => loadPlatform()} className={ui.button(isLight, 'secondary')}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
          {canCreate ? (
            <button type="button" onClick={() => setShowCreate(true)} className={ui.button(isLight, 'primary')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Hotel Workspace
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
          {notice}
        </div>
      ) : null}

      {showCreate ? <CreateHotelForm isLight={isLight} saving={saving} onSubmit={createHotel} onCancel={() => setShowCreate(false)} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Building2} isLight={isLight} label="Total hotels" value={loading ? '...' : metrics.totalHotels || 0} helper={`${metrics.activeHotels || 0} active`} />
        <StatCard icon={AlertTriangle} isLight={isLight} label="Need attention" value={loading ? '...' : metrics.hotelsNeedingAttention || 0} helper="Health, PMS or urgent issues" tone="sky" />
        <StatCard icon={CalendarCheck} isLight={isLight} label="Reservations" value={loading ? '...' : metrics.totalReservations || 0} helper={`${metrics.totalExperienceBookings || 0} experience bookings`} />
        <StatCard icon={MessageSquareText} isLight={isLight} label="AI conversations" value={loading ? '...' : metrics.totalAiConversations || 0} helper={`${metrics.aiHandledPercent || 0}% handled`} tone="violet" />
        <StatCard icon={CircleDollarSign} isLight={isLight} label="Revenue generated" value={loading ? '...' : formatCurrency(metrics.totalAiRevenue)} helper={`${metrics.offerConversionRate || 0}% offer conversion`} />
        <StatCard icon={PlugZap} isLight={isLight} label="PMS connected" value={loading ? '...' : metrics.pmsConnectedHotels || 0} helper={`${metrics.totalActiveUsers || 0} active users`} tone="sky" />
        <StatCard icon={Sparkles} isLight={isLight} label="Experience catalog" value={loading ? '...' : metrics.totalExperiences || 0} helper={`${metrics.totalLocalKnowledge || 0} local knowledge cards`} tone="violet" />
        <StatCard icon={BookOpen} isLight={isLight} label="WhatsApp ready" value={loading ? '...' : metrics.whatsappConfiguredHotels || 0} helper="Hotels with configured number" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <section className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
          <div className={cn('border-b px-4 py-3', isLight ? 'border-slate-200' : 'border-white/10')}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className={cn('text-sm font-semibold', ui.text.title(isLight))}>Tenant workspaces</h2>
                <p className={cn('text-xs', ui.text.muted(isLight))}>{loading ? 'Loading...' : `${sortedHotels.length} of ${hotels.length} hotels`}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={cn('w-40', ui.input(isLight))}>
                  <option value="all">All plans</option>
                  {plans.map((plan) => <option key={plan} value={plan}>{plan.replaceAll('_', ' ')}</option>)}
                </select>
                <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)} className={cn('w-40', ui.input(isLight))}>
                  {healthFilters.map((health) => <option key={health} value={health}>{health === 'all' ? 'All health' : health}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200/10">
            {sortedHotels.map((hotel) => (
              <article key={hotel.id} className={cn('grid gap-4 p-4 transition hover:bg-emerald-300/[0.035] xl:grid-cols-[minmax(0,1.15fr)_0.75fr_1fr_auto]', isLight ? 'hover:bg-slate-50' : '')}>
                <div className="flex min-w-0 gap-3">
                  <WorkspaceMark hotel={hotel} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/platform/hotels/${hotel.id}`} className={cn('truncate text-sm font-semibold hover:text-emerald-300', ui.text.title(isLight))}>
                        {hotel.name}
                      </Link>
                      <span className={ui.badge(isLight, hotel.subscription_plan ? 'emerald' : 'slate', true)}>{hotel.plan_label || 'No plan'}</span>
                    </div>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{hotel.brand_name || hotel.name} / {hotel.workspace_slug || hotel.slug}</p>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>Created {formatDate(hotel.created_at)}</p>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>Last activity: {formatDate(hotel.lastActivityAt)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-xs font-semibold', ui.text.muted(isLight))}>Health</span>
                    <span className={cn('text-xs font-bold', ui.text.title(isLight))}>{hotel.healthScore || 0}%</span>
                  </div>
                  <div className="mt-2"><HealthBar value={hotel.healthScore || 0} isLight={isLight} /></div>
                  <p className={cn('mt-2 text-xs', ui.text.muted(isLight))}>{hotel.healthStatus || 'Unknown'} / onboarding {hotel.onboarding?.percent || 0}%</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className={ui.text.muted(isLight)}>PMS</span><p className="font-semibold">{hotel.pms?.enabled ? hotel.pms.provider : 'Disconnected'}</p></div>
                  <div><span className={ui.text.muted(isLight)}>WhatsApp</span><p className="font-semibold">{hotel.stats?.whatsappConfigured ? 'Ready' : 'Missing'}</p></div>
                  <div><span className={ui.text.muted(isLight)}>Users</span><p className="font-semibold">{hotel.stats?.activeUsers || 0}/{hotel.stats?.users || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>Reservations</span><p className="font-semibold">{hotel.stats?.reservations || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>AI handled</span><p className="font-semibold">{hotel.stats?.aiHandled || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>Open tickets</span><p className="font-semibold">{hotel.stats?.openTickets || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>Bookings</span><p className="font-semibold">{hotel.stats?.experienceBookings || 0}</p></div>
                  <div><span className={ui.text.muted(isLight)}>Revenue</span><p className="font-semibold">{formatCurrency((hotel.stats?.revenue || 0) + (hotel.stats?.offerRevenue || 0) + (hotel.stats?.experienceRevenue || 0))}</p></div>
                </div>

                <div className="flex items-center gap-2 lg:justify-end">
                  <button type="button" onClick={() => enterSupport(hotel)} className={ui.button(isLight, 'secondary')}>
                    <DoorOpen className="h-4 w-4" aria-hidden="true" />
                    Support
                  </button>
                  <Link href={`/platform/hotels/${hotel.id}`} className={ui.iconButton(isLight, 'ghost')} aria-label={`Open ${hotel.name}`}>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {!loading && hotels.length === 0 ? (
            <PremiumEmptyState
              icon={Building2}
              title="No hotel workspaces yet"
              description="Create the first tenant workspace to start onboarding a hotel."
              className="m-4"
            />
          ) : null}
        </section>

        <aside className="space-y-6">
          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>Global revenue</p>
            <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{formatCurrency(metrics.totalAiRevenue)}</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>Upsell revenue</span><strong>{formatCurrency(metrics.totalUpsellRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>AI offer revenue</span><strong>{formatCurrency(metrics.totalOfferRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>Experience revenue</span><strong>{formatCurrency(metrics.totalExperienceRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>Experience bookings</span><strong>{formatCurrency(metrics.totalExperienceBookingRevenue)}</strong></div>
              <div className="flex justify-between text-sm"><span className={ui.text.muted(isLight)}>Accepted offers</span><strong>{metrics.acceptedOffers || 0}</strong></div>
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>Top hotels by revenue</p>
            <div className="mt-4 space-y-3">
              {(revenue.topHotels || []).filter((item) => item.revenue > 0).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{item.name}</span>
                  <strong>{formatCurrency(item.revenue)}</strong>
                </div>
              ))}
              {!(revenue.topHotels || []).some((item) => item.revenue > 0) ? (
                <p className={cn('text-sm', ui.text.muted(isLight))}>No revenue attributed yet.</p>
              ) : null}
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>Platform controls</p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Platform-only access enforced</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Support access is audit logged</p>
              <p className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-300" /> Billing-ready plan structure</p>
              <p className="flex items-center gap-2"><Users className="h-4 w-4 text-emerald-300" /> Global user operations</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
