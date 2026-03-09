'use client';

type ConflictDayBadgeProps = {
  day: number;
  className?: string;
};

export function ConflictDayBadge({ day, className = '' }: ConflictDayBadgeProps) {
  return (
    <span
      className={`font-mono text-xs uppercase px-2 py-0.5 border ${className}`}
      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
    >
      CONFLICT DAY: {day}
    </span>
  );
}
