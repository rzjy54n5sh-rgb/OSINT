'use client';

type SourceBadgeProps = {
  name: string | null;
  logoUrl: string | null;
  sourceType: string | null;
  className?: string;
};

export function SourceBadge({ name, logoUrl, sourceType, className = '' }: SourceBadgeProps) {
  return (
    <span
      className={`font-mono text-xs border px-2 py-0.5 inline-flex items-center gap-1.5 ${className}`}
      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          width={16}
          height={16}
          className="rounded-sm object-cover"
        />
      )}
      <span>{name || '—'}</span>
      {sourceType && (
        <span style={{ color: 'var(--text-muted)' }} className="uppercase">
          [{sourceType}]
        </span>
      )}
    </span>
  );
}
