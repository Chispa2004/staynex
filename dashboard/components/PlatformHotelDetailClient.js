'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CalendarCheck,
  CircleDollarSign,
  DoorOpen,
  MessageSquareText,
  PlugZap,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  TicketCheck,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { persistWorkspaceSelection } from '@/lib/workspace-context';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';
import { ExperienceProvidersPanel } from './ExperienceProvidersPanel';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const plans = ['starter', 'professional', 'enterprise', 'enterprise_demo', 'pro_demo'];
const roles = ['owner', 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'analyst'];

const formatCurrency = (value) => new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const WorkspaceMark = ({ hotel }) => (
  <span
    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg"
    style={{ backgroundColor: hotel?.brand_color || '#34d399' }}
    aria-hidden="true"
  >
    {(hotel?.name || 'H').slice(0, 2).toUpperCase()}
  </span>
);

const DetailStat = ({ icon: Icon, label, value, isLight }) => (
  <article className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
    <div className="flex items-center gap-3">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', ui.badge(isLight, 'emerald'))}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className={ui.text.eyebrow(isLight)}>{label}</p>
        <p className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>{value}</p>
      </div>
    </div>
  </article>
);

export const PlatformHotelDetailClient = ({ hotelId }) => {
  const router = useRouter();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const hotel = detail?.hotel;
  const users = detail?.users || [];
  const pmsConnections = detail?.pmsConnections || [];
  const conversions = detail?.conversions || [];
  const offers = detail?.offers || [];
  const experienceBookings = detail?.experienceBookings || [];
  const localKnowledge = detail?.localKnowledge || [];
  const knowledgeEntries = detail?.knowledgeEntries || [];
  const auditLogs = detail?.auditLogs || [];

  const revenue = useMemo(() => ({
    accepted: conversions.filter((item) => item.status === 'accepted').reduce((total, item) => total + Number(item.estimated_amount || 0), 0),
    offers: offers.filter((item) => item.status === 'accepted').reduce((total, item) => total + Number(item.suggested_price || 0), 0),
    experienceBookings: experienceBookings
      .filter((item) => ['confirmed', 'completed'].includes(item.status))
      .reduce((total, item) => total + Number(item.estimated_revenue || 0), 0)
  }), [conversions, experienceBookings, offers]);

  const usersByStatus = useMemo(() => ({
    admins: users.filter((item) => ['owner', 'admin'].includes(item.role)).length,
    receptionists: users.filter((item) => item.role === 'receptionist').length,
    invited: users.filter((item) => item.status === 'invited').length,
    disabled: users.filter((item) => item.status === 'disabled').length
  }), [users]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}`, {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load hotel detail');
      }

      setDetail(body);
      setForm({
        id: body.hotel.id,
        name: body.hotel.name || '',
        brand_name: body.hotel.brand_name || '',
        slug: body.hotel.workspace_slug || body.hotel.slug || '',
        timezone: body.hotel.timezone || 'Europe/Madrid',
        default_language: body.hotel.default_language || 'es',
        whatsapp_number: body.hotel.whatsapp_number || '',
        support_email: body.hotel.support_email || '',
        support_phone: body.hotel.support_phone || '',
        brand_color: body.hotel.brand_color || '#34d399',
        secondary_color: body.hotel.secondary_color || '#0f766e',
        logo_url: body.hotel.logo_url || '',
        favicon_url: body.hotel.favicon_url || '',
        subscription_plan: body.hotel.subscription_plan || 'starter',
        description: body.hotel.description || ''
      });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [hotelId]);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const saveBranding = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/platform/hotels', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update hotel');
      }

      setNotice('Hotel branding and plan updated.');
      await loadDetail();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const runUserAction = async ({ action, hotelUserId, role }) => {
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}`, {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, hotelUserId, role })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update user');
      }

      setNotice('User state updated.');
      await loadDetail();
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  const enterSupport = async () => {
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/support`, {
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
        hotelId,
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

  if (loading && !detail) {
    return (
      <div className="space-y-4">
        <div className={cn('h-28 rounded-xl', ui.skeleton(isLight))} />
        <div className="grid gap-3 md:grid-cols-4">
          <div className={cn('h-24 rounded-xl', ui.skeleton(isLight))} />
          <div className={cn('h-24 rounded-xl', ui.skeleton(isLight))} />
          <div className={cn('h-24 rounded-xl', ui.skeleton(isLight))} />
          <div className={cn('h-24 rounded-xl', ui.skeleton(isLight))} />
        </div>
      </div>
    );
  }

  if (error && !detail) {
    return <PremiumEmptyState icon={ShieldAlert} title="Hotel detail unavailable" description={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <WorkspaceMark hotel={hotel} />
          <div className="min-w-0">
            <Link href="/platform" className={cn('inline-flex items-center gap-2 text-sm font-semibold', ui.text.muted(isLight))}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Platform console
            </Link>
            <h1 className={cn('mt-3 text-3xl font-semibold tracking-normal', ui.text.title(isLight))}>{hotel?.name}</h1>
            <p className={cn('mt-2 text-sm', ui.text.body(isLight))}>{hotel?.workspace_slug || hotel?.slug} / {hotel?.plan_label}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadDetail} className={ui.button(isLight, 'secondary')}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
          <button type="button" onClick={enterSupport} className={ui.button(isLight, 'primary')}>
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            Enter workspace as support
          </button>
        </div>
      </div>

      {error ? <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>{error}</div> : null}
      {notice ? <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>{notice}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <DetailStat icon={BadgeCheck} isLight={isLight} label="Health score" value={`${hotel?.healthScore || 0}%`} />
        <DetailStat icon={PlugZap} isLight={isLight} label="PMS" value={hotel?.pms?.enabled ? hotel.pms.provider : 'Disconnected'} />
        <DetailStat icon={Users} isLight={isLight} label="Users" value={`${hotel?.stats?.activeUsers || 0}/${hotel?.stats?.users || 0}`} />
        <DetailStat icon={CircleDollarSign} isLight={isLight} label="Revenue" value={formatCurrency(revenue.accepted + revenue.offers + revenue.experienceBookings)} />
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <DetailStat icon={CalendarDays} isLight={isLight} label="Reservations" value={hotel?.stats?.reservations || 0} />
        <DetailStat icon={MessageSquareText} isLight={isLight} label="Conversations" value={hotel?.stats?.conversations || 0} />
        <DetailStat icon={TicketCheck} isLight={isLight} label="Open tickets" value={hotel?.stats?.openTickets || 0} />
        <DetailStat icon={CalendarCheck} isLight={isLight} label="Bookings" value={hotel?.stats?.experienceBookings || 0} />
        <DetailStat icon={Sparkles} isLight={isLight} label="Experiences" value={hotel?.stats?.experiences || 0} />
        <DetailStat icon={Building2} isLight={isLight} label="Knowledge" value={(hotel?.stats?.localKnowledge || 0) + (hotel?.stats?.knowledgeBase || 0)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Branding management</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>Workspace identity</h2>
          {form ? (
            <form onSubmit={saveBranding} className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Hotel name</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Brand name</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.brand_name} onChange={(event) => updateForm('brand_name', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Slug</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.slug} onChange={(event) => updateForm('slug', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Plan</span>
                <select className={cn('w-full', ui.input(isLight))} value={form.subscription_plan} onChange={(event) => updateForm('subscription_plan', event.target.value)}>
                  {plans.map((plan) => <option key={plan} value={plan}>{plan.replaceAll('_', ' ')}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Brand color</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.brand_color} onChange={(event) => updateForm('brand_color', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Secondary color</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.secondary_color} onChange={(event) => updateForm('secondary_color', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>Support email</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.support_email} onChange={(event) => updateForm('support_email', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={ui.text.eyebrow(isLight)}>WhatsApp</span>
                <input className={cn('w-full', ui.input(isLight))} value={form.whatsapp_number} onChange={(event) => updateForm('whatsapp_number', event.target.value)} />
              </label>
              <div className="md:col-span-2">
                <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Saving...' : 'Save branding'}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <aside className="space-y-6">
          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>PMS status</p>
            <div className="mt-4 space-y-3">
              {pmsConnections.map((connection) => (
                <div key={connection.id} className={cn('rounded-lg border p-3 text-sm', ui.surface(isLight, 'subtle'))}>
                  <div className="flex items-center justify-between gap-3">
                    <strong>{connection.provider}</strong>
                    <span className={ui.badge(isLight, connection.enabled ? 'emerald' : 'slate', true)}>{connection.enabled ? 'Connected' : 'Disabled'}</span>
                  </div>
                  <p className={cn('mt-2 text-xs', ui.text.muted(isLight))}>Last sync: {formatDate(connection.last_sync_at)}</p>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>Webhook: {connection.webhook_status || 'not configured'}</p>
                  {connection.last_sync_error ? <p className="mt-2 text-xs text-red-400">{connection.last_sync_error}</p> : null}
                </div>
              ))}
              {pmsConnections.length === 0 ? <p className={cn('text-sm', ui.text.muted(isLight))}>No PMS connection configured.</p> : null}
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>Usage snapshot</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><span className={ui.text.muted(isLight)}>Reservations</span><p className="font-semibold">{hotel?.stats?.reservations || 0}</p></div>
              <div><span className={ui.text.muted(isLight)}>Conversations</span><p className="font-semibold">{hotel?.stats?.conversations || 0}</p></div>
              <div><span className={ui.text.muted(isLight)}>AI handled</span><p className="font-semibold">{hotel?.stats?.aiHandled || 0}</p></div>
              <div><span className={ui.text.muted(isLight)}>Open tickets</span><p className="font-semibold">{hotel?.stats?.openTickets || 0}</p></div>
              <div><span className={ui.text.muted(isLight)}>Experience bookings</span><p className="font-semibold">{hotel?.stats?.experienceBookings || 0}</p></div>
              <div><span className={ui.text.muted(isLight)}>WhatsApp</span><p className="font-semibold">{hotel?.stats?.whatsappConfigured ? 'Ready' : 'Missing'}</p></div>
            </div>
          </section>

          <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
            <p className={ui.text.eyebrow(isLight)}>Content</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><span className={ui.text.muted(isLight)}>Experiences</span><p className="font-semibold">{detail?.experiences?.length || 0} recent</p></div>
              <div><span className={ui.text.muted(isLight)}>Local knowledge</span><p className="font-semibold">{localKnowledge.length}</p></div>
              <div><span className={ui.text.muted(isLight)}>Knowledge base</span><p className="font-semibold">{knowledgeEntries.length}</p></div>
              <div><span className={ui.text.muted(isLight)}>Active catalog</span><p className="font-semibold">{detail?.experiences?.filter((item) => item.active).length || 0}</p></div>
            </div>
          </section>
        </aside>
      </div>

      <ExperienceProvidersPanel hotelId={hotelId} />

      <section className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
        <div className={cn('border-b px-4 py-3', isLight ? 'border-slate-200' : 'border-white/10')}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className={cn('text-sm font-semibold', ui.text.title(isLight))}>Hotel users</h2>
            <p className={cn('text-xs', ui.text.muted(isLight))}>
              {usersByStatus.admins} admins / {usersByStatus.receptionists} receptionists / {usersByStatus.invited} invited / {usersByStatus.disabled} disabled
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-200/10">
          {users.map((hotelUser) => (
            <article key={hotelUser.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{hotelUser.email || hotelUser.user_id || 'Unknown user'}</p>
                <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>Accepted: {formatDate(hotelUser.accepted_at)} / Invited: {formatDate(hotelUser.invited_at)}</p>
              </div>
              <select className={cn('w-full', ui.input(isLight))} value={hotelUser.role} onChange={(event) => runUserAction({ action: 'update_user_role', hotelUserId: hotelUser.id, role: event.target.value })}>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <span className={ui.badge(isLight, hotelUser.status === 'active' ? 'emerald' : hotelUser.status === 'disabled' ? 'red' : 'amber')}>
                {hotelUser.status || 'unknown'}
              </span>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button type="button" onClick={() => runUserAction({ action: 'reset_invitation', hotelUserId: hotelUser.id })} className={ui.button(isLight, 'secondary')}>Reset invitation</button>
                <button type="button" onClick={() => runUserAction({ action: 'disable_user', hotelUserId: hotelUser.id })} className={ui.button(isLight, 'danger')}>Disable</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className={cn('rounded-xl border p-5', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Recent audit logs</p>
          <div className="mt-4 space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-semibold">{log.action}</p>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{log.actor_email || 'system'} / {log.target_email || 'hotel'}</p>
                </div>
                <span className={cn('text-xs', ui.text.muted(isLight))}>{formatDate(log.created_at)}</span>
              </div>
            ))}
            {auditLogs.length === 0 ? <p className={cn('text-sm', ui.text.muted(isLight))}>No audit events recorded yet.</p> : null}
          </div>
        </div>

        <div className={cn('rounded-xl border p-5', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Revenue operations</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><span className={ui.text.muted(isLight)}>Upsell conversions</span><strong>{formatCurrency(revenue.accepted)}</strong></div>
            <div className="flex justify-between"><span className={ui.text.muted(isLight)}>Accepted AI offers</span><strong>{formatCurrency(revenue.offers)}</strong></div>
            <div className="flex justify-between"><span className={ui.text.muted(isLight)}>Experience bookings</span><strong>{formatCurrency(revenue.experienceBookings)}</strong></div>
            <div className="flex justify-between"><span className={ui.text.muted(isLight)}>Accepted offers</span><strong>{offers.filter((item) => item.status === 'accepted').length}</strong></div>
            <div className="flex justify-between"><span className={ui.text.muted(isLight)}>Conversion rate</span><strong>{hotel?.stats?.offerConversionRate || 0}%</strong></div>
            <div className="flex justify-between"><span className={ui.text.muted(isLight)}>Open tickets</span><strong>{detail?.tickets?.filter((item) => item.status !== 'closed').length || 0}</strong></div>
          </div>
        </div>
      </section>
    </div>
  );
};
