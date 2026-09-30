export const THEME_STORAGE_KEY = 'staynex_dashboard_theme';
export const DEFAULT_THEME = 'light';
export const normalizeTheme = value => value === 'dark' ? 'dark' : 'light';
export const applyTheme = theme => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};
// Inline before paint; no cookies, server data, system preference or auth access.
export const themeBootstrap = `(() => { let theme = 'light'; try { theme = localStorage.getItem('staynex_dashboard_theme') === 'dark' ? 'dark' : 'light'; } catch {} const root = document.documentElement; root.classList.toggle('dark', theme === 'dark'); root.dataset.theme = theme; root.style.colorScheme = theme; })();`;
