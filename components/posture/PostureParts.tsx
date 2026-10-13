/**
 * War Posture v2 building blocks. No hooks — safe in Server and Client Components. Do not nest the
 * evidence / ledger parts inside <a> or <button> (they render links).
 *
 * Visual rules: the colour is only a swatch (text stays in theme tokens); blue → grey → orange scale,
 * no red/green; deliberate silence is hatched; stated-positions-only countries get an outline and
 * never a colour.
 */
import type { CSSProperties, ReactNode } from 'react';
import {
  POSTURE_DEFENSIVE_TEXT,
  POSTURE_LABELS,
  POSTURE_NODATA_COLOR,
  POSTURE_SILENCE_COLOR,
  POSTURE_UNCODED_TEXT,
  POSTURE_WITHHELD_TEXT,
  POSTURE_WITHHELD_TITLE,
  ageLine,
  postureActorLineLabel,
  postureLabelDef,
  shortDate,
  v1FrozenText,
  v2UncodedNote,
  type PostureEvidenceView,
  type PostureView,
} from '@/lib/posture';
import type { NaiSourceV2 } from '@/types/supabase';

const HATCH = `repeating-linear-gradient(45deg, ${POSTURE_SILENCE_COLOR} 0 2px, transparent 2px 5px)`;

export function PostureSwatch({ row, size = 10 }: { row: Pick<PostureView, 'stance' | 'label'>; size?: number }) {
  const base: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    border: '1px solid #8A9BB5',
    flexShrink: 0,
  };
  if (row.stance === 'withheld') return <span aria-hidden="true" style={{ ...base, background: 'transparent', borderStyle: 'dashed' }} />;
  if (row.stance === 'deliberate_silence') return <span aria-hidden="true" style={{ ...base, background: HATCH }} />;
  const def = row.stance === 'position' ? postureLabelDef(row.label) : null;
  return <span aria-hidden="true" style={{ ...base, background: def?.color ?? POSTURE_NODATA_COLOR }} />;
}

export function stanceText(row: Pick<PostureView, 'stance' | 'label' | 'method'>): string {
  switch (row.stance) {
    case 'position':
      return postureLabelDef(row.label)?.text ?? 'Position on record';
    case 'deliberate_silence':
      return 'Deliberate silence';
    case 'nulled':
      return 'Position withdrawn (correction)';
    case 'withheld':
      return POSTURE_WITHHELD_TITLE;
    default:
      return row.method === 'war-posture-v1' ? 'No position coded this day' : POSTURE_UNCODED_TEXT;
  }
}

/**
 * Which authority a line scores, on a dual-actor country only (Yemen): "Government (PLC)" or
 * "Ansar Allah (Houthi), de facto authority". Renders nothing for an ordinary (government-only) country.
 */
export function PostureActorTag({
  row,
  className = '',
}: {
  row: Pick<PostureView, 'country_code' | 'actor' | 'actor_display_name'>;
  className?: string;
}) {
  const label = postureActorLineLabel(row);
  if (!label) return null;
  return (
    <span
      className={`font-mono text-[11px] uppercase ${className}`}
      style={{ color: 'var(--text-secondary)' }}
      data-testid="posture-actor"
      data-actor={row.actor}
      title={row.actor_display_name ?? undefined}
      translate="no"
    >
      {label}
    </span>
  );
}

/** Label chip: swatch + neutral behavioural label (+ defensive flag). */
export function PostureChip({ row, className = '' }: { row: PostureView; className?: string }) {
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 font-mono text-[11px] ${className}`}
      data-posture-stance={row.stance}
      data-posture-label={row.label ?? undefined}
      translate="no"
    >
      <PostureSwatch row={row} />
      <span style={{ color: 'var(--text-secondary)' }}>{stanceText(row)}</span>
      {row.defensive && (
        <span style={{ color: 'var(--text-muted)' }} title="The government justifies this position by attacks on its own territory">
          · defensive ({POSTURE_DEFENSIVE_TEXT})
        </span>
      )}
    </span>
  );
}

/**
 * Marker for a War Posture v1 row on a v2 board: "War Posture v1 — frozen, Day 224" (own day), plus
 * "War Posture v2: Statement captured, not yet coded" when a v2 statement awaits coding.
 */
export function V1FrozenTag({ row, className = '' }: { row: Pick<PostureView, 'score_day' | 'v2UncodedConflicts'>; className?: string }) {
  const note = v2UncodedNote(row);
  return (
    <span
      className={`font-mono text-[11px] ${className}`}
      style={{ color: 'var(--text-muted)' }}
      data-testid="posture-v1-frozen"
      title="Last score under the old method (one blended number across wars). No longer updated, and never counted as a change."
      translate="no"
    >
      <span className="uppercase">{v1FrozenText(row)}</span>
      {note && <span data-testid="posture-v2-uncoded-note"> · {note}</span>}
    </span>
  );
}

/** "captured 6 Oct · confidence decaying · confidence now MEDIUM (was HIGH)". */
export function PostureAge({ row, className = '' }: { row: PostureView; className?: string }) {
  const line = ageLine(row);
  if (!line && !row.confidence_now) return null;
  const decayed = row.confidence_now && row.confidence_base && row.confidence_now !== row.confidence_base;
  return (
    <span className={`font-mono text-[11px] ${className}`} style={{ color: 'var(--text-muted)' }} data-testid="posture-age" data-freshness={row.freshness ?? undefined}>
      {line}
      {row.confidence_now && (
        <>
          {line ? ' · ' : ''}confidence {row.confidence_now.toUpperCase()}
          {decayed ? ` (was ${row.confidence_base!.toUpperCase()})` : ''}
        </>
      )}
    </span>
  );
}

export function PostureScaleLegend({ compact = false, showWithheld = true }: { compact?: boolean; showWithheld?: boolean }) {
  const item = (swatch: ReactNode, text: string, key: string) => (
    <span key={key} className="inline-flex items-center gap-1" translate="no">
      {swatch}
      {text}
    </span>
  );
  return (
    <div className={`font-mono text-[10px] flex ${compact ? 'flex-wrap gap-x-3 gap-y-1' : 'flex-col gap-0.5'}`} data-testid="posture-legend">
      {POSTURE_LABELS.map((l) =>
        item(<PostureSwatch row={{ stance: 'position', label: l.code }} />, `${l.text} (${l.min}–${l.max})`, l.code),
      )}
      {item(<PostureSwatch row={{ stance: 'deliberate_silence', label: null }} />, 'Deliberate silence', 'silence')}
      {showWithheld && item(<PostureSwatch row={{ stance: 'withheld', label: null }} />, `${POSTURE_WITHHELD_TITLE} (EG, AE, SA)`, 'withheld')}
      {item(<PostureSwatch row={{ stance: 'uncoded', label: null }} />, 'No position on record', 'none')}
    </div>
  );
}

const ACT_TEXT: Record<string, string> = {
  deployment: 'Deployment',
  basing_or_overflight: 'Basing / overflight',
  interception: 'Interception',
  strike: 'Strike',
  un_vote: 'UN vote',
  sanctions: 'Sanctions',
  talks_hosted: 'Talks hosted',
  seizure: 'Seizure',
  other: 'Act',
};

/** One captured statement / act / silence trigger with its date, speaker and links. */
export function EvidenceQuote({ e, compact = false }: { e: PostureEvidenceView; compact?: boolean }) {
  const stated = shortDate(e.stated_at);
  const captured = shortDate(e.captured_at);
  const kindTag = e.kind === 'act' ? (ACT_TEXT[e.act_type ?? 'other'] ?? 'Act') : e.kind === 'silence_trigger' ? 'Unanswered trigger' : 'Statement';
  return (
    <figure className="m-0" data-testid="posture-evidence" data-kind={e.kind}>
      <p className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }} translate="no">
        {kindTag}
        {stated ? ` · ${stated}` : ''}
        {captured && captured !== stated ? ` · captured ${captured}` : ''}
        {e.actor === 'de_facto_authority' ? ' · de facto authority' : ''}
        {e.party_source ? ' · party / state source' : ''}
      </p>
      <blockquote
        className="m-0 pl-3 text-sm leading-relaxed"
        style={{ borderLeft: '2px solid var(--border-bright, #3A4458)', color: 'var(--text-primary)' }}
      >
        {e.kind === 'statement' ? <>&ldquo;{compact && e.quote.length > 220 ? `${e.quote.slice(0, 217)}…` : e.quote}&rdquo;</> : compact && e.quote.length > 220 ? `${e.quote.slice(0, 217)}…` : e.quote}
      </blockquote>
      <figcaption className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {(e.speaker || e.speaker_office) && (
          <span style={{ color: 'var(--text-secondary)' }}>
            {e.speaker}
            {e.speaker && e.speaker_office ? ', ' : ''}
            {e.speaker_office}
            {' · '}
          </span>
        )}
        <a href={e.source_url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-gold)' }}>
          source
        </a>
        {e.archive_url && (
          <>
            {' · '}
            <a href={e.archive_url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-gold)' }}>
              archived copy
            </a>
          </>
        )}
        {!compact && e.page_sha256 && (
          <span title={`SHA-256 of the page as captured: ${e.page_sha256}`} translate="no">
            {' · '}sha256 {e.page_sha256.slice(0, 10)}…
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** v1 cited reporting (outlet summaries — explicitly NOT verbatim quotes). */
export function CitedReporting({ sources, compact = false }: { sources: NaiSourceV2[]; compact?: boolean }) {
  if (sources.length === 0) return null;
  const list = compact ? sources.slice(0, 2) : sources;
  return (
    <div className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }} data-testid="posture-cited">
      <p className="uppercase text-[10px] tracking-wide">Reporting cited by the desk (summaries, not verbatim quotes)</p>
      <ul className="mt-1 space-y-1">
        {list.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-gold)' }}>
              {s.name}
            </a>
            {s.party_source && <span className="ml-1 uppercase" style={{ color: 'var(--accent-orange)' }}>(party source)</span>}
            {s.published_at && <span> · {shortDate(s.published_at) ?? s.published_at}</span>}
            {s.claim && <span className="block" style={{ color: 'var(--text-secondary)' }}>{s.claim}</span>}
          </li>
        ))}
      </ul>
      {compact && sources.length > list.length && <p className="mt-1">+{sources.length - list.length} more on the country page</p>}
    </div>
  );
}

/**
 * Stated-positions ledger: the verbatim statements, behavioural acts and unanswered triggers captured
 * for a country (posture_evidence), newest first. For EG / AE / SA this is the whole War Posture view.
 */
export function PositionsLedger({
  ledger,
  conflictName,
  cited = [],
  withheld,
  limit = 8,
}: {
  ledger: PostureEvidenceView[];
  conflictName: (code: string | null) => string;
  cited?: NaiSourceV2[];
  withheld: boolean;
  limit?: number;
}) {
  const statements = ledger.filter((e) => e.kind !== 'act').slice(0, limit);
  const acts = ledger.filter((e) => e.kind === 'act').slice(0, limit);
  return (
    <div className="space-y-4" data-testid="positions-ledger">
      {withheld && (
        <p className="font-mono text-[11px] leading-relaxed border px-3 py-2" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} data-testid="posture-policy-note">
          {POSTURE_WITHHELD_TEXT}
        </p>
      )}
      <section aria-label="Stated positions">
        <h3 className="font-mono text-[11px] uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
          Stated positions (verbatim)
        </h3>
        {statements.length === 0 ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="ledger-empty">
            No verbatim statement has been captured into the evidence ledger yet. Nothing is paraphrased in its place.
          </p>
        ) : (
          <ul className="space-y-3">
            {statements.map((e, i) => (
              <li key={e.id ?? `${e.source_url}-${i}`}>
                <p className="font-mono text-[10px] uppercase mb-0.5" style={{ color: 'var(--text-muted)' }} translate="no">
                  {conflictName(e.conflict_code)}
                </p>
                <EvidenceQuote e={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Behavioural acts">
        <h3 className="font-mono text-[11px] uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
          Behavioural acts (deployments, basing, votes)
        </h3>
        {acts.length === 0 ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            No act recorded yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {acts.map((e, i) => (
              <li key={e.id ?? `${e.source_url}-${i}`}>
                <p className="font-mono text-[10px] uppercase mb-0.5" style={{ color: 'var(--text-muted)' }} translate="no">
                  {conflictName(e.conflict_code)}
                </p>
                <EvidenceQuote e={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {cited.length > 0 && <CitedReporting sources={cited} />}
    </div>
  );
}
