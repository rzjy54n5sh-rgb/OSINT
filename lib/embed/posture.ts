/**
 * /embed/posture?conflict=<code> — the War Posture board rows for ONE conflict, built from the same board the
 * /nai page renders (lib/posture.ts getPostureBoard, anonymous access: expressed side only). Rules carried
 * over from the board, never re-decided here:
 *   - v2 board: rows whose group (postureGroupCode) is the conflict; frozen War Posture v1 rows are never
 *     filed under a real war (counted, pointed to the full board). v1 board: every row, labelled blended
 *     (the /nai map does the same).
 *   - EG / AE / SA: never a grade. The row reads "Stated positions only" with no number, re-checked here
 *     with isPostureWithheld() whatever the row claims (defence in depth, same as fromV2Row / fromV1View).
 *   - Yemen: two separate lines (government / de facto authority, POSTURE_ACTORS), never merged; a line
 *     with no row on this conflict is shown as "No position captured on this conflict", no number.
 */
import {
  POSTURE_ACTORS,
  POSTURE_DEFAULT_ACTOR,
  POSTURE_WITHHELD_TITLE,
  isDualActorCountry,
  isPostureWithheld,
  isV1Fallback,
  postureGroupCode,
  postureLineLabel,
  postureRowKey,
  stanceText,
  type PostureActor,
  type PostureBoard,
  type PostureView,
} from '@/lib/posture';
import { embedPage, esc } from '@/lib/embed/html';

export const NO_LINE_TEXT = 'No position captured on this conflict';

export interface PostureEmbedLine {
  key: string;
  label: string;
  actor: PostureActor;
  stanceText: string;
  /** Expressed score 0–100; null for withheld countries, silence, uncoded, missing lines. */
  score: number | null;
  withheld: boolean;
  frozenV1: boolean;
  scoreDay: number | null;
}

export interface PostureEmbed {
  conflictCode: string;
  conflictName: string;
  schema: 'v1' | 'v2';
  day: number | null;
  /** v1 board: one blended number per country across wars. */
  blended: boolean;
  lines: PostureEmbedLine[];
  /** v2 board: governments not yet re-coded (frozen v1 rows), shown only on the full board. */
  frozenV1Count: number;
}

/** A known conflict code on this board (registry or fallback). */
export function isKnownConflict(board: Pick<PostureBoard, 'conflicts'>, code: string): boolean {
  return board.conflicts.some((c) => c.conflict_code === code);
}

const rank = (l: PostureEmbedLine, r: PostureView | null): number =>
  !r ? 4 : r.stance === 'position' && !l.withheld ? 0 : r.stance === 'deliberate_silence' ? 1 : l.withheld ? 2 : 3;

function lineFromRow(board: PostureBoard, r: PostureView): PostureEmbedLine {
  const withheld = r.withheld || r.stance === 'withheld' || isPostureWithheld(r.country_code);
  return {
    key: postureRowKey(r),
    label: postureLineLabel(r),
    actor: r.actor,
    stanceText: withheld ? POSTURE_WITHHELD_TITLE : stanceText(r),
    score: withheld || r.stance !== 'position' ? null : r.expressed_score,
    withheld,
    frozenV1: isV1Fallback(board, r),
    scoreDay: withheld ? null : r.score_day,
  };
}

export function postureEmbedView(board: PostureBoard, conflictCode: string): PostureEmbed {
  const blended = board.schema === 'v1';
  const rows = board.rows.filter((r) => (blended ? true : postureGroupCode(board, r) === conflictCode));
  const entries: { line: PostureEmbedLine; row: PostureView | null }[] = rows.map((r) => ({ line: lineFromRow(board, r), row: r }));

  // Yemen (any dual-actor country) present on this view: both lines, the missing one as an explicit gap.
  const dualCodes = [...new Set(rows.filter((r) => isDualActorCountry(r.country_code)).map((r) => r.country_code))];
  for (const cc of dualCodes) {
    for (const def of POSTURE_ACTORS.filter((a) => a.country_code === cc)) {
      if (rows.some((r) => r.country_code === cc && r.actor === def.actor)) continue;
      const stub = { country_code: cc, actor: def.actor, actor_display_name: def.display_name };
      entries.push({
        row: null,
        line: {
          key: `${cc}|${conflictCode}|${def.actor}`,
          label: postureLineLabel(stub),
          actor: def.actor,
          stanceText: NO_LINE_TEXT,
          score: null,
          withheld: false,
          frozenV1: false,
          scoreDay: null,
        },
      });
    }
  }

  entries.sort(
    (a, b) =>
      rank(a.line, a.row) - rank(b.line, b.row) ||
      (b.line.score ?? -1) - (a.line.score ?? -1) ||
      a.line.key.localeCompare(b.line.key) ||
      Number(a.line.actor !== POSTURE_DEFAULT_ACTOR) - Number(b.line.actor !== POSTURE_DEFAULT_ACTOR),
  );

  const conflict = board.conflicts.find((c) => c.conflict_code === conflictCode);
  return {
    conflictCode,
    conflictName: conflict?.short_name ?? conflictCode,
    schema: board.schema,
    day: board.day,
    blended,
    lines: entries.map((e) => e.line),
    frozenV1Count: blended ? 0 : board.rows.filter((r) => isV1Fallback(board, r)).length,
  };
}

/** Full widget document. */
export function renderPostureEmbed(v: PostureEmbed): string {
  const fullPath = '/nai';
  const fullLabel = 'War Posture board';
  const head =
    `<p class="k">War Posture · ${esc(v.conflictName)}</p>` +
    `<p class="meta">0 = immediate ceasefire · 100 = continue or escalate${v.day != null ? ` · Day ${esc(v.day)}` : ''}</p>`;
  if (v.lines.length === 0) {
    return embedPage({
      title: `War Posture — ${v.conflictName}`,
      fullPath,
      fullLabel,
      body: `${head}<p class="note">No War Posture lines are available for this conflict right now.</p>`,
    });
  }
  const rows = v.lines
    .map(
      (l) =>
        '<tr>' +
        `<td>${esc(l.label)}</td>` +
        `<td${l.withheld || l.score == null ? ' class="wh"' : ''}>${esc(l.stanceText)}${l.frozenV1 && l.scoreDay != null ? `<span class="sub">War Posture v1 — frozen, Day ${esc(l.scoreDay)}</span>` : ''}</td>` +
        `<td class="num">${l.score == null ? '—' : esc(Math.round(l.score))}</td>` +
        '</tr>',
    )
    .join('');
  const notes: string[] = [];
  if (v.blended) notes.push('War Posture v1: one blended number per country across the wars it was scored on, not yet per conflict.');
  if (v.lines.some((l) => l.withheld)) notes.push(`${POSTURE_WITHHELD_TITLE} (Egypt, UAE, Saudi Arabia): editorial policy, no grade is published; their statements are on the full board.`);
  if (v.frozenV1Count > 0) notes.push(`${v.frozenV1Count} government(s) not yet re-coded per conflict are listed on the full board.`);
  const body =
    head +
    '<div class="data"><table><thead><tr><th>Government</th><th>Stated position</th><th>Score</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>` +
    notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
  return embedPage({ title: `War Posture — ${v.conflictName}`, body, fullPath, fullLabel, credit: 'Sources for every line are on the full board' });
}
