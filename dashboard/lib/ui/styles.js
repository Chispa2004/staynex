export const cn = (...classes) => classes.filter(Boolean).join(' ');

export const ui = {
  surface: (isLight, variant = 'card') => {
    const variants = {
      card: isLight
        ? 'border-slate-200/80 bg-white text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.08)]'
        : 'border-white/10 bg-[#0b1019]/90 text-slate-100 shadow-[0_18px_55px_rgba(0,0,0,0.24)]',
      subtle: isLight
        ? 'border-slate-200 bg-slate-50/90 text-slate-900'
        : 'border-white/10 bg-white/[0.035] text-slate-100',
      inset: isLight
        ? 'border-slate-200 bg-slate-50 text-slate-900 shadow-inner shadow-slate-200/70'
        : 'border-white/10 bg-black/20 text-slate-100 shadow-inner shadow-black/20'
    };

    return variants[variant] || variants.card;
  },
  text: {
    eyebrow: (isLight) => cn(
      'text-xs font-semibold uppercase tracking-[0.16em]',
      isLight ? 'text-slate-500' : 'text-slate-500'
    ),
    title: (isLight) => cn(
      'font-semibold tracking-tight',
      isLight ? 'text-slate-950' : 'text-white'
    ),
    body: (isLight) => cn(
      'text-sm leading-6',
      isLight ? 'text-slate-600' : 'text-slate-400'
    ),
    muted: (isLight) => cn(
      'text-sm',
      isLight ? 'text-slate-500' : 'text-slate-500'
    )
  },
  button: (isLight, variant = 'secondary') => {
    const base = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
    const variants = {
      primary: 'border-emerald-200/70 bg-emerald-300 text-slate-950 shadow-lg shadow-emerald-500/15 hover:bg-emerald-200 focus-visible:ring-offset-slate-950',
      secondary: isLight
        ? 'border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-200/70 hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-offset-white'
        : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] hover:text-white focus-visible:ring-offset-[#0b1019]',
      ghost: isLight
        ? 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-offset-white'
        : 'border-transparent bg-transparent text-slate-400 hover:bg-white/[0.06] hover:text-white focus-visible:ring-offset-[#0b1019]',
      danger: isLight
        ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100 focus-visible:ring-red-300 focus-visible:ring-offset-white'
        : 'border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15 focus-visible:ring-red-300/60 focus-visible:ring-offset-[#0b1019]'
    };

    return cn(base, variants[variant] || variants.secondary);
  },
  iconButton: (isLight, variant = 'secondary') => cn(
    ui.button(isLight, variant),
    'h-9 w-9 px-0 py-0'
  ),
  input: (isLight) => cn(
    'rounded-lg border px-3 py-2.5 text-sm outline-none transition duration-200 placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/15',
    isLight
      ? 'border-slate-200 bg-white text-slate-950 placeholder:text-slate-400'
      : 'border-white/10 bg-[#0b1019] text-slate-100 placeholder:text-slate-600'
  ),
  badge: (isLight, tone = 'slate', compact = false) => {
    const tones = {
      emerald: isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
      sky: isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-300/10 text-sky-100',
      amber: isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100',
      orange: isLight ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-orange-300/20 bg-orange-400/10 text-orange-100',
      red: isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100',
      violet: isLight ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-violet-300/20 bg-violet-400/10 text-violet-100',
      slate: isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-white/[0.045] text-slate-300'
    };

    return cn(
      'inline-flex w-fit items-center rounded-full border font-semibold',
      compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      tones[tone] || tones.slate
    );
  },
  skeleton: (isLight) => cn(
    'animate-pulse rounded-lg',
    isLight ? 'bg-slate-200/80' : 'bg-white/[0.08]'
  )
};
