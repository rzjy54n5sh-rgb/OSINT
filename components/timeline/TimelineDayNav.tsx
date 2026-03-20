'use client';

import { useEffect, useState } from 'react';

interface Props {
  dayNumbers: number[];
}

export function TimelineDayNav({ dayNumbers }: Props) {
  const [hash, setHash] = useState('');
  useEffect(() => {
    setHash(typeof window !== 'undefined' ? window.location.hash : '');
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const sortedAsc = [...dayNumbers].sort((a, b) => a - b);

  const jump = (d: number) => {
    const el = document.getElementById(`day-${d}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#day-${d}`);
    setHash(`#day-${d}`);
  };

  return (
    <div
      className="sticky top-[52px] z-30 mb-8 py-3 -mx-4 px-4 border-b"
      style={{
        background: 'rgba(7, 10, 15, 0.92)',
        backdropFilter: 'blur(10px)',
        borderColor: 'var(--border)',
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        Jump to day
      </p>
      {/* Mobile: dropdown */}
      <div className="md:hidden">
        <select
          className="w-full font-mono text-xs py-2 px-3 rounded-sm border bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          value={hash.replace('#day-', '') || sortedAsc[sortedAsc.length - 1]?.toString() || ''}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) jump(v);
          }}
          aria-label="Jump to conflict day"
        >
          {sortedAsc.map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </select>
      </div>
      {/* Desktop: pill links */}
      <div className="hidden md:flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
        {sortedAsc.map((d) => (
          <a
            key={d}
            href={`#day-${d}`}
            className="font-mono text-[11px] px-2 py-1 rounded-sm border transition-colors hover:opacity-90"
            style={{
              borderColor: hash === `#day-${d}` ? 'var(--accent-gold)' : 'var(--border)',
              color: hash === `#day-${d}` ? 'var(--accent-gold)' : 'var(--text-secondary)',
              background:
                hash === `#day-${d}` ? 'rgba(232, 197, 71, 0.08)' : 'rgba(13, 27, 42, 0.5)',
            }}
          >
            {d}
          </a>
        ))}
      </div>
    </div>
  );
}
