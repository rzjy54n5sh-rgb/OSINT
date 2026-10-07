'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';
import { t as tFn, type UIStringKey } from '@/lib/i18n';

type I18nContextValue = {
  lang: Lang;
  t: (key: UIStringKey) => string;
  /** Persists the choice in the `lang` cookie and switches the UI without a server round trip. */
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readLangCookie(): Lang {
  try {
    return /(?:^|; )lang=ar(?:;|$)/.test(document.cookie) ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

function applyDocumentLang(lang: Lang) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('font-arabic-ui', lang === 'ar');
}

/**
 * The server always renders the default language (the root layout does not read cookies, so
 * pages stay cacheable and identical for every visitor). The visitor's `lang` cookie is applied
 * after hydration; the first client render matches the server HTML, so there is no mismatch.
 */
export function I18nProvider({ lang: serverLang, children }: { lang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(serverLang);

  useEffect(() => {
    const fromCookie = readLangCookie();
    if (fromCookie !== serverLang) setLangState(fromCookie);
    applyDocumentLang(fromCookie);
  }, [serverLang]);

  const setLang = useCallback((next: Lang) => {
    document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setLangState(next);
    applyDocumentLang(next);
  }, []);

  const value = useMemo(
    () => ({
      lang,
      t: (key: UIStringKey) => tFn(key, lang),
      setLang,
    }),
    [lang, setLang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return { lang: 'en', t: (key: UIStringKey) => tFn(key, 'en'), setLang: () => {} };
  }
  return ctx;
}
