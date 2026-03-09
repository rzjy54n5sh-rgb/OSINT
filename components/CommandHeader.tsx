'use client';

import Link from 'next/link';
import { useRealtimeCount } from '@/hooks/useRealtimeCount';

export function CommandHeader() {
  const { articleCount, lastUpdate, live } = useRealtimeCount();

  return (
    <header className="border-b border-[var(--border)] bg-bg-secondary/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-semibold text-text-primary">
          <span className="text-accent-gold">◆</span>
          MENA INTEL DESK
        </Link>
        <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-wider text-text-secondary">
          <span>CONFLICT DAY: —</span>
          <span>LAST UPDATE: {lastUpdate}</span>
          <span>ARTICLES: {articleCount}</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-accent-red' : 'bg-text-muted'}`}
              aria-hidden
            />
            {live ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
        <nav className="flex gap-4">
          <HeaderLink href="/feed">Feed</HeaderLink>
          <HeaderLink href="/nai">NAI Map</HeaderLink>
          <HeaderLink href="/analytics">Analytics</HeaderLink>
          <HeaderLink href="/timeline">Timeline</HeaderLink>
          <HeaderLink href="/scenarios">Scenarios</HeaderLink>
          <HeaderLink href="/disinfo">Disinfo</HeaderLink>
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-mono text-[10px] uppercase tracking-widest text-text-secondary transition hover:text-accent-gold"
    >
      {children}
    </Link>
  );
}
