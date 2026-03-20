'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';
import { t as tFn, type UIStringKey } from '@/lib/i18n';

type I18nContextValue = {
  lang: Lang;
  t: (key: UIStringKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(
    () => ({
      lang,
      t: (key: UIStringKey) => tFn(key, lang),
    }),
    [lang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return { lang: 'en', t: (key: UIStringKey) => tFn(key, 'en') };
  }
  return ctx;
}
