import { StatusChip } from '@/components/ui/StatusChip';
import { chartTitle, type ChartLane } from '@/lib/brief-figures';
import { fmtInt, fmtPct, type CorridorsView } from '@/lib/corridors';
import s from './brief.module.css';

/**
 * Chokepoint chart inside the section that cites the Chokepoint Weekly edition. The reader passes only the
 * lanes the brief names (two or more; one lane is a key figure only), each with the status that edition
 * published, dated by the as-of subtitle. Bars start at zero; 100% = the average 2023 week; status is
 * glyph + word + colour. R3: the title uses exact numbers. R4: a Table view, no CSV.
 */
export function BriefChokepointFigure({ view, lanes, sourceN }: { view: CorridorsView; lanes: ChartLane[]; sourceN: number }) {
  const title = lanes.length >= 2 ? chartTitle(lanes) : null;
  if (!title) return null;
  const sub = ['Weekly transits as % of an average 2023 week', view.weekLabel ? `week ${view.weekLabel}` : null, view.asOfLabel ? `as of ${view.asOfLabel}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <figure className={s.figure} aria-labelledby="cw-fig-title">
      <figcaption className={s.figCaption}>
        <span id="cw-fig-title" className={s.figTitle}>
          {title}
        </span>
        <span className={s.note}>{sub}</span>
      </figcaption>
      <ul className={s.bars}>
        {lanes.map(({ lane, index, status }) => (
          <li key={lane.id} className={s.bar} data-status={status}>
            <span className={s.barName}>
              {lane.name}
              <StatusChip status={status} size="sm" />
            </span>
            <span className={s.track} aria-hidden="true">
              <span className={s.fill} style={{ inlineSize: `${Math.min(100, Math.max(0, index))}%` }} />
              <span className={s.rule} style={{ insetInlineStart: '50%' }} />
              <span className={s.rule} style={{ insetInlineStart: '90%' }} />
            </span>
            <span className={`${s.num} ${s.barValue}`}>{fmtPct(index)}</span>
          </li>
        ))}
      </ul>
      <p className={s.figFoot}>
        Rules at 50 and 90; 2023 average = 100%. Via {view.issueLabel ?? view.sourceName}{' '}
        <a href={`#src-${sourceN}`} className={s.num}>
          [{sourceN}]
        </a>
        . {view.licenceLine}
      </p>
      <details className={s.tableToggle}>
        <summary>Table</summary>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption className={s.srOnly}>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Lane</th>
                <th scope="col">Status</th>
                <th scope="col" className={s.n}>
                  Transits
                </th>
                <th scope="col" className={s.n}>
                  % of average 2023 week
                </th>
              </tr>
            </thead>
            <tbody>
              {lanes.map(({ lane, index, transits, status }) => (
                <tr key={lane.id}>
                  <th scope="row">{lane.name}</th>
                  <td>
                    <StatusChip status={status} size="sm" />
                  </td>
                  <td className={s.n}>{fmtInt(transits)}</td>
                  <td className={s.n}>{fmtPct(index)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export default BriefChokepointFigure;
