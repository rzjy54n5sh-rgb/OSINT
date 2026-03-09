'use client';

import { GlossaryTooltip } from '@/components/GlossaryTooltip';

const SOURCE_TYPE_DEFS: Record<string, string> = {
  OFFICIAL: 'Primary source: government statement, military release, or official communiqué',
  NEWS: 'Verified news outlet with editorial standards',
  OSINT: 'Open-source intelligence: satellite imagery, flight tracking, intercepts, or social media',
};

type SourceBadgeProps = {
  name: string | null;
  logoUrl: string | null;
  sourceType: string | null;
  className?: string;
};

export function SourceBadge({ name, logoUrl, sourceType, className = '' }: SourceBadgeProps) {
  const typeKey = (sourceType ?? '').toUpperCase();
  const typeDef = typeKey ? SOURCE_TYPE_DEFS[typeKey] : null;
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
        typeDef ? (
          <GlossaryTooltip term={typeKey} definition={typeDef}>
            <span style={{ color: 'var(--text-muted)' }} className="uppercase cursor-help">
              [{sourceType}]
            </span>
          </GlossaryTooltip>
        ) : (
          <span style={{ color: 'var(--text-muted)' }} className="uppercase">
            [{sourceType}]
          </span>
        )
      )}
    </span>
  );
}
