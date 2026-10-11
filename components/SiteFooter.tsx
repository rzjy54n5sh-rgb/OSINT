'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { TRUST_LINKS } from '@/components/trust/trust-links';

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer
      className="mt-auto border-t py-4 px-4 text-center font-mono text-[11px] uppercase tracking-wider"
      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
    >
      <nav aria-label="Trust and standards" className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {TRUST_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            prefetch={false}
            className="inline-flex min-h-[32px] items-center hover:underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mb-1" style={{ color: 'var(--text-secondary)' }}>
        MENA INTEL DESK — {t('openSourceIntel')}
      </p>
      <p>{t('allDataVerification')}</p>
    </footer>
  );
}
