import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      {/* Corner brackets */}
      <div style={{ position: 'relative', padding: '32px 40px', border: '1px solid var(--border)', maxWidth: 480 }}>
        <div style={{ position: 'absolute', top: -1, left: -1, width: 16, height: 16, borderTop: '2px solid var(--accent-gold)', borderLeft: '2px solid var(--accent-gold)' }} />
        <div style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderTop: '2px solid var(--accent-gold)', borderRight: '2px solid var(--accent-gold)' }} />
        <div style={{ position: 'absolute', bottom: -1, left: -1, width: 16, height: 16, borderBottom: '2px solid var(--accent-gold)', borderLeft: '2px solid var(--accent-gold)' }} />
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderBottom: '2px solid var(--accent-gold)', borderRight: '2px solid var(--accent-gold)' }} />

        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 12 }}>
          ◆ ERROR 404
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 48, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '2px', margin: '0 0 12px 0' }}>
          Page not found
        </h1>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 24px 0' }}>
          There is no page at this address. It may have been moved, or the link may be mistyped. Use the links below or
          the menu to find what you need.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link prefetch={false}
            href="/"
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1.5px',
              padding: '8px 20px', border: '1px solid var(--accent-gold)', minHeight: 44, display: 'inline-flex', alignItems: 'center',
              color: 'var(--accent-gold)', textDecoration: 'none',
            }}
          >
            ← HOME
          </Link>
          <Link prefetch={false}
            href="/warroom"
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1.5px',
              padding: '8px 20px', border: '1px solid var(--accent-red)', minHeight: 44, display: 'inline-flex', alignItems: 'center',
              color: 'var(--accent-red)', textDecoration: 'none',
            }}
          >
            ● WAR ROOM
          </Link>
        </div>
      </div>
    </div>
  );
}
