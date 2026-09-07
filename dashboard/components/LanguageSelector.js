'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DASHBOARD_LANGUAGES } from '@/lib/i18n/translations';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const LanguageSelector = ({ placement = 'bottom' }) => {
  const { language, setLanguage, t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const visible = open || hovered;
  const active = DASHBOARD_LANGUAGES.find((item) => item.code === language) || DASHBOARD_LANGUAGES[0];
  const close = () => { setOpen(false); setHovered(false); };
  useEffect(() => {
    if (!visible) return undefined;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) { setOpen(false); setHovered(false); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [visible]);

  return (
    <div ref={root} className="relative shrink-0"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { close(); trigger.current?.focus(); }
      }}>
      <button ref={trigger} type="button" aria-label={`${t('app.language')}: ${active.name}`}
        aria-expanded={visible} aria-controls={id} onClick={() => setOpen((value) => !value)}
        className={theme === 'light'
          ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800'
          : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b1019] px-3 py-2 text-xs font-semibold text-slate-200'}>
        {active.label}<ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {visible ? <div id={id} role="group" aria-label={t('app.language')}
        className={`absolute right-0 z-[80] min-w-36 ${placement === 'top' ? 'bottom-full pb-2' : 'top-full pt-2'}`}>
        <div className={theme === 'light' ? 'rounded-lg border border-slate-200 bg-white p-1 shadow-lg' : 'rounded-lg border border-white/10 bg-[#101a2a] p-1 shadow-lg'}>
          {DASHBOARD_LANGUAGES.filter((item) => item.code !== language).map((item) => (
            <button key={item.code} type="button" lang={item.code}
              onClick={() => { setLanguage(item.code); close(); trigger.current?.focus(); }}
              className={theme === 'light' ? 'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100' : 'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10'}>
              {item.name}
            </button>
          ))}
        </div>
      </div> : null}
    </div>
  );
};
