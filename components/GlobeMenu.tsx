'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';

/**
 * Translation help (the platform is English-only). `inline`: inside a menu panel the help opens in
 * the flow under the button instead of as a floating popover.
 */
export function GlobeMenu({ inline = false }: { inline?: boolean }) {
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
        aria-expanded={open}
        aria-label={inline ? undefined : 'Language and translation options'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 44,
          justifyContent: 'center', background: 'none', border: 0, padding: inline ? 0 : '0 8px',
          color: 'var(--text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 15,
        }}
      >
        <Icon name="globe" />
        {inline ? <span>Language / translation</span> : null}
      </button>
      {open && (
        <div
          style={{
            ...(inline
              ? { position: 'static', marginTop: 4, maxWidth: 320 }
              : { position: 'absolute', top: '100%', insetInlineEnd: 0, marginTop: 6, width: 280 }),
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', zIndex: 100, padding: 16,
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 10 }}>
            LANGUAGE / TRANSLATION
          </div>
          <p style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            This platform is English-only. Use your browser or Google Translate to read in your language.
          </p>
          {[
            { label: 'Chrome / Edge', tip: 'Right-click anywhere → Translate to...' },
            { label: 'Safari', tip: 'Tap the AA button → Translate' },
            { label: 'Firefox', tip: 'Translate icon in the address bar' },
          ].map((b) => (
            <div key={b.label} style={{ marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{b.label}: </span>
              <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--text-muted)' }}>{b.tip}</span>
            </div>
          ))}
          <a
            href={`https://translate.google.com/translate?u=${encodeURIComponent(currentUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', marginTop: 12, padding: '7px 0', textAlign: 'center',
              fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--accent-blue)',
              border: '1px solid var(--accent-blue)', textDecoration: 'none', letterSpacing: '1px',
            }}
          >
            ↗ OPEN IN GOOGLE TRANSLATE
          </a>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Common reader languages: Arabic · Farsi · Turkish · Hebrew · Russian · French
          </div>
        </div>
      )}
    </div>
  );
}
