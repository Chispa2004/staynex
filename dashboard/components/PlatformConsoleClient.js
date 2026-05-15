'use client';

import { Building2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const WorkspaceMark = ({ hotel }) => (
  <span
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white"
    style={{ backgroundColor: hotel.brand_color || '#34d399' }}
    aria-hidden="true"
  >
    {(hotel.name || 'H').slice(0, 2).toUpperCase()}
  </span>
);

export const PlatformConsoleClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHotels = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/platform/hotels', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load tenants');
      }

      setHotels(body.hotels || []);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHotels();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
            Platform console
          </p>
          <h1 className={isLight ? 'mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl' : 'mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl'}>
            Tenant workspaces
          </h1>
          <p className={cn('mt-3 max-w-2xl text-sm leading-6', ui.text.body(isLight))}>
            Internal Staynex console for platform admins. Hotel admins never see this area.
          </p>
        </div>
        <button
          type="button"
          onClick={loadHotels}
          className={ui.button(isLight, 'secondary')}
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <PremiumEmptyState
          icon={ShieldCheck}
          title="Platform access unavailable"
          description={error}
        />
      ) : null}

      {!error ? (
        <section className={cn('overflow-hidden rounded-xl border', ui.surface(isLight))}>
          <div className={isLight ? 'border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900' : 'border-b border-white/10 px-4 py-3 text-sm font-semibold text-white'}>
            {loading ? 'Loading tenants...' : `${hotels.length} tenant workspaces`}
          </div>
          <div className="divide-y divide-slate-200/10">
            {hotels.map((hotel) => (
              <article key={hotel.id} className={isLight ? 'flex items-center gap-4 p-4 hover:bg-slate-50' : 'flex items-center gap-4 p-4 hover:bg-white/[0.035]'}>
                <WorkspaceMark hotel={hotel} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{hotel.name}</h2>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                    {hotel.workspace_slug || hotel.slug} · {hotel.timezone || 'timezone unset'}
                  </p>
                </div>
                <span className={ui.badge(isLight, hotel.subscription_plan ? 'emerald' : 'slate')}>
                  {hotel.subscription_plan || 'no plan'}
                </span>
              </article>
            ))}
          </div>
          {!loading && hotels.length === 0 ? (
            <PremiumEmptyState
              icon={Building2}
              title="No tenant workspaces yet"
              description="Create the first hotel workspace from the workspace switcher."
              className="m-4"
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
