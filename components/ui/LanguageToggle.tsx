'use client';

import { useI18n } from '@/components/I18nProvider';
import type { Lang } from '@/lib/i18n';

export function LanguageToggle() {
  const { lang, setLang } = useI18n();

  // Client-side switch: pages are cached and language-agnostic on the server, so a
  // router.refresh() would only re-download the same payload.
  const toggle = () => {
    const newLang: Lang = lang === 'en' ? 'ar' : 'en';
    setLang(newLang);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="font-mono text-xs text-white/50 hover:text-[#E8C547] transition-colors px-2 py-1 border border-white/20 hover:border-[#E8C547]/40 shrink-0"
      aria-label={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
    >
      {lang === 'en' ? 'العربية' : 'English'}
    </button>
  );
}
