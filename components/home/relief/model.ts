/**
 * Corridor relief: the pure part (no DOM, no WebGL), shared by the generator
 * (data/relief/build-relief.ts), the static SVG poster, the WebGL renderer and the unit tests
 * (tests/unit/hero-relief.check.ts).
 *
 * Geometry source: ETOPO1 1 arc-minute global relief model (NOAA NGDC/NCEI; Amante & Eakins 2009,
 * doi:10.7289/V5C8276M), sampled every 0.15° over 31–62°E, 9–32°N. US Government work, public
 * domain; NOAA's ERDDAP licence text: "may be used and redistributed for free". Committed as
 * public/relief/corridor-relief.v1.bin (gzip) and poster.generated.ts; never downloaded from a third
 * party at runtime. Source, licence and regeneration steps: docs/hero-relief.md.
 *
 * Map rules (System artboard): decoration only (aria-hidden; the CorridorStrip carries every fact),
 * no text in the relief, lane colour = the lane's status token and nothing else, and the map is
 * never mirrored (RTL keeps east on the right).
 */

// ---------------------------------------------------------------------------------------------
// Grid (must match the committed heightfield header; the renderer refuses a mismatch)
// ---------------------------------------------------------------------------------------------
export const GRID = {
  lon0: 31,
  /** Northern edge: row 0 is the northmost row. */
  latN: 31.95,
  step: 0.15,
  w: 207,
  h: 154,
} as const;

export const HEIGHTFIELD_URL = '/relief/corridor-relief.v1.bin';
/** "CR" + format version 1, then uint16 LE width and height, then w*h row-delta bytes. */
export const HEIGHTFIELD_MAGIC = [0x43, 0x52, 0x01] as const;

/** Elevation clamps for the 8-bit encoding (square-root scale: shallow seas and low land keep detail). */
export const LAND_MAX_M = 3000;
export const SEA_MAX_M = 5000;

export function encodeElevation(m: number): number {
  if (m >= 0) return 128 + Math.round(127 * Math.sqrt(Math.min(m, LAND_MAX_M) / LAND_MAX_M));
  return 127 - Math.round(127 * Math.sqrt(Math.min(-m, SEA_MAX_M) / SEA_MAX_M));
}

/** Vertical exaggeration in world units (the map is ~2 units wide). */
export const LAND_Y = 0.06;
export const SEA_Y = 0.035;

/** Byte → world height. ≥ 128 is land (or ground below sea level not connected to the ocean). */
export function decodeHeight(b: number): number {
  if (b >= 128) return LAND_Y * Math.pow((b - 128) / 127, 1.4);
  return -SEA_Y * ((127 - b) / 127);
}

/** Undo the per-row delta coding of the committed file. */
export function undelta(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    let prev = 0;
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      prev = (prev + src[i]) & 255;
      out[i] = prev;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// World coordinates: equirectangular at the corridor's mid-latitude, east = +x, north = −z.
// ---------------------------------------------------------------------------------------------
const LON_C = 46.5;
const LAT_C = 20.5;
const KX = Math.cos((LAT_C * Math.PI) / 180);
const SCALE = 1 / 14.5;

export function toWorld(lon: number, lat: number, y = 0): [number, number, number] {
  return [(lon - LON_C) * KX * SCALE, y, -(lat - LAT_C) * SCALE];
}

// ---------------------------------------------------------------------------------------------
// Camera. The poster is the rest pose drawn into a POSTER_W × POSTER_H viewBox with
// preserveAspectRatio "xMidYMid slice"; the WebGL camera reproduces exactly that crop at any size.
// ---------------------------------------------------------------------------------------------
export const POSTER_W = 1440;
export const POSTER_H = 440;
const ASPECT0 = POSTER_W / POSTER_H;
const FOV0 = (24 * Math.PI) / 180;
const TARGET: [number, number, number] = [0.0, 0, 0.0];
const DIST = 3.05;
/** Rest pose: seen from the south, 50° above the horizon. */
export const REST = { az: 0, el: (50 * Math.PI) / 180 } as const;

/** Camera drift (System: "a few degrees for at most 5 s, then rests"). */
export const DRIFT_MS = 5000;
const DRIFT_AZ = (-5 * Math.PI) / 180;
const DRIFT_EL = (4 * Math.PI) / 180;

/**
 * Camera pose `elapsedMs` after the drift started. Reduced motion: the rest pose at once (and
 * `done`), so a caller renders one static frame and never starts an animation loop.
 */
export function cameraPose(elapsedMs: number, opts: { reducedMotion: boolean }): { az: number; el: number; done: boolean } {
  if (opts.reducedMotion || !(elapsedMs < DRIFT_MS)) return { az: REST.az, el: REST.el, done: true };
  const t = Math.max(0, elapsedMs) / DRIFT_MS;
  const k = Math.pow(1 - t, 3); // ease-out: settles into the rest pose (the poster)
  return { az: REST.az + DRIFT_AZ * k, el: REST.el + DRIFT_EL * k, done: false };
}

export type Mat4 = Float32Array;

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function lookAt(eye: number[], target: number[]): Mat4 {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  // up = +y
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  l = Math.hypot(xx, xy, xz);
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Vertical field of view for a viewport: fixed up to the poster's aspect, then fixed horizontally. */
export function fovFor(aspect: number): number {
  return aspect <= ASPECT0 ? FOV0 : 2 * Math.atan((Math.tan(FOV0 / 2) * ASPECT0) / aspect);
}

export function viewProjection(aspect: number, pose: { az: number; el: number } = REST): Mat4 {
  const ce = Math.cos(pose.el);
  const eye = [
    TARGET[0] + DIST * Math.sin(pose.az) * ce,
    TARGET[1] + DIST * Math.sin(pose.el),
    TARGET[2] + DIST * Math.cos(pose.az) * ce,
  ];
  return mul(perspective(fovFor(aspect), aspect, 0.1, 10), lookAt(eye, TARGET));
}

/** World point → poster pixel (rest pose, POSTER_W × POSTER_H). */
export function projectToPoster(p: [number, number, number], vp: Mat4 = viewProjection(ASPECT0)): [number, number] {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  return [((x / w + 1) / 2) * POSTER_W, ((1 - y / w) / 2) * POSTER_H];
}

/** Poster pixel → world point on the sea-level plane (y = 0), rest pose. Inverse of projectToPoster. */
export function unprojectFromPoster(sx: number, sy: number, vp: Mat4 = viewProjection(ASPECT0)): [number, number, number] {
  const nx = (sx / POSTER_W) * 2 - 1;
  const ny = 1 - (sy / POSTER_H) * 2;
  // Solve for (x, z) on y = 0: [a b; c d] [x z]^T = rhs, from x_clip − nx·w = 0 and y_clip − ny·w = 0.
  const a = vp[0] - nx * vp[3];
  const b = vp[8] - nx * vp[11];
  const c = vp[1] - ny * vp[3];
  const d = vp[9] - ny * vp[11];
  const r1 = -(vp[12] - nx * vp[15]);
  const r2 = -(vp[13] - ny * vp[15]);
  const det = a * d - b * c;
  return [(r1 * d - b * r2) / det, 0, (a * r2 - c * r1) / det];
}

// ---------------------------------------------------------------------------------------------
// Lanes: schematic route lines (lon, lat) along the usual sea lanes. Geometry only: no vessels,
// no traffic, no numbers. `canal: true` points may sit on land at this resolution (the Suez Canal
// is ~300 m wide; one grid cell is ~16 km).
// ---------------------------------------------------------------------------------------------
export type ReliefLaneId = 'hormuz' | 'bam_redsea' | 'suez';
export interface LanePoint { lon: number; lat: number; canal?: boolean }

export const RELIEF_LANES: Record<ReliefLaneId, LanePoint[]> = {
  // The Gulf → Strait of Hormuz → Gulf of Oman.
  hormuz: [
    { lon: 49.6, lat: 28.6 },
    { lon: 50.9, lat: 27.5 },
    { lon: 52.6, lat: 26.6 },
    { lon: 54.6, lat: 26.3 },
    { lon: 56.3, lat: 26.55 },
    { lon: 57.1, lat: 25.6 },
    { lon: 58.6, lat: 24.3 },
    { lon: 59.9, lat: 22.9 },
  ],
  // Bab al-Mandeb → Red Sea → Strait of Gubal.
  bam_redsea: [
    { lon: 43.45, lat: 12.55 },
    { lon: 42.75, lat: 13.6 },
    { lon: 41.6, lat: 15.4 },
    { lon: 39.9, lat: 18.0 },
    { lon: 38.3, lat: 21.0 },
    { lon: 36.5, lat: 24.0 },
    { lon: 34.9, lat: 26.4 },
    { lon: 33.95, lat: 27.6 },
  ],
  // Gulf of Suez → Suez Canal → Port Said.
  suez: [
    { lon: 33.95, lat: 27.6 },
    { lon: 33.05, lat: 28.75 },
    { lon: 32.6, lat: 29.75 },
    { lon: 32.55, lat: 29.95, canal: true },
    { lon: 32.35, lat: 30.55, canal: true },
    { lon: 32.33, lat: 31.25, canal: true },
  ],
};

/** Gulf of Oman → Arabian Sea → Gulf of Aden → Bab al-Mandeb: joins the lanes; not a status lane. */
export const RELIEF_CONNECTOR: LanePoint[] = [
  { lon: 59.9, lat: 22.9 },
  { lon: 58.4, lat: 19.6 },
  { lon: 55.6, lat: 16.0 },
  { lon: 52.4, lat: 13.6 },
  { lon: 48.5, lat: 12.6 },
  { lon: 45.4, lat: 12.15 },
  { lon: 43.45, lat: 12.55 },
];

// ---------------------------------------------------------------------------------------------
// Status → lane style. Same tokens as StatusChip (--status-*), and the same rule as CorridorStrip:
// anything but a CURRENT view prints UNKNOWN, so the relief shows every lane neutral and dashed.
// ---------------------------------------------------------------------------------------------
export type ReliefStatus = 'NORMAL' | 'ELEVATED' | 'DISRUPTED' | 'CLOSED' | 'UNKNOWN';
const KNOWN: readonly ReliefStatus[] = ['NORMAL', 'ELEVATED', 'DISRUPTED', 'CLOSED'];

export interface ReliefLaneStyle {
  status: ReliefStatus;
  /** CSS custom property holding the colour (theme-aware, the StatusChip token). */
  colorVar: `--status-${Lowercase<ReliefStatus>}`;
  /** UNKNOWN is dashed, like the UNKNOWN chip's dashed border. */
  dashed: boolean;
}

export interface ReliefStatusInput {
  state: 'current' | 'stale' | 'withheld';
  lanes: ReadonlyArray<{ id: string; status: string }>;
}

export function laneStyle(status: ReliefStatus): ReliefLaneStyle {
  return { status, colorVar: `--status-${status.toLowerCase() as Lowercase<ReliefStatus>}`, dashed: status === 'UNKNOWN' };
}

export function reliefLaneStyles(view: ReliefStatusInput | null | undefined): Record<ReliefLaneId, ReliefLaneStyle> {
  const current = view?.state === 'current';
  const pick = (id: ReliefLaneId): ReliefStatus => {
    if (!current) return 'UNKNOWN';
    const s = view!.lanes.find((l) => l.id === id)?.status;
    return (KNOWN as readonly string[]).includes(s ?? '') ? (s as ReliefStatus) : 'UNKNOWN';
  };
  return { hormuz: laneStyle(pick('hormuz')), bam_redsea: laneStyle(pick('bam_redsea')), suez: laneStyle(pick('suez')) };
}

/** Neutral used before any status is known (and for the connector, which is not a status lane). */
export const NEUTRAL_STYLES: Record<ReliefLaneId, ReliefLaneStyle> = reliefLaneStyles(null);
