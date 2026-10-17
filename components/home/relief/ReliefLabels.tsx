import { POSTER_H, POSTER_W, RELIEF_LANES, projectToPoster, toWorld, type ReliefLaneId, type ReliefLaneStyle } from './model';
import { STATUS_GLYPHS } from '@/lib/design-tokens';

/** Aspect of the home figure box. Any aspect from ~1.4 to POSTER_W / POSTER_H shows every lane ("slice" crop). */
export const RELIEF_FIGURE_ASPECT = 16 / 9;

/** Where each lane's label sits: its gate (Port Said, the Bab al-Mandeb strait, the Strait of Hormuz). */
const ANCHOR: Record<ReliefLaneId, { point: number; name: string; side: 'right' | 'above' | 'above-right' }> = {
  suez: { point: RELIEF_LANES.suez.length - 1, name: 'Suez', side: 'right' },
  bam_redsea: { point: 0, name: 'Bab al-Mandeb', side: 'above-right' },
  hormuz: { point: 4, name: 'Hormuz', side: 'above' },
};
const ORDER: readonly ReliefLaneId[] = ['hormuz', 'bam_redsea', 'suez'];

/**
 * Label position as a % of a box of `aspect` that shows the poster with preserveAspectRatio "xMidYMid
 * slice" (the poster's and the WebGL camera's rest view), so a label sits on its lane's gate.
 */
export function labelPosition(id: ReliefLaneId, aspect = RELIEF_FIGURE_ASPECT): { left: number; top: number } {
  const p = RELIEF_LANES[id][ANCHOR[id].point];
  const [sx, sy] = projectToPoster(toWorld(p.lon, p.lat, 0));
  const ar0 = POSTER_W / POSTER_H;
  if (aspect <= ar0) {
    const visW = POSTER_H * aspect;
    return { left: ((sx - (POSTER_W - visW) / 2) / visW) * 100, top: (sy / POSTER_H) * 100 };
  }
  const visH = POSTER_W / aspect;
  return { left: (sx / POSTER_W) * 100, top: ((sy - (POSTER_H - visH) / 2) / visH) * 100 };
}

/**
 * Lane labels over the home relief figure (Main artboard): gate name + the lane's status glyph and word,
 * in the lane's status token. Server-rendered from the SAME lane styles the relief draws (reliefLaneStyles
 * of the page's one corridors view), so a label can never disagree with its lane or with the strip.
 * Decoration like the relief itself: aria-hidden, the lane cards carry every fact. Never mirrored.
 */
export function ReliefLabels({ lanes, className }: { lanes: Record<ReliefLaneId, ReliefLaneStyle>; className?: string }) {
  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0, direction: 'ltr', pointerEvents: 'none' }}>
      {ORDER.map((id) => {
        const { left, top } = labelPosition(id);
        const st = lanes[id];
        return (
          <span key={id} data-relief-label={id} data-status={st.status} data-side={ANCHOR[id].side} style={{ left: `${left}%`, top: `${top}%` }}>
            <span data-relief-dot="" style={{ background: `var(${st.colorVar})` }} />
            <span data-relief-text="">
              <span data-relief-name="">{ANCHOR[id].name}</span>
              <span data-relief-status="" style={{ color: `var(${st.colorVar})` }}>
                {STATUS_GLYPHS[st.status]} {st.status}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
