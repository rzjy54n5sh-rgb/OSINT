import Link from 'next/link';
import { fmtInt, fmtPct, getCorridors, type CorridorsView } from '@/lib/corridors';
import { IndexGauge, StaleNote, StatusChip } from './parts';
import s from './corridors.module.css';

/**
 * Compact three-lane strip for the home first screen (UX audit §6: "Is Hormuz / Bab el-Mandeb /
 * Suez open this week?"). Server- and client-safe: no hooks, no fetch. Pass `view` to reuse a
 * view computed by the page; otherwise it is computed from the committed files at render time.
 * `compact` (home first screen): tighter spacing, no gauge scale labels, and the per-lane week
 * label only when it differs from the strip's week. `headless` (home v2): the page prints the heading,
 * week and stale note above the relief, so the strip renders only the lane cards and the source line,
 * labelled by the page's heading (`headingId` then names that external heading).
 */
export function CorridorStrip({
  view,
  now,
  showPageLink = true,
  headingId = 'corridor-strip-h',
  compact = false,
  headless = false,
}: {
  view?: CorridorsView;
  now?: Date;
  showPageLink?: boolean;
  headingId?: string;
  compact?: boolean;
  headless?: boolean;
}) {
  const v = view ?? getCorridors(now ?? new Date());
  const stale = v.state !== 'current';
  // Headless: a plain block inside the page's own labelled section (no second region with the same name).
  const Wrap = headless ? 'div' : 'section';
  // Lane names sit one level under the strip heading: h3 under the strip's h2, h2 under the page's h1.
  const LaneH = headless ? 'h2' : 'h3';
  return (
    <Wrap
      aria-labelledby={headless ? undefined : headingId}
      className={`${s.root} ${s.strip}`}
      data-compact={compact ? 'true' : undefined}
      data-headless={headless ? 'true' : undefined}
    >
      {headless ? null : (
        <div className={s.stripHead}>
          <h2 id={headingId} className={s.stripTitle}>
            Corridors this week
          </h2>
          <p className={`${s.meta} ${s.num}`}>
            {v.weekLabel ? `Week ${v.weekLabel}` : 'No current week'}
            {v.asOfLabel ? ` · data as of ${v.asOfLabel}` : ''}
          </p>
        </div>
      )}
      {v.staleMessage && !headless ? (
        <StaleNote>
          {v.staleMessage}.{' '}
          {v.state === 'stale'
            ? 'Status is shown as UNKNOWN until the next PortWatch week is published; the last known figures stay visible, greyed.'
            : 'No status or figure is shown until a file passes the checks.'}
        </StaleNote>
      ) : null}
      <ul className={s.stripGrid}>
        {v.lanes.map((l) => (
          <li key={l.id} className={s.stripCard} data-stale={stale ? 'true' : 'false'}>
            <div className={s.laneHead}>
              <div className={s.laneWho}>
                <LaneH className={s.laneName}>{l.name}</LaneH>
                <span className={s.laneSub}>{l.sub}</span>
              </div>
              <StatusChip status={l.status} />
            </div>
            <div className={s.idxRow}>
              <span className={`${s.num} ${s.idxBig} ${stale ? s.greyed : ''}`}>
                {l.index === null ? '—' : fmtPct(l.index)}
              </span>
              <span className={`${s.text2} ${s.idxText}`} style={{ fontSize: 14 }}>
                {l.index === null ? 'no current figure' : 'of an average 2023 week'}
              </span>
            </div>
            <IndexGauge index={l.index} status={l.status} />
            <dl className={s.facts}>
              <div>
                <dt>Transits, week</dt>
                <dd className={`${s.num} ${stale ? s.greyed : ''}`}>{l.transits === null ? '—' : fmtInt(l.transits)}
                  {l.transits === null ? null : <span className={s.mUnit}> transits</span>}
                </dd>
              </div>
              <div>
                <dt>vs previous week{l.prev !== null ? ` (${fmtInt(l.prev)})` : ''}</dt>
                <dd className={`${s.num} ${stale ? s.greyed : ''}`}>{l.wow ? l.wow.text : '—'}</dd>
              </div>
            </dl>
            {l.weekLabel && !(compact && l.weekLabel === v.weekLabel) ? <p className={`${s.meta} ${s.num}`}>Week {l.weekLabel}</p> : null}
          </li>
        ))}
      </ul>
      <p className={s.stripFoot}>
        <span>
          Source: {v.sourceCredit.replace(/^Transits:\s*/, '')}. Index = weekly transits ÷ 2023 average week. CLOSED
          is only set by an authority, never from traffic.
        </span>
        {showPageLink ? (
          <Link href="/corridors" prefetch={false}>
            All corridors and how status is set →
          </Link>
        ) : null}
      </p>
    </Wrap>
  );
}

export default CorridorStrip;
