'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import type { Lang } from '@/lib/i18n';

export function LanguageToggle() {
  const router = useRouter();
  const { lang } = useI18n();

  const toggle = () => {
    const newLang: Lang = lang === 'en' ? 'ar' : 'en';
    document.cookie = `lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
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
