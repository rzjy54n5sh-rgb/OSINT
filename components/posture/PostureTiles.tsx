/**
 * War Posture schematic tile map + legend (artboard Posture.dc.html, items 7–8). No hooks: server-safe.
 * The stage is aria-hidden decoration (R8/R11): every fact on it is also in the list. Hidden on phones.
 * Tiles: a coded v2 position = its score band's fill with the number; EG / AE / SA = outline only, no
 * number, a quote glyph only when a statement is on record for this front (R9); otherwise a dashed outline.
 * Frozen v1 rows are never drawn here (R3: they carry no conflict).
 */
import { POSTURE_BANDS } from '@/lib/design-tokens';
import { POSTURE_LABELS, POSTURE_WITHHELD_TITLE } from '@/lib/posture';
import { MAP_SEAS, POSTURE_TILES, TILE_COLS, TILE_ROWS, type TileState } from '@/lib/posture-board';
import s from './posture.module.css';

const STAGE_W = TILE_COLS * 78;
const STAGE_H = TILE_ROWS * 78;

export function PostureTiles({ tiles }: { tiles: Record<string, TileState> }) {
  return (
    <div className={s.stageWrap} aria-hidden="true" data-testid="posture-tiles">
      <div className={s.stage}>
        {MAP_SEAS.map((sea) => (
          <span key={sea.label} className={s.sea} style={{ left: `${sea.left}%`, top: `${sea.top}%`, width: `${sea.width}%` }}>
            {sea.label}
          </span>
        ))}
        {POSTURE_TILES.map((tile) => {
          const st = tiles[tile.key] ?? { kind: 'none' };
          return (
            <div
              key={tile.key}
              className={s.tile}
              data-tile={tile.key}
              data-kind={st.kind}
              data-band={st.kind === 'position' ? st.band : undefined}
              style={{
                left: `${((tile.col * 78) / STAGE_W) * 100}%`,
                top: `${((tile.row * 78) / STAGE_H) * 100}%`,
                width: `${(((tile.span ?? 1) * 78 - 6) / STAGE_W) * 100}%`,
              }}
            >
              <span className={s.tileLabel}>{tile.label}</span>
              <span className={s.tileVal}>
                {/* EG / AE / SA: outline and code only; the quote glyph comes with their statements panel (part 2). */}
                {st.kind === 'position' ? st.score : st.kind === 'silence' ? 'silent' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * R4: one scale. The four colour bands with their score ranges; the label words (lib/posture.ts, unchanged)
 * listed separately as text, since a label's range can span two bands.
 */
export function PostureLegend({ silence = false, tiles = true }: { silence?: boolean; tiles?: boolean }) {
  return (
    <div className={s.legend} data-testid="posture-legend">
      <span className={s.legendBands} data-testid="posture-legend-bands">
        <span>Colour = score band:</span>
        {POSTURE_BANDS.map((b) => (
          <span key={b.band} className={s.legendItem}>
            <span className={s.legendSw} data-band={b.band} aria-hidden="true" />
            <span className={s.num}>
              {b.min}–{b.max}
            </span>
          </span>
        ))}
        <span>(0 de-escalate → 100 escalate)</span>
      </span>
      {tiles ? (
        <>
          <span className={s.legendItem}>
            <span className={s.legendSw} data-kind="stated" aria-hidden="true" />
            {POSTURE_WITHHELD_TITLE} (EG, SA, AE)
          </span>
          <span className={`${s.legendItem} ${s.legendTileOnly}`}>
            <span className={s.legendSw} data-kind="none" aria-hidden="true" />
            No position on this front
          </span>
          {silence ? (
            <span className={s.legendItem}>
              <span className={s.legendSw} data-kind="silence" aria-hidden="true" />
              Deliberate silence
            </span>
          ) : null}
        </>
      ) : null}
      <p className={s.legendWords} data-testid="posture-legend-labels">
        Label words: {POSTURE_LABELS.map((l) => `${l.text} ${l.min}–${l.max}`).join(' · ')}
      </p>
    </div>
  );
}
