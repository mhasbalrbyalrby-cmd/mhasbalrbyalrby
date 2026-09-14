import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Language, type Direction, translations, getDirection } from './i18n';

interface I18nContextValue {
  lang: Language;
  dir: Direction;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = 'erp-lang';

function getInitialLang(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'ar' || stored === 'en') return stored;
  return 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang);
  const dir = getDirection(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  function setLang(newLang: Language) {
    localStorage.setItem(STORAGE_KEY, newLang);
    setLangState(newLang);
  }

  function t(key: string): string {
    return translations[lang][key] ?? translations.en[key] ?? key;
  }

  return (
    <I18nContext.Provider value={{ lang, dir, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
