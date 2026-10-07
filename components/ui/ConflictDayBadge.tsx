'use client';

import { getConflictDay, getFormattedConflictDate } from '@/lib/constants';
import { useI18n } from '@/components/I18nProvider';
import { useDataFreshness } from '@/hooks/useDataFreshness';
import { formatUtcStamp } from '@/lib/data-freshness';

interface ConflictDayBadgeProps {
  className?: string;
  showTime?: boolean;
}

export function ConflictDayBadge({ className = '', showTime = true }: ConflictDayBadgeProps) {
  const { t } = useI18n();
  const day = getConflictDay();
  const date = getFormattedConflictDate();
  // Real newest article / brief timestamp from the DB (not the visitor's clock).
  const { lastUpdateAt } = useDataFreshness();
  const stamp = formatUtcStamp(lastUpdateAt).replace(/ UTC$/, '');

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
      {showTime && lastUpdateAt && (
        <>
          <span className="text-white/30 hidden sm:inline" aria-hidden>
            ·
          </span>
          <span className="text-white/40 whitespace-nowrap">
            {t('updatedAt')} <span translate="no">{stamp}</span> {t('utc')}
          </span>
        </>
      )}
    </div>
  );
}
