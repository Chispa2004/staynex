'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

const DashboardThemeContext = createContext(null);

const THEME_STORAGE_KEY = 'staynex_dashboard_theme';
const DEFAULT_THEME = 'dark';

const normalizeTheme = (theme) => (theme === 'light' ? 'light' : DEFAULT_THEME);

export const DashboardThemeProvider = ({ children, forcedTheme = null }) => {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  useEffect(() => {
    try { setThemeState(normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))); } catch { /* Storage can be unavailable. */ }
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = forcedTheme || theme;
  }, [theme, forcedTheme]);

  const value = useMemo(() => {
    const setTheme = (nextTheme) => {
      const safeTheme = normalizeTheme(nextTheme);
      setThemeState(safeTheme);
      try { window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme); } catch { /* Keep in memory. */ }
    };

    const toggleTheme = () => {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    return {
      theme: forcedTheme || theme,
      setTheme,
      toggleTheme
    };
  }, [theme, forcedTheme]);

  return (
    <DashboardThemeContext.Provider value={value}>
      {children}
    </DashboardThemeContext.Provider>
  );
};

export const useDashboardTheme = () => {
  const context = useContext(DashboardThemeContext);

  if (!context) {
    throw new Error('useDashboardTheme must be used inside DashboardThemeProvider');
  }

  return context;
};
