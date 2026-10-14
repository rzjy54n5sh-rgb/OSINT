/**
 * War Posture board v2 rows (artboard Posture.dc.html, item 12): the position card and its source line.
 * No hooks. Every word, number and quote is a field of a PostureView; copy around them is fixed text.
 */
import { PostureSwatch } from '@/components/ui/PostureSwatch';
import { TrustChip } from '@/components/ui/TrustChip';
import { stanceText } from '@/components/posture/PostureParts';
import {
  FRESHNESS_TEXT,
  POSTURE_DEFENSIVE_TEXT,
  type PostureEvidenceView,
  type PostureView,
} from '@/lib/posture';
import {
  isShownPosition,
  longDate,
  rowBand,
  rowName,
  sourceLabel,
  type SourceLabels,
} from '@/lib/posture-board';
import s from './posture.module.css';

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** "speaker, office · 12 Oct 2026 · [outlet] [STATE/PARTY] · archived copy (only when one exists, R7)". */
export function SourceLine({ e, labels }: { e: PostureEvidenceView; labels: SourceLabels }) {
  const src = sourceLabel(e.source_url, labels, e.party_source);
  const date = longDate(e.stated_at ?? e.captured_at);
  return (
    <footer className={s.src}>
      {e.speaker || e.speaker_office ? <span>{[e.speaker, e.speaker_office].filter(Boolean).join(', ')}</span> : null}
      {date ? <span className={s.num}>{date}</span> : null}
      <a className={s.chipLink} href={e.source_url} target="_blank" rel="noopener noreferrer nofollow">
        <TrustChip kind="source" name={src.name} party={src.party} />
        <span className="chip-sr-only"> (source, opens in a new tab)</span>
      </a>
      {e.archive_url ? (
        <a href={e.archive_url} target="_blank" rel="noopener noreferrer nofollow">
          Archived copy
        </a>
      ) : null}
    </footer>
  );
}

function Quote({ e, labels }: { e: PostureEvidenceView; labels: SourceLabels }) {
  return (
    <blockquote className={s.quote}>
      <p>{e.kind === 'statement' ? `“${e.quote}”` : e.quote}</p>
      <SourceLine e={e} labels={labels} />
    </blockquote>
  );
}

function metaLine(r: PostureView): string {
  // Yemen's card name is already its posture_actors.display_name.
  const parts: string[] = r.country_code === 'YE' ? [] : ['Government'];
  if (r.previous_day == null) parts.push('first v2 coding');
  else if (r.change_reason === 'new_evidence' && r.previous_score != null) parts.push(`was ${r.previous_score} on Day ${r.previous_day}`);
  if (r.defensive) parts.push(`framed as defensive (${POSTURE_DEFENSIVE_TEXT})`);
  return parts.join(' · ');
}
function confLine(r: PostureView): string | null {
  const c = r.confidence_now ? `${cap(r.confidence_now)} confidence` : null;
  const f = r.freshness && r.freshness !== 'current' ? FRESHNESS_TEXT[r.freshness] : null;
  return [c, f].filter(Boolean).join(' · ') || null;
}

/** A coded method-v2 position: the only place a number, bar and band appear with a quote. */
export function PositionCard({ row, labels }: { row: PostureView; labels: SourceLabels }) {
  if (!isShownPosition(row) || !row.evidence) return null;
  const score = Math.round(row.expressed_score as number);
  const band = rowBand(row);
  return (
    <li className={s.card} data-testid="posture-card" data-country={row.country_code} data-actor={row.actor} data-band={band ?? undefined}>
      <div className={s.cardHead}>
        <div className={s.who}>
          <span className={s.name}>{rowName(row)}</span>
          <span className={s.meta}>{metaLine(row)}</span>
        </div>
        <div className={s.stance}>
          <PostureSwatch score={score} countryCode={row.country_code} showNumber={false} label={stanceText(row)} />
          {confLine(row) ? <span className={s.conf}>{confLine(row)}</span> : null}
        </div>
      </div>
      <div className={s.barRow}>
        <div className={s.bar} aria-hidden="true">
          <div className={s.fill} style={{ width: `${score}%` }} />
          <div className={s.tick} />
        </div>
        <span className={`${s.score} ${s.num}`}>
          <span className="chip-sr-only">Score </span>
          {score}
          <span className="chip-sr-only"> of 100</span>
        </span>
      </div>
      <Quote e={row.evidence} labels={labels} />
    </li>
  );
}

/** Coded but not a position (deliberate silence, withdrawn): words, no number. */
export function OtherCodedCard({ row, labels }: { row: PostureView; labels: SourceLabels }) {
  return (
    <li className={s.card} data-testid="posture-other" data-country={row.country_code} data-stance={row.stance}>
      <div className={s.cardHead}>
        <span className={s.name}>{rowName(row)}</span>
        <span className={s.stance}>{stanceText(row)}</span>
      </div>
      {row.evidence ? <Quote e={row.evidence} labels={labels} /> : null}
    </li>
  );
}
