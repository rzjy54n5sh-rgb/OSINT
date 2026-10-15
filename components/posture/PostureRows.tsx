/**
 * War Posture board v2 rows (artboard Posture.dc.html, items 12–16): position card, frozen v1 card, the
 * per-card Details disclosure (R5), the Yemen two-line panel and the stated-positions-only panel (R9).
 * No hooks. Every word, number and quote is a field of a PostureView; copy around them is fixed text.
 */
import Link from 'next/link';
import { PostureSwatch } from '@/components/ui/PostureSwatch';
import { TrustChip } from '@/components/ui/TrustChip';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { stanceText } from '@/components/posture/PostureParts';
import { LOCKED_TEXT } from '@/lib/access-cta';
import { formatBand, formatGap } from '@/lib/nai-v2';
import {
  FRESHNESS_TEXT,
  POSTURE_DEFENSIVE_TEXT,
  POSTURE_UNCODED_TEXT,
  POSTURE_WITHHELD_TITLE,
  ageLine,
  dayToIsoDate,
  v2UncodedNote,
  type PostureEvidenceView,
  type PostureView,
} from '@/lib/posture';
import {
  basisClip,
  isShownPosition,
  isShownV1,
  longDate,
  rowBand,
  rowName,
  sourceLabel,
  type SourceLabels,
  type StatedBlock,
  type YemenLine,
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

/** R5: latent band, gap and category, with today's gating unchanged (locked = paywall / locked text). */
export function PostureDetails({ row }: { row: PostureView }) {
  const age = ageLine(row);
  return (
    <details className={s.details}>
      <summary>Details</summary>
      <dl className={s.dl}>
        {age ? (
          <>
            <dt>Evidence</dt>
            <dd>{age}</dd>
          </>
        ) : null}
        {row.confidence_base && row.confidence_now && row.confidence_base !== row.confidence_now ? (
          <>
            <dt>Confidence</dt>
            <dd>
              {cap(row.confidence_now)} now (was {row.confidence_base})
            </dd>
          </>
        ) : null}
        <dt>Society (band)</dt>
        <dd className={s.num}>
          {row.latentLocked ? (
            <PaywallOverlay requiredTier="informed" featureName="War Posture latent band" compact />
          ) : row.latent_low === null ? (
            '— (no admissible evidence)'
          ) : (
            formatBand(row.latent_low, row.latent_high)
          )}
        </dd>
        {row.latent_basis ? (
          <>
            <dt>Basis</dt>
            <dd>{row.latent_basis}</dd>
          </>
        ) : null}
        <dt>Gap</dt>
        <dd className={s.num}>{row.gapLocked ? LOCKED_TEXT : formatGap(row.gap)}</dd>
        {row.category ? (
          <>
            <dt>Category</dt>
            <dd className={s.num}>{row.category}</dd>
          </>
        ) : null}
      </dl>
      <Link prefetch={false} href={`/countries/${row.country_code.toLowerCase()}`}>
        Country page: all fronts and the evidence ledger
      </Link>
    </details>
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
      <PostureDetails row={row} />
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

/** A frozen War Posture v1 row (old method): dashed, never ranked with v2, own day, desk basis clipped. */
export function V1Card({ row }: { row: PostureView }) {
  if (!isShownV1(row)) return null;
  const day = row.score_day;
  const note = v2UncodedNote(row);
  return (
    <li className={s.card} data-testid="posture-v1-row" data-country={row.country_code} data-actor={row.actor}>
      <div className={s.v1Body}>
        <div className={s.cardHead}>
          <span className={s.name}>{rowName(row)}</span>
          <span className={s.stance}>
            <PostureSwatch score={row.expressed_score} countryCode={row.country_code} label={stanceText(row)} />
            {row.confidence_base ? <span className={s.conf}>{cap(row.confidence_base)} confidence (at scoring)</span> : null}
          </span>
        </div>
        {row.expressed_basis ? <p className={s.basis}>{basisClip(row.expressed_basis)}</p> : null}
        <span className={`${s.meta} ${s.num}`}>
          Desk basis{day != null ? `, Day ${day} (${longDate(dayToIsoDate(day))})` : ''} · method v1
          {note ? ` · ${note}` : ''}
        </span>
      </div>
      <PostureDetails row={row} />
    </li>
  );
}

/** Yemen: two authorities, two separate lines (posture_actors), never merged, summed or averaged. */
export function YemenPanel({ lines, labels, day, v1 = false }: { lines: YemenLine[]; labels: SourceLabels; day: number | null; v1?: boolean }) {
  return (
    <section className={`${s.panel} ${v1 ? s.v1 : ''}`} aria-labelledby={v1 ? 'ye-h-v1' : 'ye-h'} data-testid="posture-yemen">
      <div className={s.panelHead}>
        <h3 id={v1 ? 'ye-h-v1' : 'ye-h'} className={s.h3}>
          Yemen · two authorities, two lines
        </h3>
        <span className={s.meta}>Never averaged</span>
      </div>
      <ul className={s.cards}>
        {lines.map((l) =>
          l.row && isShownPosition(l.row) ? (
            <PositionCard key={l.actor} row={l.row} labels={labels} />
          ) : l.row && isShownV1(l.row) ? (
            <V1Card key={l.actor} row={l.row} />
          ) : (
            <li key={l.actor} className={s.block} data-testid="posture-yemen-line" data-actor={l.actor}>
              <span className={s.blockName}>{l.name}</span>
              <span className={s.text2}>
                {l.row && l.row.stance === 'uncoded'
                  ? `${POSTURE_UNCODED_TEXT}: no position is shown until it is coded.`
                  : l.row && (l.row.stance === 'deliberate_silence' || l.row.stance === 'nulled')
                    ? stanceText(l.row)
                    : `No position on record${v1 ? ' under the old method' : ''}${day != null ? ` for Day ${day}` : ''}.`}
              </span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

/** R9: Egypt, Saudi Arabia, UAE — words only. No score, band, fill or rank, whatever the data holds. */
export function StatedPanel({ blocks, labels }: { blocks: StatedBlock[]; labels: SourceLabels }) {
  return (
    <section className={s.panel} aria-labelledby="stated-h" data-testid="posture-stated">
      <div className={s.panelHead}>
        <h3 id="stated-h" className={s.h3}>
          {POSTURE_WITHHELD_TITLE}
        </h3>
        <span className={s.meta}>{blocks.map((b) => b.name).join(' · ')}: no score, band or rank</span>
      </div>
      <ul className={s.cards}>
        {blocks.map((b) => (
          <li key={b.code} className={s.block} data-testid="posture-stated-country" data-country={b.code} data-no-grade="true">
            <span className={s.blockName}>{b.name}</span>
            <PostureSwatch score={null} countryCode={b.code} />
            {b.evidence.length > 0 ? (
              b.evidence.map((e, i) => <Quote key={e.id ?? i} e={e} labels={labels} />)
            ) : (
              <span className={s.text2}>No statement on record for this front.</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
