import type { CorridorLane } from '@/lib/corridors';
import { fmtInt, fmtPct, formatShortDay, formatWeek, formatDay } from '@/lib/corridors';
import s from './corridors.module.css';

/** First week of the published series (Chokepoint Weekly Issue #1). */
const ISSUE1_WEEK_START = '2026-09-28';

/**
 * 12-week area sparkline of the weekly index (% of an average 2023 week). Gaps stay gaps: a week
 * with a missing day is null and breaks the line. Rules at 90 (NORMAL) and 50 (ELEVATED), the
 * 2023 baseline annotated at 100. Every value is also in the Table below the chart.
 */
export function HistoryChart({
  lane,
  retrievedAt,
  sourceCredit,
}: {
  lane: CorridorLane;
  retrievedAt: string | null;
  sourceCredit: string;
}) {
  const weeks = lane.history;
  const titleId = `hist-${lane.id}-t`;
  if (!weeks || !weeks.some((w) => w.index !== null)) {
    return (
      <figure className={s.figure} aria-labelledby={titleId}>
        <figcaption className={s.figcaption}>
          <span id={titleId} className={s.chartTitle}>
            12-week history
          </span>
          <span className={s.chartSub}>Weekly transits as % of an average 2023 week</span>
        </figcaption>
        <div className={s.empty}>
          History builds up weekly from Issue #1 (week of {formatShortDay(ISSUE1_WEEK_START)}).
        </div>
      </figure>
    );
  }

  const vals = weeks.map((w) => w.index);
  const known = vals.filter((x): x is number => x !== null);
  const yMax = Math.max(100, Math.ceil(Math.max(...known) / 10) * 10);
  const n = weeks.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (1 - v / yMax) * 100;

  // Continuous segments (null breaks the line and the area).
  const segments: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  vals.forEach((v, i) => {
    if (v === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) segments.push(cur);

  const lastIdx = [...vals.keys()].reverse().find((i) => vals[i] !== null)!;
  const firstIdx = vals.findIndex((v) => v !== null);
  const last = weeks[lastIdx];
  const first = weeks[firstIdx];
  const title =
    lastIdx === firstIdx
      ? `${lane.shortName}: ${fmtPct(last.index!)} of 2023 in the week of ${formatShortDay(last.weekStart)}`
      : `${lane.shortName}: ${fmtPct(last.index!)} of 2023 in the week of ${formatShortDay(last.weekStart)}, against ${fmtPct(first.index!)} in the week of ${formatShortDay(first.weekStart)}`;
  const span = formatWeek(weeks[0].weekStart, weeks[n - 1].weekEnd);
  const ticks = [0, 50, 90, 100, ...(yMax > 100 ? [yMax] : [])];

  return (
    <figure className={s.figure} aria-labelledby={titleId} data-tone={lane.status}>
      <figcaption className={s.figcaption}>
        <span id={titleId} className={s.chartTitle}>
          {title}
        </span>
        <span className={s.chartSub}>
          Weekly transits as % of an average 2023 week, {n} weeks{span ? `, ${span}` : ''}
        </span>
      </figcaption>
      <div className={s.chartRow} aria-hidden="true">
        <div className={`${s.yAxis} ${s.num}`}>
          {ticks.map((t) => (
            <span key={t} style={{ top: `${y(t)}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className={s.plot}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            <line x1="0" x2="100" y1={y(100)} y2={y(100)} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="100" y1={y(90)} y2={y(90)} stroke="var(--st-normal)" strokeOpacity="0.6" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="100" y1={y(50)} y2={y(50)} stroke="var(--st-elevated)" strokeOpacity="0.6" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {segments.map((seg, k) => {
              const pts = seg.map((p) => `${x(p.i)},${y(p.v)}`).join(' ');
              const area =
                seg.length > 1 ? `${x(seg[0].i)},100 ${pts} ${x(seg[seg.length - 1].i)},100` : null;
              return (
                <g key={k}>
                  {area ? <polygon points={area} style={{ fill: 'var(--tone)' }} fillOpacity="0.14" /> : null}
                  <polyline
                    points={pts}
                    fill="none"
                    style={{ stroke: 'var(--tone)' }}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>
          <span className={s.baseLabel} style={{ top: `${y(100)}%` }}>
            2023 average = 100
          </span>
          <span className={s.dot} style={{ left: `${x(lastIdx)}%`, top: `${y(last.index!)}%` }} />
          <span
            className={s.num}
            style={{
              position: 'absolute',
              right: 0,
              top: `calc(${y(last.index!)}% - 26px)`,
              fontSize: 13,
              color: 'var(--tone)',
            }}
          >
            {fmtPct(last.index!)}
          </span>
        </div>
      </div>
      <div className={`${s.xAxis} ${s.num}`} aria-hidden="true">
        <span>wk of {formatShortDay(weeks[0].weekStart)}</span>
        <span>{formatShortDay(weeks[n - 1].weekStart)}</span>
      </div>
      <p className={s.chartNote}>
        Source: {sourceCredit.replace(/^Transits:\s*/, '')}
        {retrievedAt ? `, retrieved ${formatDay(retrievedAt)}` : ''}. Dashed rules: 90 (NORMAL) and 50 (ELEVATED).
        Weeks run Monday to Sunday; a week with a missing day is left as a gap.
      </p>
      <details className={s.tableToggle}>
        <summary>Table</summary>
        <table className={`${s.table} ${s.num}`}>
          <caption className={s.srOnly}>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Transits</th>
              <th scope="col">% of 2023</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart}>
                <th scope="row" style={{ fontWeight: 400, color: 'var(--cor-text)' }}>
                  {formatWeek(w.weekStart, w.weekEnd)}
                </th>
                <td>{w.transits === null ? `— (${w.days}/7 days)` : fmtInt(w.transits)}</td>
                <td>{w.index === null ? '—' : fmtPct(w.index)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
