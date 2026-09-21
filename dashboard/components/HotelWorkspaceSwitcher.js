'use client';

import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABELS } from '@/lib/permissions';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const getInitials = (name = 'Staynex') => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

const WorkspaceLogo = ({ hotel, size = 'md' }) => {
  const color = hotel?.brand_color || '#34d399';
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';

  if (hotel?.logo_url) {
    return (
      <img
        src={hotel.logo_url}
        alt=""
        className={`${sizeClass} rounded-lg border border-white/10 object-cover shadow-sm`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-lg border border-white/10 font-black text-white shadow-sm`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {getInitials(hotel?.name)}
    </div>
  );
};

export const HotelWorkspaceSwitcher = ({
  compact = false,
  iconOnly = false,
  currentHotel,
  availableHotels = [],
  activeRole,
  switching,
  canSwitchWorkspaces = false,
  canCreateWorkspaces = false,
  onSwitch,
  accessToken,
  onWorkspaceCreated
}) => {
  const { tx } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const canSwitch = canSwitchWorkspaces && availableHotels.length > 1;
  const canCreateWorkspace = canCreateWorkspaces;
  const canOpenMenu = canSwitch || canCreateWorkspace;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const handleSwitch = (hotelId) => {
    if (!hotelId || hotelId === currentHotel?.id || switching) {
      setOpen(false);
      return;
    }

    onSwitch(hotelId);
    setOpen(false);
  };

  return (
    <div ref={containerRef} data-icon-only={iconOnly} className={compact ? "relative pb-3" : "relative px-4 pb-4 pt-5"}>
      <button
        type="button"
        onClick={() => canOpenMenu && setOpen((current) => !current)}
        disabled={!canOpenMenu || switching}
        className={[
          'group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition',
          isLight
            ? 'border-slate-200 bg-slate-50 text-slate-950 hover:border-slate-300 hover:bg-white'
            : 'border-white/10 bg-white/[0.035] text-white hover:border-white/15 hover:bg-white/[0.06]',
          canOpenMenu ? 'cursor-pointer' : 'cursor-default'
        ].join(' ')}
        aria-label={`${currentHotel?.name || 'Hotel activo'} · ${tx(ROLE_LABELS[activeRole] || activeRole)}`}
        title={`${currentHotel?.name || 'Hotel activo'} · ${tx(ROLE_LABELS[activeRole] || activeRole)}`}
        aria-haspopup={canOpenMenu ? 'listbox' : undefined}
        aria-expanded={canOpenMenu ? open : undefined}
      >
        <WorkspaceLogo hotel={currentHotel} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5">
            {currentHotel?.name || 'Staynex Workspace'}
          </p>
          <p className={isLight ? 'mt-0.5 truncate text-xs text-slate-500' : 'mt-0.5 truncate text-xs text-slate-400'}>
            {currentHotel?.brand_name || currentHotel?.workspace_slug || currentHotel?.slug || 'Hotel operations'}
          </p>
          {!compact ? <p className={isLight ? 'mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700' : 'mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300'}>
            {tx(ROLE_LABELS[activeRole] || activeRole)}
          </p> : null}
        </div>
        {switching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" aria-hidden="true" />
        ) : canOpenMenu ? (
          <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        ) : null}
      </button>

      {open ? (
        <div
          className={[
            compact ? 'absolute left-0 right-0 bottom-full z-50 mb-2 overflow-hidden rounded-xl border shadow-2xl' : 'absolute left-4 right-4 top-full z-50 mt-2 overflow-hidden rounded-xl border shadow-2xl',
            isLight
              ? 'border-slate-200 bg-white text-slate-950 shadow-slate-200/80'
              : 'border-white/10 bg-[#0b1019] text-white shadow-black/40'
          ].join(' ')}
          role="listbox"
        >
          <div className={isLight ? 'border-b border-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500' : 'border-b border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'}>
            Switch workspace
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {availableHotels.map((assignment) => {
              const hotel = assignment.hotel;
              const active = hotel?.id === currentHotel?.id;
              const role = assignment.role || assignment.hotelUser?.role || 'blocked';

              return (
                <button
                  key={hotel.id}
                  type="button"
                  onClick={() => handleSwitch(hotel.id)}
                  className={[
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition',
                    isLight
                      ? active
                        ? 'bg-emerald-50 text-slate-950'
                        : 'text-slate-700 hover:bg-slate-50'
                      : active
                        ? 'bg-emerald-300/10 text-white'
                        : 'text-slate-300 hover:bg-white/[0.05]'
                  ].join(' ')}
                  role="option"
                  aria-selected={active}
                >
                  <WorkspaceLogo hotel={hotel} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{hotel.name}</p>
                    <p className={isLight ? 'truncate text-xs text-slate-500' : 'truncate text-xs text-slate-500'}>
                      {tx(ROLE_LABELS[role] || role)}
                    </p>
                  </div>
                  {active ? <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          {canCreateWorkspace ? (
            <div className={isLight ? 'border-t border-slate-100 p-2' : 'border-t border-white/10 p-2'}>
              <a href="/platform/organizations" className="block rounded-lg px-3 py-2 text-xs font-bold">
                Crear hotel en una organización
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {!currentHotel ? (
        <div className={isLight ? 'mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800' : 'mt-2 flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100'}>
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          No active workspace
        </div>
      ) : null}
    </div>
  );
};
