'use client';

import { useI18n } from '@/components/I18nProvider';

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer
      className="mt-auto border-t py-4 px-4 text-center font-mono text-[10px] uppercase tracking-wider"
      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
    >
      <p className="mb-1" style={{ color: 'var(--text-secondary)' }}>
        MENA INTEL DESK — {t('openSourceIntel')}
      </p>
      <p>{t('allDataVerification')}</p>
    </footer>
  );
}
