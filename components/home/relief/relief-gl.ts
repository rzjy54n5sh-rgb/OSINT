/**
 * Corridor relief, WebGL 1 renderer (raw WebGL: no three.js, per the System artboard's 3D budget).
 * Loaded only by ReliefLayer, after first paint and idle, and only when lib/hero-3d.ts says the
 * device may run it (hardware WebGL, ≥ 768 px, ≥ 4 cores, ≥ 4 GB, no reduced motion, no Save-Data).
 *
 * Draws one heightfield mesh (ETOPO1, see model.ts), the 5° graticule, the coastline and the lane
 * ribbons, all at sea level, from the same camera as the static poster. Motion: the camera drifts a
 * few degrees for at most DRIFT_MS and settles on the poster's view, then the loop stops (a frame is
 * drawn again only on resize or a theme change). The drift clock pauses while the tab is hidden or the
 * hero is off-screen. Colours come from the CSS tokens (--status-*, --line, --muted, --surface ...),
 * so lanes are the StatusChip colours in either theme. No text, no vessels, no numbers.
 */
import { isSoftwareRenderer } from '@/lib/hero-3d';
import {
  GRID,
  HEIGHTFIELD_MAGIC,
  RELIEF_CONNECTOR,
  RELIEF_LANES,
  cameraPose,
  decodeHeight,
  toWorld,
  undelta,
  unprojectFromPoster,
  viewProjection,
  type LanePoint,
  type ReliefLaneId,
  type ReliefLaneStyle,
} from './model';
import { POSTER_COAST, POSTER_GRATICULE } from './poster.generated';

/** Decodes the committed heightfield (gzip unless the server already decoded it). Throws on mismatch. */
export async function decodeHeightfield(buf: ArrayBuffer): Promise<Uint8Array> {
  let b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    const ds = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
    b = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  const w = b[3] | (b[4] << 8);
  const h = b[5] | (b[6] << 8);
  if (b[0] !== HEIGHTFIELD_MAGIC[0] || b[1] !== HEIGHTFIELD_MAGIC[1] || b[2] !== HEIGHTFIELD_MAGIC[2]) throw new Error('bad magic');
  if (w !== GRID.w || h !== GRID.h || b.length !== 7 + w * h) throw new Error('bad size');
  return undelta(b.subarray(7), w, h);
}

type RGB = [number, number, number];

/** "#rgb", "#rrggbb" or "rgb(a)(r, g, b ...)" → 0–1 floats; null when unparseable. */
export function parseCssColor(v: string): RGB | null {
  const s = v.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16) / 255) as RGB;
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as RGB;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)) / 255) as RGB;
  return null;
}

const VS_T = `attribute vec3 p;attribute vec3 q;uniform mat4 m;varying vec3 v;void main(){v=q;gl_Position=m*vec4(p,1.);}`;
const FS_T = `precision mediump float;varying vec3 v;uniform vec3 l0,l1,s0,s1;void main(){
vec3 c=v.y>0.?mix(l0,l1,v.x):mix(s0,s1,-v.y)*(.8+.4*v.x);float a=(v.y>0.?.92:.7)*v.z;gl_FragColor=vec4(c*a,a);}`;
const VS_L = `attribute vec3 p;attribute float d;uniform mat4 m;varying float e;void main(){e=d;gl_Position=m*vec4(p,1.);}`;
const FS_L = `precision mediump float;varying float e;uniform vec4 c;uniform float k;void main(){
if(k>0.&&fract(e*k)>.55)discard;gl_FragColor=vec4(c.rgb*c.a,c.a);}`;

interface Mesh { buf: WebGLBuffer; n: number; mode: number; idx?: WebGLBuffer }

export interface ReliefController {
  setStyles(styles: Record<ReliefLaneId, ReliefLaneStyle>): void;
  destroy(): void;
}

export function startRelief(
  canvas: HTMLCanvasElement,
  opts: {
    heights: Uint8Array;
    styles: Record<ReliefLaneId, ReliefLaneStyle>;
    reducedMotion: boolean;
    onReady: () => void;
    onFail: () => void;
  },
): ReliefController {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    depth: true,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) throw new Error('no webgl');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  if (isSoftwareRenderer(typeof renderer === 'string' ? renderer : null)) throw new Error('software renderer');

  const prog = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    return p;
  };
  const pT = prog(VS_T, FS_T);
  const pL = prog(VS_L, FS_L);
  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  // ---- terrain: interleaved [x, y, z, shade, landOrDepth, edgeFade] -----------------------------
  const { w: W, h: H } = GRID;
  const ys = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) ys[i] = decodeHeight(opts.heights[i]);
  const [x0, , z0] = toWorld(GRID.lon0, GRID.latN);
  const [x1, , z1] = toWorld(GRID.lon0 + GRID.step, GRID.latN - GRID.step);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = [-0.55, 0.72, -0.42];
  const ln = Math.hypot(L[0], L[1], L[2]);
  const tv = new Float32Array(W * H * 6);
  const EDGE = 14; // cells over which the slab fades out at the grid edge (no hard rectangle)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      const y = ys[i];
      const gx = (ys[r * W + Math.min(W - 1, c + 1)] - ys[r * W + Math.max(0, c - 1)]) / (2 * dx);
      const gz = (ys[Math.min(H - 1, r + 1) * W + c] - ys[Math.max(0, r - 1) * W + c]) / (2 * dz);
      const nl = Math.hypot(gx, 1, gz);
      const shade = Math.max(0, (-gx * L[0] + L[1] - gz * L[2]) / (nl * ln));
      const o = i * 6;
      tv[o] = x0 + c * dx;
      tv[o + 1] = y;
      tv[o + 2] = z0 + r * dz;
      tv[o + 3] = shade;
      tv[o + 4] = opts.heights[i] >= 128 ? 1 : -Math.max(0.05, (127 - opts.heights[i]) / 127);
      const e = Math.min(1, Math.min(c, W - 1 - c, r, H - 1 - r) / EDGE);
      tv[o + 5] = e * e * (3 - 2 * e);
    }
  }
  const idx = new Uint16Array((W - 1) * (H - 1) * 6);
  let k = 0;
  for (let r = 0; r < H - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      const a = r * W + c;
      idx.set([a, a + W, a + 1, a + 1, a + W, a + W + 1], k);
      k += 6;
    }
  }
  const mk = (data: Float32Array, n: number, mode: number, index?: Uint16Array): Mesh => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let ib: WebGLBuffer | undefined;
    if (index) {
      ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    }
    return { buf, n, mode, idx: ib };
  };
  const terrain = mk(tv, idx.length, gl.TRIANGLES, idx);

  // ---- lines [x, y, z, dist]: coast + graticule from the poster paths, unprojected to y = 0 --------
  const pathLines = (d: string): Float32Array => {
    const out: number[] = [];
    for (const part of d.split('M')) {
      const n = part.trim().split(/\s+/).map(Number);
      for (let i = 0; i + 3 < n.length; i += 2) {
        const a = unprojectFromPoster(n[i], n[i + 1]);
        const b = unprojectFromPoster(n[i + 2], n[i + 3]);
        out.push(a[0], 0, a[2], 0, b[0], 0, b[2], 0);
      }
    }
    return new Float32Array(out);
  };
  const coastData = pathLines(POSTER_COAST);
  const gratData = pathLines(POSTER_GRATICULE);
  const coast = mk(coastData, coastData.length / 4, gl.LINES);
  const grat = mk(gratData, gratData.length / 4, gl.LINES);

  // ---- lane ribbons (triangle strips at sea level; width in world units) -------------------------
  const ribbon = (pts: LanePoint[], half: number): Mesh => {
    const P = pts.map((p) => toWorld(p.lon, p.lat, 0.002));
    const out: number[] = [];
    let dist = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(P.length - 1, i + 1)];
      const tx = b[0] - a[0];
      const tz = b[2] - a[2];
      const tl = Math.hypot(tx, tz) || 1;
      if (i > 0) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
      const nx = (-tz / tl) * half;
      const nz = (tx / tl) * half;
      out.push(P[i][0] + nx, P[i][1], P[i][2] + nz, dist, P[i][0] - nx, P[i][1], P[i][2] - nz, dist);
    }
    return mk(new Float32Array(out), out.length / 4, gl.TRIANGLE_STRIP);
  };
  const lanes = (Object.keys(RELIEF_LANES) as ReliefLaneId[]).map((id) => ({ id, mesh: ribbon(RELIEF_LANES[id], 0.0065) }));
  const connector = ribbon(RELIEF_CONNECTOR, 0.0035);

  // ---- colours from the CSS tokens -----------------------------------------------------------------
  let styles = opts.styles;
  let pal: Record<string, RGB> = {};
  const readPalette = () => {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fb: RGB): RGB => parseCssColor(cs.getPropertyValue(name)) ?? fb;
    const grey: RGB = [0.6, 0.65, 0.7];
    pal = {
      bg: get('--bg', [0.04, 0.06, 0.08]),
      surface: get('--surface', [0.07, 0.1, 0.14]),
      surface2: get('--surface-2', [0.11, 0.15, 0.2]),
      line: get('--line', [0.14, 0.19, 0.25]),
      lineStrong: get('--line-strong', [0.23, 0.28, 0.34]),
      muted: get('--muted', grey),
      text2: get('--text-2', grey),
    };
    for (const s of ['normal', 'elevated', 'disrupted', 'closed', 'unknown']) pal[s] = get(`--status-${s}`, grey);
  };
  readPalette();

  // ---- draw -------------------------------------------------------------------------------------
  const bindAttrs = (p: WebGLProgram, m: Mesh, layout: [string, number][]) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const stride = layout.reduce((s, [, n]) => s + n, 0) * 4;
    let off = 0;
    for (const [name, n] of layout) {
      const loc = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off);
      off += n * 4;
    }
  };
  const lineDraw = (m: Mesh, rgb: RGB, a: number, dash: number) => {
    gl.uniform4f(u(pL, 'c'), rgb[0], rgb[1], rgb[2], a);
    gl.uniform1f(u(pL, 'k'), dash);
    bindAttrs(pL, m, [['p', 3], ['d', 1]]);
    gl.drawArrays(m.mode, 0, m.n);
  };

  let pose = cameraPose(0, { reducedMotion: opts.reducedMotion });
  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const vp = viewProjection(cw / ch, pose);

    gl.useProgram(pT);
    gl.uniformMatrix4fv(u(pT, 'm'), false, vp);
    gl.uniform3fv(u(pT, 'l0'), pal.surface2);
    gl.uniform3fv(u(pT, 'l1'), pal.lineStrong);
    gl.uniform3fv(u(pT, 's0'), pal.surface);
    gl.uniform3fv(u(pT, 's1'), pal.bg);
    gl.enable(gl.DEPTH_TEST);
    bindAttrs(pT, terrain, [['p', 3], ['q', 3]]);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrain.idx!);
    gl.drawElements(gl.TRIANGLES, terrain.n, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(pL);
    gl.uniformMatrix4fv(u(pL, 'm'), false, vp);
    lineDraw(grat, pal.line, 0.8, 0);
    lineDraw(coast, pal.text2, 0.55, 0);
    lineDraw(connector, pal.muted, 0.75, 40);
    for (const { id, mesh } of lanes) {
      const s = styles[id];
      lineDraw(mesh, pal[s.status.toLowerCase()], 0.95, s.dashed ? 28 : 0);
    }
  };

  // ---- drift loop: runs only while on screen and visible, stops for good once settled -------------
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let onScreen = true;
  let ready = false;
  const active = () => onScreen && !document.hidden;
  const frame = (now: number) => {
    raf = 0;
    if (!active()) {
      last = 0;
      return;
    }
    elapsed += last ? Math.min(now - last, 50) : 0;
    last = now;
    pose = cameraPose(elapsed, { reducedMotion: opts.reducedMotion });
    draw();
    if (!ready) {
      ready = true;
      opts.onReady();
    }
    if (!pose.done) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && active() && (!pose.done || !ready)) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => {
    onScreen = e?.isIntersecting ?? true;
    kick();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', kick);
  const ro = new ResizeObserver(() => {
    if (ready) draw();
  });
  ro.observe(canvas);
  // Theme switch ([data-theme] / class on <html>): re-read the tokens and redraw once.
  const mo = new MutationObserver(() => {
    readPalette();
    if (ready) draw();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  const lost = (e: Event) => {
    e.preventDefault();
    opts.onFail();
  };
  canvas.addEventListener('webglcontextlost', lost);
  kick();

  return {
    setStyles(next) {
      styles = next;
      if (ready) draw();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', kick);
      canvas.removeEventListener('webglcontextlost', lost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
