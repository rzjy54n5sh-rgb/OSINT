'use client';

import { getConflictDay, getFormattedConflictDate } from '@/lib/constants';
import { useI18n } from '@/components/I18nProvider';

interface ConflictDayBadgeProps {
  className?: string;
  showTime?: boolean;
}

export function ConflictDayBadge({ className = '', showTime = true }: ConflictDayBadgeProps) {
  const { t } = useI18n();
  const day = getConflictDay();
  const date = getFormattedConflictDate();
  const utcTime = new Date().toISOString().slice(11, 16);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/10 font-mono text-xs min-w-0 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="text-[#E8C547] font-bold tracking-wider whitespace-nowrap">
        ◆ {t('conflictDay')} <span translate="no">{day}</span>
      </span>
      <span className="text-white/30 hidden sm:inline" aria-hidden>
        ·
      </span>
      <span className="text-white/60 min-w-0">{date}</span>
      {showTime && (
        <>
          <span className="text-white/30 hidden sm:inline" aria-hidden>
            ·
          </span>
          <span className="text-white/40 whitespace-nowrap">
            {t('updatedAt')} <span translate="no">{utcTime}</span> {t('utc')}
          </span>
        </>
      )}
    </div>
  );
}
