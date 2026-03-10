'use client';

import Link from 'next/link';

/**
 * Catches uncaught client-side errors (e.g. Supabase init, hydration) and shows a fallback
 * instead of the generic "Application error: a client-side exception has occurred".
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: 'system-ui, sans-serif',
        background: '#070A0F',
        color: '#E8EDF5',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <p style={{ color: '#E8C547', fontSize: 14, letterSpacing: 2, marginBottom: 8 }}>
            MENA INTEL DESK
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#8A9BB5', fontSize: 14, marginBottom: 24 }}>
            A client error occurred. Try refreshing. If the problem continues, check the browser console.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '10px 20px',
                background: '#E8C547',
                color: '#070A0F',
                border: 'none',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#E8C547',
                border: '1px solid #E8C547',
                borderRadius: 4,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
