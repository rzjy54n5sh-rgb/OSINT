import type { ReactNode } from 'react';
import Link from 'next/link';
import { TRUST_LINKS, type TrustHref } from './trust-links';

export { TRUST_LINKS } from './trust-links';

/** Shared shell for the trust pages: kicker, title, intro, sub-nav, body. Server component. */
export function TrustPage({
  kicker,
  title,
  intro,
  current,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  intro: ReactNode;
  current: TrustHref;
  /** Plain date the page text last changed, e.g. "8 October 2026". */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8" style={{ overflowWrap: 'anywhere' }}>
      <header style={{ marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 8 }}>
          ◆ {kicker}
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 38, color: 'var(--text-primary)', letterSpacing: '2px', margin: '0 0 12px 0', lineHeight: 1.05 }}>
          {title}
        </h1>
        <div style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{intro}</div>
        {updated && (
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', margin: '12px 0 0 0', letterSpacing: '1px' }}>
            LAST UPDATED {updated.toUpperCase()}
          </p>
        )}
      </header>

      <nav aria-label="Trust and standards" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
        {TRUST_LINKS.map((l) => {
          const active = l.href === current;
          return (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: 11,
                letterSpacing: '1px',
                padding: '8px 10px',
                minHeight: 36,
                display: 'inline-flex',
                alignItems: 'center',
                border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border)'}`,
                color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
                textDecoration: 'none',
                textTransform: 'uppercase',
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'var(--text-primary)', letterSpacing: '1.5px', margin: '32px 0 10px 0', scrollMarginTop: 72 }}
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 12px 0' }}>{children}</p>;
}

export function List({ children }: { children: ReactNode }) {
  return <ul style={{ margin: '0 0 12px 0', padding: 0, listStyle: 'none' }}>{children}</ul>;
}

export function Li({ children }: { children: ReactNode }) {
  return <li style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>{children}</li>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href) || href.startsWith('mailto:');
  if (external) {
    return (
      <a href={href} rel="noopener noreferrer" target={href.startsWith('mailto:') ? undefined : '_blank'} style={{ color: 'var(--accent-blue)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={false} style={{ color: 'var(--accent-blue)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </Link>
  );
}

/** Neutral note shown when a ledger is not readable yet (migration not applied) or Supabase is down. */
export function NotYetAvailable({ what, reason }: { what: string; reason: 'not_deployed' | 'error' }) {
  return (
    <div
      role="status"
      style={{
        border: '1px dashed var(--border)',
        padding: '16px 18px',
        fontFamily: 'IBM Plex Mono',
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        margin: '8px 0 20px 0',
      }}
    >
      {reason === 'not_deployed'
        ? `The ${what} is not yet available. It will appear here as soon as its database ledger is switched on.`
        : `The ${what} could not be loaded just now. Please try again shortly.`}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        border: '1px solid var(--border)',
        padding: '18px 20px',
        fontFamily: 'DM Sans',
        fontSize: 15,
        color: 'var(--text-secondary)',
        margin: '8px 0 20px 0',
      }}
    >
      {children}
    </div>
  );
}
