import Link from 'next/link';
import { TrustChip } from '@/components/ui/TrustChip';
import { Icon } from '@/components/ui/icons';
import { collectBriefSources, paragraphSources, sourceLookupKey } from '@/lib/briefing-sources';
import { briefTypeMeta, briefTitle } from '@/lib/brief-types';
import { formatConflictDayDateGb } from '@/lib/conflict-calendar';
import { PRE_PUBLICATION_HUMAN_REVIEW } from '@/lib/desk-identity';
import { CORRECTION_CLASS_LABEL, formatUtc, type CorrectionRow } from '@/lib/trust-ledgers';
import { resolveParty, type OutletRegistry } from '@/lib/outlet-lookup';
import type { CorridorsView } from '@/lib/corridors';
import {
  chartLanes,
  citedChokepointEdition,
  citedMarketCollection,
  citingText,
  corridorFigures,
  marketFigures,
  parseCoverStats,
  type KeyFigure,
  type MarketRow,
} from '@/lib/brief-figures';
import { BriefChokepointFigure } from './BriefChokepointFigure';
import { BriefSectionView, SourcesList, sectionAnchors, sectionHeads, type BriefSection, type ShownSource } from './BriefSections';
import { ReadingProgress } from './ReadingProgress';
import s from './brief.module.css';

export interface BriefRow {
  id: string;
  conflict_day: number;
  report_type: string;
  title: string | null;
  lead: string | null;
  cover_stats: unknown;
  sections: unknown;
  provenance?: string | null;
  period_start_day?: number | null;
  period_end_day?: number | null;
}

export interface BriefReaderProps {
  briefing: BriefRow;
  day: number;
  type: string;
  /** Published corrections for this brief; null when the read failed (a neutral line is shown instead). */
  corrections?: CorrectionRow[] | null;
  registry?: OutletRegistry;
  /** Only the corridor view; the reader itself checks that the brief cites this edition. */
  corridors?: CorridorsView | null;
  /** market_data rows of the cited collection (read live by the page). */
  marketRows?: MarketRow[];
}

function CorrectionNotice({ c }: { c: CorrectionRow }) {
  return (
    <aside aria-label="Correction notice" className={s.correction} data-class={c.correction_class}>
      <div className={s.corrHead}>
        <span className={s.corrLabel}>CORRECTED · {CORRECTION_CLASS_LABEL[c.correction_class] ?? c.correction_class.toUpperCase()}</span>
        <time dateTime={c.created_at} className={`${s.num} ${s.muted}`}>
          {formatUtc(c.created_at)}
        </time>
      </div>
      <p className={s.corrText}>{c.summary}</p>
      <Link prefetch={false} href={`/corrections#${encodeURIComponent(c.id)}`}>
        See before and after in the corrections log
      </Link>
    </aside>
  );
}

function KeyFigures({ figures }: { figures: KeyFigure[] }) {
  return (
    <aside aria-labelledby="key-figures-h" className={s.figs} id="key-figures">
      <h2 id="key-figures-h" className={s.eyebrow}>
        Key figures in this brief
      </h2>
      <ul className={s.figList}>
        {figures.map((f) => (
          <li key={f.key} className={s.fig}>
            <span className={s.figValue}>{f.value}</span>
            <span className={s.figLabel}>{f.label}</span>
            {f.src != null || f.sub ? (
              <span className={s.figMeta}>
                {f.src != null ? (
                  <a href={`#src-${f.src}`} className={s.num}>
                    [{f.src}]
                  </a>
                ) : null}
                {f.src != null && f.sub ? ' ' : null}
                {f.sub ? <span>{f.sub}</span> : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Contents({ items }: { items: { id: string; label: string }[] }) {
  return (
    <ol className={s.tocList}>
      {items.map((it) => (
        <li key={it.id}>
          <a href={`#${it.id}`} data-toc={it.id} className={s.tocLink}>
            {it.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function BriefReader({ briefing, day, type, corrections = [], registry = new Map(), corridors = null, marketRows = [] }: BriefReaderProps) {
  const meta = briefTypeMeta(type);
  const sections: BriefSection[] = (Array.isArray(briefing.sections) ? briefing.sections : []).filter(
    (x): x is BriefSection => !!x && typeof x === 'object',
  );
  const anchors = sectionAnchors(sections);
  const collected = collectBriefSources(sections as never);
  const sources: ShownSource[] = collected.list.map((src) => ({ ...src, flag: resolveParty(src, registry) }));
  const byKey = new Map(sources.map((x) => [x.key, x]));

  // Chart + corridor figures only when the brief cites this exact Chokepoint Weekly edition.
  const cwCite = corridors ? citedChokepointEdition(collected.list, corridors) : null;
  // Only the lanes the citing paragraphs name: 2+ lanes = chart + figures, 1 = figure only, 0 = nothing.
  const cwLanes = cwCite && corridors ? chartLanes(corridors, citingText(sections as never, cwCite.key)) : [];
  const chartSection = cwCite && cwLanes.length >= 2
    ? sections.findIndex((sec) =>
        (Array.isArray(sec.subsections) ? sec.subsections : []).some((sub) =>
          (Array.isArray(sub?.paragraphs) ? sub.paragraphs : []).some((p) =>
            paragraphSources(p?.sources).some((x) => sourceLookupKey(x) === cwCite.key),
          ),
        ),
      )
    : -1;
  const mdCite = citedMarketCollection(sections as never, collected.list);
  const figures: KeyFigure[] = [
    ...(cwCite && corridors ? corridorFigures(corridors, cwCite, cwLanes) : []),
    ...parseCoverStats(briefing.cover_stats),
    ...(mdCite ? marketFigures(marketRows, mdCite) : []),
  ];

  const tocItems = sections.map((sec, i) => ({ id: anchors[i], label: (typeof sec.heading === 'string' && sec.heading.trim()) || sectionHeads(sec).h2 }));
  if (sources.length) tocItems.push({ id: 'sources', label: `Sources (${sources.length})` });

  const title = (typeof briefing.title === 'string' && briefing.title.trim()) || `Day ${day} ${briefTitle(type)}`;
  const lead = typeof briefing.lead === 'string' && briefing.lead.trim() ? briefing.lead : null;
  const period =
    type === 'general_weekly' && briefing.period_start_day != null && briefing.period_end_day != null
      ? `Days ${briefing.period_start_day}–${briefing.period_end_day}`
      : null;
  const metaLine = [meta?.title ?? briefTitle(type), `Day ${day}`, period, formatConflictDayDateGb(day)].filter(Boolean).join(' · ');
  const lineupNote =
    meta && (meta.formerTitle || meta.lineup === 'archive')
      ? `${meta.formerTitle ? `${meta.title}, formerly "${meta.formerTitle}". ` : ''}${
          meta.lineup === 'archive'
            ? 'Archived type: since the October 2026 line-up this coverage is in the Egypt & Gulf Economy brief. This edition is shown as published.'
            : meta.cadence === 'weekly'
              ? 'Weekly from October 2026; earlier daily editions are shown as published.'
              : ''
        }`
      : null;
  const reconstructed = briefing.provenance === 'reconstructed';

  return (
    <div className={s.reader} data-brief-root="">
      <ReadingProgress />
      <div className={s.layout}>
        <nav aria-label="Contents" className={s.toc}>
          <Link prefetch={false} href="/briefings" className={s.back}>
            ← All briefings
          </Link>
          <p className={s.eyebrow}>Contents</p>
          <Contents items={tocItems} />
        </nav>
        <div className={s.mobnav}>
          <Link prefetch={false} href="/briefings" className={s.back}>
            ← All briefings
          </Link>
          {tocItems.length ? (
            <details className={s.disclosure}>
              <summary>
                <span className={s.eyebrow}>Contents</span>
                <Icon name="chevron-down" />
              </summary>
              <nav aria-label="Contents">
                <Contents items={tocItems} />
              </nav>
            </details>
          ) : null}
        </div>

        <article className={s.article}>
          <div className={s.head}>
            <p className={s.meta}>{metaLine}</p>
            <h1 className={s.title}>{title}</h1>
            {lead ? <p className={s.standfirst}>{lead}</p> : null}
            {lineupNote ? (
              <p className={s.note} data-testid="brief-lineup-note">
                {lineupNote}
              </p>
            ) : null}
            {reconstructed ? (
              <div className={s.provenance} data-testid="brief-provenance">
                <TrustChip kind="method" label="Reconstructed" />
                <p className={s.note}>
                  Reconstructed after the fact: first written after 06:00 UTC on the day after Day {day}
                  {sources.length ? ', from sources dated as shown' : ''}.
                </p>
              </div>
            ) : null}
            <p className={s.byline} data-testid="ai-disclosure-line">
              <span>
                {PRE_PUBLICATION_HUMAN_REVIEW
                  ? 'Drafted with AI from linked public sources and reviewed by an editor before publication.'
                  : 'Drafted by an AI agent from linked public sources and published by the automated daily build.'}
              </span>
              <Link prefetch={false} href="/ai-disclosure">
                How we use AI
              </Link>
              <Link prefetch={false} href="/corrections">
                Corrections
              </Link>
            </p>
          </div>

          {corrections === null ? (
            <p className={s.note} data-testid="brief-corrections-unavailable">
              Correction status could not be checked just now; see the{' '}
              <Link prefetch={false} href="/corrections">
                corrections log
              </Link>
              .
            </p>
          ) : (
            corrections.map((c) => <CorrectionNotice key={c.id} c={c} />)
          )}

          {sections.map((sec, i) => (
            <BriefSectionView
              key={anchors[i]}
              sec={sec}
              anchor={anchors[i]}
              byKey={byKey}
              figure={i === chartSection && cwCite && corridors ? <BriefChokepointFigure view={corridors} lanes={cwLanes} sourceN={cwCite.n} /> : undefined}
            />
          ))}

          {type === 'business' || type === 'egypt_gulf_economy' ? (
            <p className={s.disclaimer}>Market and business content is analysis of public information, not investment advice.</p>
          ) : null}

          {sources.length ? (
            <SourcesList sources={sources} />
          ) : (
            <p className={s.note} data-testid="brief-no-sources">
              No source citations are recorded for this brief. Briefs published before Day 221, and reconstructed weekly
              digests, predate per-paragraph sourcing.
            </p>
          )}
        </article>

        {figures.length ? <KeyFigures figures={figures} /> : null}
      </div>
    </div>
  );
}

export default BriefReader;
