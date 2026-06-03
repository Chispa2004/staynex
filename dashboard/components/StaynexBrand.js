'use client';

import { cn } from '@/lib/ui/styles';

export const STAYNEX_BLUE = '#0A66FF';

export const StaynexLogo = ({ className = '', size = 'md', withShadow = true }) => {
  const sizeClass = {
    xs: 'h-7 w-7 rounded-lg',
    sm: 'h-9 w-9 rounded-xl',
    md: 'h-11 w-11 rounded-xl',
    lg: 'h-14 w-14 rounded-2xl'
  }[size] || size;

  return (
    <span className={cn('inline-flex shrink-0 overflow-hidden', sizeClass, withShadow ? 'drop-shadow-lg' : '', className)}>
      <img src="/staynex-logo.svg" alt="Staynex" className="h-full w-full object-cover" />
    </span>
  );
};

export const StaynexWordmark = ({ className = '', logoSize = 'sm', subtitle = null }) => (
  <span className={cn('inline-flex min-w-0 items-center gap-3', className)}>
    <StaynexLogo size={logoSize} />
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold leading-5">Staynex</span>
      {subtitle ? <span className="block truncate text-xs leading-4 opacity-65">{subtitle}</span> : null}
    </span>
  </span>
);

export const PoweredByStaynex = ({ className = '' }) => (
  <span className={cn('inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70', className)}>
    <StaynexLogo size="xs" withShadow={false} />
    <span>Powered by Staynex</span>
  </span>
);
