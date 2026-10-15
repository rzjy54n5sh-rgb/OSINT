/**
 * Builds the home hero's corridor relief assets from ETOPO1 (run by hand; the outputs are committed):
 *
 *   npx --yes tsx@4.23.13 data/relief/build-relief.ts            # downloads the subset from ERDDAP
 *   npx --yes tsx@4.23.13 data/relief/build-relief.ts path.csv   # or reads a saved copy
 *
 * Source: ETOPO1 1 arc-minute global relief model, ice surface, grid-registered (NOAA NGDC/NCEI;
 * Amante & Eakins 2009, NOAA Technical Memorandum NESDIS NGDC-24, doi:10.7289/V5C8276M), served by
 * NOAA's ERDDAP as dataset `etopo180`. US Government work, public domain; ERDDAP licence text: "The
 * data may be used and redistributed for free but is not intended for legal use". Subset: every 9th
 * sample (0.15°) over 31–61.9°E × 9–31.95°N (207 × 154 points).
 *
 * Writes:
 *   public/relief/corridor-relief.v1.bin          heightfield (8-bit, row-delta, gzip)
 *   components/home/relief/poster.generated.ts    static poster paths (rest camera, 1440 × 440)
 *
 * Fails (exit 1) when a lane point is not over open sea (canal points excepted) or the grid does not
 * match components/home/relief/model.ts GRID.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  GRID,
  HEIGHTFIELD_MAGIC,
  POSTER_H,
  POSTER_W,
  RELIEF_CONNECTOR,
  RELIEF_LANES,
  encodeElevation,
  projectToPoster,
  toWorld,
  type LanePoint,
} from '../../components/home/relief/model';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ERDDAP =
  'https://upwell.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(9.0):9:(32.0)%5D%5B(31.0):9:(62.0)%5D';

function die(msg: string): never {
  console.error(`build-relief: ${msg}`);
  process.exit(1);
}

async function readCsv(): Promise<string> {
  const arg = process.argv[2];
  if (arg) return readFileSync(arg, 'utf8');
  const res = await fetch(ERDDAP);
  if (!res.ok) die(`ERDDAP answered ${res.status}`);
  return res.text();
}

async function main() {
// ---- 1. Grid: row 0 = north ----------------------------------------------------------------------
const csv = await readCsv();
const lines = csv.trim().split('\n').slice(2); // header + units
const { w: W, h: H } = GRID;
if (lines.length !== W * H) die(`expected ${W * H} samples, got ${lines.length}`);
const elev = new Float64Array(W * H);
for (const line of lines) {
  const [la, lo, al] = line.split(',').map(Number);
  const r = Math.round((GRID.latN - la) / GRID.step);
  const c = Math.round((lo - GRID.lon0) / GRID.step);
  if (r < 0 || r >= H || c < 0 || c >= W || !Number.isFinite(al)) die(`bad sample: ${line}`);
  elev[r * W + c] = al;
}
const lonOf = (c: number) => GRID.lon0 + c * GRID.step;
const latOf = (r: number) => GRID.latN - r * GRID.step;

// ---- 2. Open sea = below 0 m AND connected (4-neighbour) to a below-0 cell on the grid edge. -----
// The Dead Sea and the Danakil depression are below sea level but are not sea: they count as land.
const ocean = new Uint8Array(W * H);
const stack: number[] = [];
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    if ((r === 0 || c === 0 || r === H - 1 || c === W - 1) && elev[r * W + c] < 0) {
      ocean[r * W + c] = 1;
      stack.push(r * W + c);
    }
  }
}
while (stack.length) {
  const i = stack.pop()!;
  const r = Math.floor(i / W);
  const c = i % W;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
    const j = rr * W + cc;
    if (!ocean[j] && elev[j] < 0) {
      ocean[j] = 1;
      stack.push(j);
    }
  }
}
const field = new Float64Array(W * H);
for (let i = 0; i < W * H; i++) field[i] = ocean[i] ? Math.min(elev[i], -0.5) : Math.max(elev[i], 0.5);

// ---- 3. Lane points must be over open sea (bilinear on `field`) -----------------------------------
function fieldAt(lon: number, lat: number): number {
  const c = (lon - GRID.lon0) / GRID.step;
  const r = (GRID.latN - lat) / GRID.step;
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const fc = c - c0;
  const fr = r - r0;
  const g = (rr: number, cc: number) => field[Math.min(H - 1, Math.max(0, rr)) * W + Math.min(W - 1, Math.max(0, cc))];
  return (g(r0, c0) * (1 - fc) + g(r0, c0 + 1) * fc) * (1 - fr) + (g(r0 + 1, c0) * (1 - fc) + g(r0 + 1, c0 + 1) * fc) * fr;
}
const allLanes: [string, LanePoint[]][] = [...Object.entries(RELIEF_LANES), ['connector', RELIEF_CONNECTOR]];
for (const [id, pts] of allLanes) {
  for (const p of pts) {
    if (p.canal) continue;
    const v = fieldAt(p.lon, p.lat);
    if (!(v < 0)) die(`lane ${id} point ${p.lon},${p.lat} is not over open sea (field ${v.toFixed(1)} m)`);
  }
}

// ---- 4. Heightfield file ------------------------------------------------------------------------
const bytes = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) bytes[i] = ocean[i] ? encodeElevation(Math.min(elev[i], -0.5)) : encodeElevation(Math.max(elev[i], 0));
const delta = new Uint8Array(W * H);
for (let r = 0; r < H; r++) {
  let prev = 0;
  for (let c = 0; c < W; c++) {
    const i = r * W + c;
    delta[i] = (bytes[i] - prev) & 255;
    prev = bytes[i];
  }
}
const header = new Uint8Array([...HEIGHTFIELD_MAGIC, W & 255, W >> 8, H & 255, H >> 8]);
const payload = new Uint8Array(header.length + delta.length);
payload.set(header);
payload.set(delta, header.length);
const gz = gzipSync(payload, { level: 9 });
// Fixed mtime/OS bytes so a rebuild from the same data is byte-identical.
gz[4] = gz[5] = gz[6] = gz[7] = 0;
gz[9] = 255;
const binPath = resolve(ROOT, 'public/relief/corridor-relief.v1.bin');
mkdirSync(dirname(binPath), { recursive: true });
writeFileSync(binPath, gz);
console.log(`heightfield: ${W}×${H}, ${payload.length} B raw → ${gz.length} B gzip`);

// ---- 5. Coastline: marching squares at 0 m on `field`, chained, projected, simplified -----------
type Pt = [number, number];
const segs: [string, string][] = [];
const pos = new Map<string, Pt>(); // edge key → [lon, lat]
function edgePoint(key: string, r1: number, c1: number, r2: number, c2: number) {
  if (pos.has(key)) return key;
  const a = field[r1 * W + c1];
  const b = field[r2 * W + c2];
  const t = a / (a - b);
  pos.set(key, [lonOf(c1 + (c2 - c1) * t), latOf(r1 + (r2 - r1) * t)]);
  return key;
}
for (let r = 0; r < H - 1; r++) {
  for (let c = 0; c < W - 1; c++) {
    const tl = field[r * W + c] < 0 ? 1 : 0;
    const tr = field[r * W + c + 1] < 0 ? 1 : 0;
    const br = field[(r + 1) * W + c + 1] < 0 ? 1 : 0;
    const bl = field[(r + 1) * W + c] < 0 ? 1 : 0;
    const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
    if (idx === 0 || idx === 15) continue;
    const top = () => edgePoint(`h${r},${c}`, r, c, r, c + 1);
    const bottom = () => edgePoint(`h${r + 1},${c}`, r + 1, c, r + 1, c + 1);
    const left = () => edgePoint(`v${r},${c}`, r, c, r + 1, c);
    const right = () => edgePoint(`v${r},${c + 1}`, r, c + 1, r + 1, c + 1);
    const centreSea =
      (field[r * W + c] + field[r * W + c + 1] + field[(r + 1) * W + c] + field[(r + 1) * W + c + 1]) / 4 < 0;
    switch (idx) {
      case 1: case 14: segs.push([left(), bottom()]); break;
      case 2: case 13: segs.push([bottom(), right()]); break;
      case 3: case 12: segs.push([left(), right()]); break;
      case 4: case 11: segs.push([top(), right()]); break;
      case 6: case 9: segs.push([top(), bottom()]); break;
      case 7: case 8: segs.push([left(), top()]); break;
      case 5: // tr + bl sea
        if (centreSea) { segs.push([left(), top()]); segs.push([bottom(), right()]); }
        else { segs.push([top(), right()]); segs.push([left(), bottom()]); }
        break;
      case 10: // tl + br sea
        if (centreSea) { segs.push([top(), right()]); segs.push([left(), bottom()]); }
        else { segs.push([left(), top()]); segs.push([bottom(), right()]); }
        break;
    }
  }
}
const adj = new Map<string, number[]>();
segs.forEach(([a, b], i) => {
  for (const k of [a, b]) adj.set(k, [...(adj.get(k) ?? []), i]);
});
const used = new Uint8Array(segs.length);
const chains: string[][] = [];
function walk(start: string, first: number): string[] {
  const out = [start];
  let cur = start;
  let si = first;
  while (si !== -1 && !used[si]) {
    used[si] = 1;
    const [a, b] = segs[si];
    cur = a === cur ? b : a;
    out.push(cur);
    si = (adj.get(cur) ?? []).find((j) => !used[j]) ?? -1;
  }
  return out;
}
// Open chains first (start at an end used once), then closed loops.
for (const [k, list] of adj) if (list.length === 1 && !used[list[0]]) chains.push(walk(k, list[0]));
for (let i = 0; i < segs.length; i++) if (!used[i]) chains.push(walk(segs[i][0], i));

function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let md = -1;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const toPoster = (lon: number, lat: number): Pt => projectToPoster(toWorld(lon, lat, 0));
const fmt = (pts: Pt[]) => {
  const r = pts.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  return r.length < 2 ? '' : `M${r.map((p) => `${p[0]} ${p[1]}`).join(' ')}`;
};
const pathLen = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
const coastParts: string[] = [];
let coastPts = 0;
for (const ch of chains) {
  const projected = ch.map((k) => toPoster(...pos.get(k)!));
  // Off-poster chains add bytes for nothing; tiny islands are noise at this scale.
  if (!projected.some(([x, y]) => x >= -20 && x <= POSTER_W + 20 && y >= -20 && y <= POSTER_H + 20)) continue;
  if (pathLen(projected) < 14) continue;
  const s = simplify(projected, 0.9);
  const d = fmt(s);
  if (d) { coastParts.push(d); coastPts += s.length; }
}
const COAST = coastParts.join('');

// ---- 6. Graticule (every 5°) and lanes -----------------------------------------------------------
const lonMin = GRID.lon0;
const lonMax = GRID.lon0 + (W - 1) * GRID.step;
const latMin = GRID.latN - (H - 1) * GRID.step;
const latMax = GRID.latN;
const grat: string[] = [];
for (let lon = 35; lon <= 60; lon += 5) grat.push(fmt([toPoster(lon, latMin), toPoster(lon, latMax)]));
for (let lat = 10; lat <= 30; lat += 5) grat.push(fmt([toPoster(lonMin, lat), toPoster(lonMax, lat)]));
const laneD = (pts: LanePoint[]) => fmt(pts.map((p) => toPoster(p.lon, p.lat)));

const out = `/* eslint-disable */
// GENERATED by data/relief/build-relief.ts. Do not edit by hand; regenerate (docs/hero-relief.md).
// Coastline: 0 m contour of ETOPO1 (NOAA NGDC/NCEI, doi:10.7289/V5C8276M; US Government work,
// public domain) at 0.15°, projected with the relief's rest camera into a ${POSTER_W} × ${POSTER_H} viewBox.
// ${coastParts.length} coast paths, ${coastPts} points.
export const POSTER_COAST = ${JSON.stringify(COAST)};
export const POSTER_GRATICULE = ${JSON.stringify(grat.join(''))};
export const POSTER_LANES = {
  hormuz: ${JSON.stringify(laneD(RELIEF_LANES.hormuz))},
  bam_redsea: ${JSON.stringify(laneD(RELIEF_LANES.bam_redsea))},
  suez: ${JSON.stringify(laneD(RELIEF_LANES.suez))},
} as const;
export const POSTER_CONNECTOR = ${JSON.stringify(laneD(RELIEF_CONNECTOR))};
`;
writeFileSync(resolve(ROOT, 'components/home/relief/poster.generated.ts'), out);
console.log(`poster: ${coastParts.length} coast paths, ${coastPts} points, ${out.length} B source, ${gzipSync(out).length} B gzip`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
