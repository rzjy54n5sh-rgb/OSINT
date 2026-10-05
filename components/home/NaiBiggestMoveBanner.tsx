import { getNaiScores } from '@/lib/api/nai';
import { getConflictDay, getSessionToken } from '@/utils/supabase/server';
import { formatConflictDayShort, sectionFreshness } from '@/lib/conflict-calendar';

/**
 * Server-rendered: largest |Δ expressed| vs previous NAI day (api-nai `delta`).
 *
 * Asks api-nai for its own latest day (no `day` param → MAX(nai_scores.conflict_day)
 * inside the Edge Function) instead of passing the calendar day, which would return
 * nothing while nai_scores is frozen. The move is only called "TODAY" when the NAI
 * day equals the calendar day; otherwise its as-of day is stated explicitly.
 */
export async function NaiBiggestMoveBanner() {
  const currentDay = await getConflictDay();
  const token = await getSessionToken();
  let res: Awaited<ReturnType<typeof getNaiScores>>;
  try {
    res = await getNaiScores(undefined, token ?? undefined);
  } catch {
    return null;
  }

  const rows = res?.data ?? [];
  const naiDay =
    typeof res?.conflictDay === 'number' && res.conflictDay > 0
      ? res.conflictDay
      : (rows[0]?.conflict_day ?? null);
  const withDelta = rows.filter((r) => r.delta !== null && r.delta !== undefined);
  if (withDelta.length === 0) return null;

  const biggest = [...withDelta].sort(
    (a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0),
  )[0];
  const d = biggest.delta ?? 0;
  if (Math.abs(d) < 5) return null;

  const cat = biggest.category ?? '—';
  const fresh = sectionFreshness(naiDay, currentDay);
  const isToday = fresh.status === 'current';

  return (
    <div
      className="border border-[#E8C547]/40 bg-[#E8C547]/5 px-4 py-3 font-mono text-sm mb-4 rounded-sm"
      data-testid="nai-biggest-move"
      data-freshness={fresh.status}
    >
      <span className="text-[#E8C547]">
        {isToday ? '◆ BIGGEST MOVE TODAY:' : `◆ BIGGEST NAI MOVE — DAY ${naiDay ?? '—'}:`}
      </span>
      <span className="text-white ml-2">
        <span translate="no">{biggest.country_code}</span>{' '}
        <span translate="no">
          {d > 0 ? '↑' : '↓'}
          {Math.abs(d)} points
        </span>
        <span translate="no">
          {' '}
          · {isToday ? 'Now' : 'Score'} {biggest.expressed_score} [{cat}]
        </span>
      </span>
      {!isToday && (
        <div className="text-xs mt-1 uppercase" style={{ color: 'var(--accent-orange)' }} translate="no">
          ⚠ NAI — Latest available: Day {naiDay ?? '—'}
          {naiDay != null ? ` (${formatConflictDayShort(naiDay)})` : ''} — no data for Day {currentDay}
        </div>
      )}
    </div>
  );
}
