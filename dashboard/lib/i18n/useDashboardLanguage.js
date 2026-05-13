'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  DASHBOARD_LANGUAGE_STORAGE_KEY,
  DEFAULT_DASHBOARD_LANGUAGE,
  translations
} from './translations';

const DashboardLanguageContext = createContext(null);

const getValue = (dictionary, path) => path
  .split('.')
  .reduce((current, part) => current?.[part], dictionary);

const formatValue = (value, replacements = {}) => Object.entries(replacements)
  .reduce((current, [key, replacement]) => current.replaceAll(`{${key}}`, replacement), value);

export const DashboardLanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(DEFAULT_DASHBOARD_LANGUAGE);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(DASHBOARD_LANGUAGE_STORAGE_KEY);

    if (translations[storedLanguage]) {
      setLanguageState(storedLanguage);
    }
  }, []);

  const setLanguage = (nextLanguage) => {
    const safeLanguage = translations[nextLanguage] ? nextLanguage : DEFAULT_DASHBOARD_LANGUAGE;
    setLanguageState(safeLanguage);
    window.localStorage.setItem(DASHBOARD_LANGUAGE_STORAGE_KEY, safeLanguage);
  };

  const value = useMemo(() => {
    const t = (key, replacements = {}) => {
      const translatedValue = getValue(translations[language], key)
        || getValue(translations[DEFAULT_DASHBOARD_LANGUAGE], key)
        || key;

      return typeof translatedValue === 'string'
        ? formatValue(translatedValue, replacements)
        : translatedValue;
    };

    return {
      language,
      setLanguage,
      t
    };
  }, [language]);

  return (
    <DashboardLanguageContext.Provider value={value}>
      {children}
    </DashboardLanguageContext.Provider>
  );
};

export const useDashboardLanguage = () => {
  const context = useContext(DashboardLanguageContext);

  if (!context) {
    throw new Error('useDashboardLanguage must be used inside DashboardLanguageProvider');
  }

  return context;
};
