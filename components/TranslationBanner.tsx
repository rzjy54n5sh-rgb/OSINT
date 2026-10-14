'use client';

import { useEffect, useState } from 'react';
import { SITE_URL } from '@/lib/site';
import { Icon } from '@/components/ui/icons';

const STORAGE_KEY = 'mena-translation-dismissed';

/**
 * Server-rendered (it used to mount after hydration and push the whole page down ~37 px — a
 * layout shift on every first visit). Visitors who dismissed it are hidden before first paint by
 * the root layout's boot script (`html[data-tb-dismissed]`, see globals.css), so it never jumps.
 */
export function TranslationBanner() {
  const [visible, setVisible] = useState(true);
  const [translateHref, setTranslateHref] = useState(
    `https://translate.google.com/translate?u=${encodeURIComponent(SITE_URL)}`,
  );

  useEffect(() => {
    setTranslateHref(`https://translate.google.com/translate?u=${encodeURIComponent(window.location.href)}`);
    try {
      if (localStorage.getItem(STORAGE_KEY)) setVisible(false);
    } catch {
      // localStorage unavailable (private browsing)
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-tb-dismissed', '');
  };

  if (!visible) return null;

  return (
    <div
      className="translation-banner"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '7px 16px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
      }}
      role="banner"
      aria-label="Translation notice"
    >
      <Icon name="globe" size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 13, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>
        This platform is published in English only.{' '}
        <span style={{ color: 'var(--text-muted)' }}>
          Chrome/Edge: right-click → Translate · Safari: tap AA → Translate · Firefox: translate icon in address bar ·{' '}
          <a
            href={translateHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-blue)', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Open in Google Translate ↗
          </a>
        </span>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss translation notice"
        style={{
          fontFamily: 'var(--font-mono), monospace', fontSize: 13, color: 'var(--text-muted)',
          background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0,
          letterSpacing: '1px',
          // 44×44 tap target; the negative margins keep the banner its original height.
          minWidth: 44, minHeight: 44, margin: '-7px -12px -7px 0',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ✕
      </button>
    </div>
  );
}
