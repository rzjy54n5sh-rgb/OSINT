'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mena-translation-dismissed';

export function TranslationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private browsing)
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '7px 16px',
        background: 'rgba(74,143,232,0.07)',
        borderBottom: '1px solid rgba(74,143,232,0.2)',
      }}
      role="banner"
      aria-label="Translation notice"
    >
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--accent-blue)', flexShrink: 0 }}>
        🌐
      </span>
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>
        This platform is published in English only.{' '}
        <span style={{ color: 'var(--text-muted)' }}>
          Chrome/Edge: right-click → Translate · Safari: tap AA → Translate · Firefox: translate icon in address bar ·{' '}
          <a
            href={`https://translate.google.com/translate?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : 'https://mena-intel-desk.com')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
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
          fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)',
          background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 6px',
          letterSpacing: '1px',
        }}
      >
        ✕
      </button>
    </div>
  );
}
