'use client';

import { useEffect, useRef, useState } from 'react';

export function GlobeMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Language and translation options"
        style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
          fontFamily: 'IBM Plex Mono', fontSize: 10, padding: '3px 8px',
          letterSpacing: '1px', transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--accent-gold)'; (e.target as HTMLButtonElement).style.borderColor = 'var(--accent-gold)'; }}
        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.target as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
      >
        🌐
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            width: 280, background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', zIndex: 100, padding: 16,
          }}
        >
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 10 }}>
            LANGUAGE / TRANSLATION
          </div>
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            This platform is English-only. Use your browser or Google Translate to read in your language.
          </p>
          {[
            { label: 'Chrome / Edge', tip: 'Right-click anywhere → Translate to...' },
            { label: 'Safari', tip: 'Tap the AA button → Translate' },
            { label: 'Firefox', tip: 'Translate icon in the address bar' },
          ].map((b) => (
            <div key={b.label} style={{ marginBottom: 6 }}>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-secondary)' }}>{b.label}: </span>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)' }}>{b.tip}</span>
            </div>
          ))}
          <a
            href={`https://translate.google.com/translate?u=${encodeURIComponent(currentUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', marginTop: 12, padding: '7px 0', textAlign: 'center',
              fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-blue)',
              border: '1px solid var(--accent-blue)', textDecoration: 'none', letterSpacing: '1px',
            }}
          >
            ↗ OPEN IN GOOGLE TRANSLATE
          </a>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Common reader languages: Arabic · Farsi · Turkish · Hebrew · Russian · French
          </div>
        </div>
      )}
    </div>
  );
}
