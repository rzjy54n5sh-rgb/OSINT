import Link from 'next/link';
import {
  CHOKEPOINT_MAX_AGE_DAYS,
  CHOKEPOINT_MAX_WEEK_END_AGE_DAYS,
  corridorHeadline,
  fmtInt,
  fmtPct,
  type CorridorLane,
  type CorridorsView,
  type LaneStatus,
} from '@/lib/corridors';
import { corridorFontVars } from './fonts';
import { IndexGauge, StaleNote, StatusChip } from './parts';
import { HistoryChart } from './HistoryChart';
import s from './corridors.module.css';

/** Body of /corridors, rendered from a precomputed view (server- and client-safe, no hooks). */
const RULES: { status: LaneStatus; band: string; text: string }[] = [
  { status: 'NORMAL', band: '≥ 90%', text: 'Traffic at or near its 2023 level.' },
  { status: 'ELEVATED', band: '50–90%', text: 'Ships still pass, at a clearly reduced rate.' },
  { status: 'DISRUPTED', band: '< 50%', text: 'Less than half of normal traffic.' },
  {
    status: 'CLOSED',
    band: 'By authority only',
    text: 'Only when the competent authority, UKMTO or MARAD says transit is suspended. Never inferred from traffic, however low.',
  },
  {
    status: 'UNKNOWN',
    band: 'Stale or failed checks',
    text: `The published file is more than ${CHOKEPOINT_MAX_AGE_DAYS} days old, or its week ended more than ${CHOKEPOINT_MAX_WEEK_END_AGE_DAYS} days ago. Shown as “Not updated since [date]”.`,
  },
];

function LaneCard({ lane, view }: { lane: CorridorLane; view: CorridorsView }) {
  const stale = view.state !== 'current';
  const g = stale ? s.greyed : '';
  const hId = `lane-${lane.id}-h`;
  return (
    <article className={s.laneCard} aria-labelledby={hId} data-stale={stale ? 'true' : 'false'}>
      <div className={s.laneMain}>
        <div className={s.laneHead}>
          <div>
            <h2 id={hId} className={s.laneTitle}>
              {lane.name}
            </h2>
            <span className={s.laneSub}>
              {lane.sub} · PortWatch <span className={s.num}>{lane.portid}</span>
            </span>
          </div>
          <StatusChip status={lane.status} />
        </div>
        <div className={s.idxRow}>
          <span className={`${s.num} ${s.idxHuge} ${g}`}>{lane.index === null ? '—' : fmtPct(lane.index)}</span>
          <span className={s.text2} style={{ fontSize: 14 }}>
            {lane.index === null ? 'no figure shown' : 'of an average 2023 week'}
          </span>
        </div>
        <IndexGauge index={lane.index} status={lane.status} />
        <dl className={`${s.facts} ${s.facts3}`}>
          <div>
            <dt>This week</dt>
            <dd className={`${s.num} ${g}`}>{lane.transits === null ? '—' : fmtInt(lane.transits)}</dd>
          </div>
          <div>
            <dt>Week before</dt>
            <dd className={`${s.num} ${g}`}>
              {lane.prev === null ? '—' : fmtInt(lane.prev)}
              {lane.wow ? <span className={`${s.wow} ${s.num}`}>{lane.wow.text}</span> : null}
            </dd>
          </div>
          <div>
            <dt>2023 avg week</dt>
            <dd className={s.num}>{lane.baselineWeek.toFixed(1)}</dd>
          </div>
        </dl>
        <p className={s.driver}>
          {view.state === 'current' ? (
            <>
              {lane.statusDriver ?? `Status from the traffic band.`}
              {lane.statusBand === 'security' && lane.statusSourceUrl ? (
                <>
                  {' '}
                  <a href={lane.statusSourceUrl} rel="noopener noreferrer" target="_blank">
                    Authority notice
                  </a>
                </>
              ) : null}
              {lane.override ? <> Analyst note: {lane.override}</> : null}
            </>
          ) : view.state === 'stale' ? (
            <>
              {view.staleMessage}. No current status; the figures are from the last published week.
            </>
          ) : (
            <>No status or figure is shown until a file passes the checks.</>
          )}
          {lane.weekLabel ? (
            <>
              <br />
              <span className={`${s.num} ${s.muted}`} style={{ fontSize: 13 }}>
                Week {lane.weekLabel}
                {lane.sourceUrl ? (
                  <>
                    {' · '}
                    <a href={lane.sourceUrl} rel="noopener noreferrer" target="_blank">
                      PortWatch layer
                    </a>
                  </>
                ) : null}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <HistoryChart lane={lane} retrievedAt={view.historyRetrievedAt} sourceCredit={view.sourceCredit} />
    </article>
  );
}

export function CorridorsPageBody({ view }: { view: CorridorsView }) {
  return (
    <div className={`${s.root} ${corridorFontVars}`}>
      <div className={s.page}>
        <section aria-labelledby="corridors-h1" className={s.intro}>
          <p className={`${s.meta} ${s.num}`}>
            {[view.weekLabel ? `Week ${view.weekLabel}` : null, view.issueLabel, view.asOfLabel ? `data as of ${view.asOfLabel}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <h1 id="corridors-h1" className={s.h1}>
            Corridors
          </h1>
          <p className={s.lede}>{corridorHeadline(view)}</p>
          {view.state === 'withheld' ? <StaleNote>{view.staleMessage}.</StaleNote> : null}
          <details className={s.howTo}>
            <summary>How to read this page</summary>
            <p>
              Each lane’s index is its transits that week divided by an average 2023 week (the mean daily count from 1
              Jan to 31 Oct 2023, times seven). The status word follows from the index alone, except CLOSED, which
              only an authority can declare. Weeks run Monday to Sunday; PortWatch publishes with a lag of a few days.
            </p>
          </details>
        </section>

        <section aria-label="Lanes this week" className={s.lanes}>
          {view.lanes.map((l) => (
            <LaneCard key={l.id} lane={l} view={view} />
          ))}
        </section>

        <section aria-labelledby="rules-h" className={s.section}>
          <h2 id="rules-h" className={s.h2}>
            How status is set
          </h2>
          <ul className={s.rules}>
            {RULES.map((r) => (
              <li key={r.status} className={s.rule} data-status={r.status}>
                <StatusChip status={r.status} />
                <span className={`${s.ruleBand} ${/\d/.test(r.band) ? s.num : ''}`}>{r.band}</span>
                <span className={s.ruleText}>{r.text}</span>
              </li>
            ))}
          </ul>
          <p className={s.prose}>
            Status is never set to CLOSED from traffic alone, however low the count. When a lane’s status comes from a
            security notice rather than traffic, the card says so and links the notice. The freshness rule is the same
            one the daily card applies before it will print a lane.
          </p>
        </section>

        <section aria-labelledby="source-h" className={s.section}>
          <h2 id="source-h" className={s.h2}>
            Source and licence
          </h2>
          <p className={s.prose}>
            {view.sourceCredit}.{' '}
            <a href={view.sourceHome} rel="noopener noreferrer" target="_blank">
              {view.sourceName}
            </a>{' '}
            counts vessel transits through each chokepoint from AIS position signals.
          </p>
          <p className={s.prose}>{view.licenceLine}</p>
        </section>

        <section id="weekly" aria-labelledby="weekly-h" className={s.cta}>
          <div className={s.ctaText}>
            <p className={s.eyebrow}>For forwarders, brokers and underwriters</p>
            <h2 id="weekly-h" className={s.ctaH}>
              Chokepoint Weekly
            </h2>
            <p className={s.ctaBody}>
              A short weekly brief on Hormuz, Bab al-Mandeb and Suez: status, transits against 2023, and every figure
              linked to its source. Founding access is free while we launch.
            </p>
          </div>
          <div className={s.ctaActions}>
            <Link href="/pricing#founding-access-heading" prefetch={false} className={s.btnPrimary}>
              Get Chokepoint Weekly
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

