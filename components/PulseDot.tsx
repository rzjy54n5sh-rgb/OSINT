'use client';

type PulseDotProps = {
  live?: boolean;
  className?: string;
};

export function PulseDot({ live = true, className = '' }: PulseDotProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex h-2 w-2">
        {live && (
          <span
            className="pulse-ring absolute inline-flex h-full w-full rounded-full"
            style={{ background: 'var(--accent-green)' }}
          />
        )}
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ background: live ? 'var(--accent-green)' : 'var(--text-muted)' }}
        />
      </span>
      <span className="font-mono text-xs uppercase" style={{ color: 'var(--text-secondary)' }}>
        {live ? 'LIVE' : 'OFFLINE'}
      </span>
    </span>
  );
}
