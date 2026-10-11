import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { formatConflictDayShort, sectionFreshness } from '@/lib/conflict-calendar';
import { NAI_POSTURE_HEADING, NAI_V2_EMPTY_TEXT, getNaiV2Day, getNaiV2DayRange, postureLabel } from '@/lib/nai-v2';

/**
 * Server-rendered: largest |Δ expressed| in nai_scores_v2 (War Posture) between its latest day
 * and the previous War Posture day present. Reads ONLY nai_scores_v2 — legacy nai_scores
 * (Days 1-35, retired method) is never presented as current.
 *
 * The move is only called "TODAY" when the v2 day equals the calendar day; otherwise its
 * as-of day is stated explicitly. With no v2 rows it shows the honest empty state.
 */
export async function NaiBiggestMoveBanner() {
  const supabase = createPublicClient();
  const currentDay = await getConflictDay();
  const { latestDay: naiDay } = await getNaiV2DayRange(supabase);

  if (naiDay == null) {
    return (
      <div
        className="border border-white/10 px-4 py-3 font-mono text-xs mb-4 rounded-sm uppercase"
        style={{ color: 'var(--text-muted)' }}
        data-testid="nai-biggest-move"
        data-freshness="empty"
      >
        ◆ WAR POSTURE — {NAI_V2_EMPTY_TEXT}
      </div>
    );
  }

  // Expressed score only: it is visible to every tier, so no gated field is exposed here.
  const rows = await getNaiV2Day(supabase, naiDay, { latent: false, gap: false });
  const withDelta = rows.filter((r) => r.delta !== null);
  const fresh = sectionFreshness(naiDay, currentDay);
  const isToday = fresh.status === 'current';
  const staleNote = !isToday && (
    <div className="text-xs mt-1 uppercase" style={{ color: 'var(--accent-orange)' }} translate="no">
      ⚠ WAR POSTURE — Latest available: Day {naiDay} ({formatConflictDayShort(naiDay)}) — no data for Day {currentDay}
    </div>
  );

  if (withDelta.length === 0) {
    return (
      <div
        className="border border-white/10 px-4 py-3 font-mono text-xs mb-4 rounded-sm"
        style={{ color: 'var(--text-muted)' }}
        data-testid="nai-biggest-move"
        data-freshness={fresh.status}
      >
        ◆ WAR POSTURE — DAY {naiDay}: {rows.length} countries scored; no earlier War Posture day to compare yet.
        {staleNote}
      </div>
    );
  }

  const biggest = [...withDelta].sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0];
  const d = biggest.delta ?? 0;
  if (Math.abs(d) < 5) return null;

  return (
    <div
      className="border border-[#E8C547]/40 bg-[#E8C547]/5 px-4 py-3 font-mono text-sm mb-4 rounded-sm"
      data-testid="nai-biggest-move"
      data-freshness={fresh.status}
    >
      <span className="text-[#E8C547]">
        {isToday ? '◆ BIGGEST WAR POSTURE MOVE TODAY:' : `◆ BIGGEST WAR POSTURE MOVE — DAY ${naiDay}:`}
      </span>
      <span className="text-white ml-2">
        <span translate="no">{biggest.country_code}</span>{' '}
        <span translate="no">
          {d > 0 ? '↑' : '↓'}
          {Math.abs(d)} points {d > 0 ? 'toward continuing hostilities' : 'toward ceasefire'}
        </span>
        <span translate="no">
          {' '}
          · Expressed {biggest.expressed_score}
          {postureLabel(biggest.expressed_score) !== null &&
            ` · ${NAI_POSTURE_HEADING}: ${postureLabel(biggest.expressed_score)}`}
          {' '}(vs Day {biggest.prevDay})
        </span>
      </span>
      {staleNote}
    </div>
  );
}
