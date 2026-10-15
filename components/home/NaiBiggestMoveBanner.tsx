import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { formatConflictDayShort, sectionFreshness } from '@/lib/conflict-calendar';
import { TRACKED_COUNTRY_NAMES } from '@/lib/country-names';
import { PostureSwatch } from '@/components/ui/PostureSwatch';
import { conflictName, getPostureBoard, isV1Fallback, postureLabelDef, postureLineLabel, postureMoves } from '@/lib/posture';

/**
 * Home tile: War Posture "biggest move" — ONLY a change that rests on NEW evidence (posture_scores
 * change_reason = 'new_evidence'), never a re-verification or method artefact (War Posture v2 rule 5).
 *
 * Before v2 rows exist the board is the v1 table, which re-opens its sources daily: its day-to-day
 * differences can be artefacts, so no move is claimed — the tile states what is on record instead.
 * Expressed side only (visible to every tier); EG / AE / SA never appear as a move (no grade).
 * On a v2 board, countries not yet re-coded keep a frozen v1 row: counted separately, never a move.
 */
export async function NaiBiggestMoveBanner() {
  const supabase = createPublicClient();
  const currentDay = await getConflictDay();
  const board = await getPostureBoard(supabase, { access: { latent: false, gap: false } });
  const box = 'border border-border px-4 py-3 text-[13px] mb-4 rounded-sm';

  if (board.rows.length === 0) {
    return (
      <div className={`${box} uppercase`} style={{ color: 'var(--text-muted)' }} data-testid="nai-biggest-move" data-freshness="empty">
        ◆ WAR POSTURE — no government position captured yet
      </div>
    );
  }

  const positions = board.rows.filter((r) => r.stance === 'position');
  const countries = new Set(positions.map((r) => r.country_code)).size;

  if (board.schema === 'v1') {
    const fresh = sectionFreshness(board.latestDay ?? currentDay, currentDay);
    return (
      <div className={box} style={{ color: 'var(--text-muted)' }} data-testid="nai-biggest-move" data-freshness={fresh.status} data-schema="v1">
        ◆ WAR POSTURE — DAY {board.latestDay}: {countries} governments with a sourced position on record.{' '}
        Moves are flagged only when they rest on newly captured evidence; the current series re-checks its sources daily, so
        its day-to-day differences are not shown as moves.
        {fresh.status !== 'current' && board.latestDay != null && (
          <div className="mt-1 uppercase" style={{ color: 'var(--status-unknown)' }} translate="no">
            Latest available: Day {board.latestDay} ({formatConflictDayShort(board.latestDay)}) — no data for Day {currentDay}
          </div>
        )}
      </div>
    );
  }

  const moves = postureMoves(board);
  if (moves.length === 0) {
    const v2Positions = positions.filter((r) => !isV1Fallback(board, r));
    const v2Countries = new Set(v2Positions.map((r) => r.country_code)).size;
    // Only frozen v1 rows that carry a number ("shows its last score under the old method" must be true of each one).
    const frozen = new Set(board.rows.filter((r) => isV1Fallback(board, r) && r.expressed_score !== null).map((r) => r.country_code)).size;
    return (
      <div className={box} style={{ color: 'var(--text-muted)' }} data-testid="nai-biggest-move" data-freshness="current" data-schema="v2">
        ◆ WAR POSTURE — DAY {board.day}: {v2Positions.length} positions on record across {v2Countries} governments; no position
        changed on new evidence in the last two days.
        {frozen > 0
          ? ` ${frozen} more ${frozen === 1 ? 'government shows its' : 'governments show their'} last score under the old method, no longer updated.`
          : ''}
      </div>
    );
  }
  const { row, delta } = moves[0];
  // "Yemen — Ansar Allah (Houthi), de facto authority": each of Yemen's two lines moves on its own.
  const name = postureLineLabel(row, TRACKED_COUNTRY_NAMES[row.country_code] ?? row.country_code);
  return (
    <div className="border border-border bg-bg-card px-4 py-3 text-sm mb-4 rounded-sm" data-testid="nai-biggest-move" data-freshness="current" data-schema="v2">
      <span style={{ color: 'var(--accent-gold)' }}>◆ WAR POSTURE — CHANGED ON NEW EVIDENCE (DAY {row.score_day}):</span>
      <span className="ms-2" style={{ color: 'var(--text-primary)' }}>
        <PostureSwatch score={row.expressed_score} countryCode={row.country_code} showNumber={false} className="me-1 align-middle" />
        <span translate="no">{name}</span> on {conflictName(board.conflicts, row.conflict_code)}:{' '}
        {postureLabelDef(row.previous_label)?.text ?? row.previous_score} → {postureLabelDef(row.label)?.text ?? row.expressed_score}{' '}
        <span translate="no">
          ({row.previous_score} → {row.expressed_score}, {delta > 0 ? 'toward continuing hostilities' : 'toward ceasefire'})
        </span>
        {row.defensive ? ' · defensive' : ''}
      </span>
    </div>
  );
}
