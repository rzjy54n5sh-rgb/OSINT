import { POSTER_H, POSTER_W, type ReliefLaneId, type ReliefLaneStyle } from './model';
import { POSTER_CONNECTOR, POSTER_COAST, POSTER_GRATICULE, POSTER_LANES } from './poster.generated';

const LANE_IDS: readonly ReliefLaneId[] = ['hormuz', 'bam_redsea', 'suez'];

/**
 * The static corridor relief: the WebGL relief's rest view as line art (coastline, 5° graticule,
 * lane lines), drawn with the same camera so the two cross-fade in place. Shown to everyone who does
 * not get WebGL (phones, reduced motion, no or software WebGL, low-end devices) and under the canvas
 * until its first frame. Decoration: aria-hidden, no text. Lanes use the StatusChip tokens; UNKNOWN
 * (stale or withheld data) is neutral and dashed. direction: ltr and no transforms: never mirrored in RTL.
 * Server-safe (no hooks), so tests render it with react-dom/server.
 */
export function ReliefPoster({ styles, visible = true, fade = false }: {
  styles: Record<ReliefLaneId, ReliefLaneStyle>;
  visible?: boolean;
  fade?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-relief-poster=""
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        direction: 'ltr',
        opacity: visible ? 1 : 0,
        transition: fade ? 'opacity 1.2s ease' : undefined,
      }}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={POSTER_GRATICULE} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={POSTER_COAST} stroke="var(--muted)" strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path
          d={POSTER_CONNECTOR}
          stroke="var(--muted)"
          strokeWidth={1.5}
          strokeDasharray="2 6"
          vectorEffect="non-scaling-stroke"
          data-relief-connector=""
        />
        {LANE_IDS.map((id) => {
          const s = styles[id];
          return (
            <path
              key={id}
              d={POSTER_LANES[id]}
              stroke={`var(${s.colorVar})`}
              strokeWidth={3}
              strokeDasharray={s.dashed ? '6 6' : undefined}
              vectorEffect="non-scaling-stroke"
              data-lane={id}
              data-status={s.status}
            />
          );
        })}
      </g>
    </svg>
  );
}
