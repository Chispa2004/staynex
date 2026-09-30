'use client';

import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { THEME_STORAGE_KEY, DEFAULT_THEME, normalizeTheme, applyTheme } from './theme-contract';

const DashboardThemeContext = createContext(null);

export const DashboardThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let initial = DEFAULT_THEME;
    try { initial = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)); } catch { /* Private browsing can deny storage. */ }
    applyTheme(initial);
    setThemeState(initial);
    setReady(true);
    const sync = event => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const next = normalizeTheme(event.newValue);
      applyTheme(next);
      setThemeState(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const value = useMemo(() => {
    const setTheme = nextTheme => {
      const next = normalizeTheme(nextTheme);
      applyTheme(next);
      setThemeState(next);
      try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* The selected theme remains effective in this page. */ }
    };
    return { theme, setTheme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
  }, [theme]);

  // This neutral shell uses bootstrapped CSS variables. No protected content or
  // mismatched theme controls are mounted before the preference is recovered.
  return <DashboardThemeContext.Provider value={value}>
    {ready ? children : <div className="theme-bootstrap" role="status" aria-label="Staynex"><img src="/staynex-logo.svg" alt="Staynex" width="140" height="40" /></div>}
  </DashboardThemeContext.Provider>;
};

export const useDashboardTheme = () => {
  const context = useContext(DashboardThemeContext);
  if (!context) throw new Error('useDashboardTheme must be used inside DashboardThemeProvider');
  return context;
};
