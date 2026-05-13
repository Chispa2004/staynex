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

export const DashboardThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    setThemeState(normalizeTheme(storedTheme));
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(() => {
    const setTheme = (nextTheme) => {
      const safeTheme = normalizeTheme(nextTheme);
      setThemeState(safeTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    };

    const toggleTheme = () => {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    return {
      theme,
      setTheme,
      toggleTheme
    };
  }, [theme]);

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
