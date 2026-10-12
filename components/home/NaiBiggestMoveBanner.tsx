import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { formatConflictDayShort, sectionFreshness } from '@/lib/conflict-calendar';
import { TRACKED_COUNTRY_NAMES } from '@/lib/country-names';
import { conflictName, getPostureBoard, isV1Fallback, postureLabelDef, postureMoves } from '@/lib/posture';

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
  const box = 'border border-white/10 px-4 py-3 font-mono text-xs mb-4 rounded-sm';

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
          <div className="text-xs mt-1 uppercase" style={{ color: 'var(--accent-orange)' }} translate="no">
            ⚠ Latest available: Day {board.latestDay} ({formatConflictDayShort(board.latestDay)}) — no data for Day {currentDay}
          </div>
        )}
      </div>
    );
  }

  const moves = postureMoves(board);
  if (moves.length === 0) {
    const v2Positions = positions.filter((r) => !isV1Fallback(board, r));
    const v2Countries = new Set(v2Positions.map((r) => r.country_code)).size;
    const frozen = new Set(board.rows.filter((r) => isV1Fallback(board, r)).map((r) => r.country_code)).size;
    return (
      <div className={box} style={{ color: 'var(--text-muted)' }} data-testid="nai-biggest-move" data-freshness="current" data-schema="v2">
        ◆ WAR POSTURE — DAY {board.day}: {v2Positions.length} positions on record across {v2Countries} governments; no position
        changed on new evidence in the last two days.
        {frozen > 0 ? ` ${frozen} more ${frozen === 1 ? 'government shows' : 'governments show'} a frozen method-v1 number until re-coded.` : ''}
      </div>
    );
  }
  const { row, delta } = moves[0];
  const name = TRACKED_COUNTRY_NAMES[row.country_code] ?? row.country_code;
  return (
    <div className="border border-[#F0AE6B]/40 bg-[#F0AE6B]/5 px-4 py-3 font-mono text-sm mb-4 rounded-sm" data-testid="nai-biggest-move" data-freshness="current" data-schema="v2">
      <span style={{ color: '#F0AE6B' }}>◆ WAR POSTURE — CHANGED ON NEW EVIDENCE (DAY {row.score_day}):</span>
      <span className="ml-2" style={{ color: 'var(--text-primary)' }}>
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
