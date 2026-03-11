'use client';

import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { GLOSSARY } from '@/lib/glossary';

const SOURCE_TYPE_TO_GLOSSARY_KEY: Record<string, keyof typeof GLOSSARY> = {
  WIRE: 'WIRE',
  BROADCAST: 'BROADCAST',
  OFFICIAL: 'OFFICIAL',
  MILITARY: 'MILITARY',
  ELITE: 'ELITE',
  FINANCIAL: 'FINANCIAL',
  THINK_TANK: 'THINK_TANK',
  NEWS: 'BROADCAST',
};

const FALLBACK_DEFS: Record<string, string> = {
  REGIONAL: 'Country-specific news outlets.',
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
  const glossaryKey = typeKey ? SOURCE_TYPE_TO_GLOSSARY_KEY[typeKey] : null;
  const definition = glossaryKey ? GLOSSARY[glossaryKey] : (typeKey ? FALLBACK_DEFS[typeKey] : null);
  const typeDef = definition ?? null;
  return (
    <span
      className={`font-mono text-xs border px-2 py-0.5 inline-flex items-center gap-1.5 ${className}`}
      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
      translate="no"
    >
      {logoUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic source logo URL */}
          <img
          src={logoUrl}
          alt=""
          width={16}
          height={16}
          className="rounded-sm object-cover"
        />
        </>
      )}
      <span>{name || '—'}</span>
      {sourceType && (
        typeDef ? (
          <GlossaryTooltip term={typeKey} definition={typeDef}>
            <span style={{ color: 'var(--text-muted)' }} className="uppercase cursor-help" translate="no">
              [{sourceType}]
            </span>
          </GlossaryTooltip>
        ) : (
          <span style={{ color: 'var(--text-muted)' }} className="uppercase" translate="no">
            [{sourceType}]
          </span>
        )
      )}
    </span>
  );
}
