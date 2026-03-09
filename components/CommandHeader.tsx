'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useRealtimeCount } from '@/hooks/useRealtimeCount';

const NAV_LINKS = [
  { href: '/feed',      label: 'FEED' },
  { href: '/nai',       label: 'NAI MAP' },
  { href: '/countries', label: 'COUNTRIES' },
  { href: '/scenarios', label: 'SCENARIOS' },
  { href: '/disinfo',   label: 'DISINFO' },
  { href: '/markets',   label: 'MARKETS' },
  { href: '/social',    label: 'SOCIAL' },
  { href: '/timeline',  label: 'TIMELINE' },
  { href: '/analytics', label: 'ANALYTICS' },
];

export function CommandHeader() {
  const pathname = usePathname();
  const { articleCount, lastUpdate, live } = useRealtimeCount();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(7, 10, 15, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          maxWidth: '1800px',
          margin: '0 auto',
          padding: '0 24px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--accent-gold)', fontSize: '14px', lineHeight: 1 }}>◆</span>
          <span
            style={{
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: '16px',
              letterSpacing: '3px',
              color: 'var(--text-primary)',
            }}
          >
            MENA INTEL DESK
          </span>
        </Link>

        {/* Center stats */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            letterSpacing: '1.5px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
          className="hidden-mobile"
        >
          <span>
            DAY:{' '}
            <span style={{ color: 'var(--accent-red)' }}>10</span>
          </span>
          <span style={{ color: 'var(--border-bright)' }}>|</span>
          <span>
            UPDATE:{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{lastUpdate}</span>
          </span>
          <span style={{ color: 'var(--border-bright)' }}>|</span>
          <span>
            ARTICLES:{' '}
            <span style={{ color: 'var(--accent-gold)' }}>{articleCount}</span>
          </span>
          <span style={{ color: 'var(--border-bright)' }}>|</span>
          {/* Live indicator */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
              {live && (
                <span
                  className="pulse-ring"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'var(--accent-red)',
                    opacity: 0.6,
                  }}
                />
              )}
              <span
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: live ? 'var(--accent-red)' : 'var(--text-muted)',
                }}
              />
            </span>
            <span style={{ color: live ? 'var(--accent-red)' : 'var(--text-muted)' }}>
              {live ? 'LIVE' : 'STANDBY'}
            </span>
          </span>
        </div>

        {/* Desktop nav */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexShrink: 0,
          }}
          className="hidden-mobile"
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="header-link"
              style={{
                color: pathname === href ? 'var(--accent-gold)' : undefined,
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text-secondary)',
          }}
          className="show-mobile"
        >
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '11px',
              letterSpacing: '2px',
            }}
          >
            {menuOpen ? '✕ CLOSE' : '☰ MENU'}
          </span>
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'rgba(7,10,15,0.96)',
          }}
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="header-link"
              onClick={() => setMenuOpen(false)}
              style={{
                fontSize: '11px',
                color: pathname === href ? 'var(--accent-gold)' : undefined,
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      <style>{`
        @media (max-width: 900px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
        @media (min-width: 901px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </header>
  );
}
