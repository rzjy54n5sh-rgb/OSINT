'use client';

import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { GLOSSARY } from '@/lib/glossary';

type ConflictDayBadgeProps = {
  day: number;
  className?: string;
};

export function ConflictDayBadge({ day, className = '' }: ConflictDayBadgeProps) {
  const badge = (
    <span
      className={`font-mono text-xs uppercase px-2 py-0.5 border ${className}`}
      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
    >
      <span translate="no">DAY {day}</span>
    </span>
  );
  return (
    <GlossaryTooltip term="CONFLICT_DAY" definition={GLOSSARY.CONFLICT_DAY}>
      {badge}
    </GlossaryTooltip>
  );
}
