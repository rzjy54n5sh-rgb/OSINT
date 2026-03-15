'use client';

import { useState } from 'react';

interface PageShareCardProps {
  label: string;        // e.g. "NAI MAP · DAY 11"
  summary: string;      // e.g. "Iran: 22 · INVERSION | Egypt: 61 · STABLE | UAE: 72 · ALIGNED"
  url?: string;         // defaults to window.location.href
}

export function PageShareCard({ label, summary, url }: PageShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const shareText = `◆ MENA INTEL DESK — ${label}\n${summary}\n\nmena-intel-desk.com`;
  const shareUrl = url ?? (typeof window !== 'undefined' ? window.location.href : '');

  const copyText = () => {
    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1.5px',
          padding: '4px 12px', border: '1px solid var(--border)',
          color: 'var(--text-muted)', background: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ↗ SHARE INTEL
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
            width: 260, background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', padding: 14,
          }}
        >
          {/* Preview card */}
          <div
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-secondary)',
              padding: 10, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', marginBottom: 10, lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {shareText}
          </div>

          {/* Copy */}
          <button
            type="button"
            onClick={copyText}
            style={{
              width: '100%', marginBottom: 6,
              fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
              padding: '6px 0', border: '1px solid',
              borderColor: copied ? 'var(--accent-green)' : 'var(--border)',
              color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
              background: 'none', cursor: 'pointer',
            }}
          >
            {copied ? '✓ COPIED TO CLIPBOARD' : '◻ COPY INTEL CARD'}
          </button>

          {/* Social links */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'X / TWITTER', href: tweetUrl },
              { label: 'LINKEDIN', href: linkedInUrl },
              { label: 'TELEGRAM', href: telegramUrl },
              { label: 'WHATSAPP', href: whatsappUrl },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: 'IBM Plex Mono', fontSize: 7, letterSpacing: '1px',
                  padding: '5px 0', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', textDecoration: 'none',
                  textAlign: 'center', display: 'block',
                }}
              >
                {s.label}
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              width: '100%', marginTop: 8,
              fontFamily: 'IBM Plex Mono', fontSize: 7, color: 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '1px',
            }}
          >
            ✕ CLOSE
          </button>
        </div>
      )}
    </div>
  );
}
