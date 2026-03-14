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

        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '3px', marginBottom: 12 }}>
          ◆ SIGNAL NOT FOUND
        </div>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 64, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '4px', marginBottom: 8 }}>
          404
        </div>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 24px 0' }}>
          This intelligence brief does not exist or has been moved. The source you requested returned no signal.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 9, letterSpacing: '1.5px',
              padding: '8px 20px', border: '1px solid var(--accent-gold)',
              color: 'var(--accent-gold)', textDecoration: 'none',
            }}
          >
            ← RETURN TO DASHBOARD
          </Link>
          <Link
            href="/warroom"
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 9, letterSpacing: '1.5px',
              padding: '8px 20px', border: '1px solid var(--accent-red)',
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
