/**
 * Home hero corridor relief (components/home/relief/, lib/hero-3d.ts, HeroScene):
 *   1. Budget: relief chunks (gzip) + the committed heightfield ≤ 60 KB, measured from the build
 *      output (.next), and none of those chunks is in the home page's initial load (lazy).
 *   2. Status colours: lanes take the StatusChip tokens from lib/corridors.ts; stale / withheld →
 *      every lane UNKNOWN, neutral and dashed (CorridorStrip parity); no other colour in the poster.
 *   3. Reduced motion: no WebGL, a static poster with no transition, a camera that never moves.
 *   4. No WebGL: the poster renders (never a blank box); software renderers stay rejected.
 *   5. Honesty / map rules: no text in the relief, never mirrored, lanes over open sea.
 *
 *   npx --yes tsx tests/unit/hero-relief.check.ts
 *
 * The budget part needs `npm run build` first. Without .next it prints SKIP (CI runs unit tests
 * before the build); RELIEF_REQUIRE_BUILD=1 turns a missing build into a failure.
 */
import '../helpers/render-env';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import latestJson from '../../data/chokepoints/latest.json';
import { buildCorridors } from '../../lib/corridors';
import { hero3DDecision, heroReliefMode, isSoftwareRenderer, type Hero3DEnv } from '../../lib/hero-3d';
import {
  DRIFT_MS,
  GRID,
  HEIGHTFIELD_URL,
  REST,
  RELIEF_CONNECTOR,
  RELIEF_LANES,
  cameraPose,
  decodeHeight,
  projectToPoster,
  reliefLaneStyles,
  toWorld,
  undelta,
  unprojectFromPoster,
} from '../../components/home/relief/model';
import { POSTER_COAST } from '../../components/home/relief/poster.generated';
import { ReliefPoster } from '../../components/home/relief/ReliefPoster';
import { ReliefLayer } from '../../components/home/relief/ReliefLayer';
import { HeroScene } from '../../components/home/HeroScene';

const ROOT = resolve(__dirname, '../..');
const BUDGET_BYTES = 60 * 1024;

let failed = 0;
let n = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    n++;
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split('\n').slice(0, 4).join('\n     ') : String(err)}`);
  }
}

const capable: Hero3DEnv = { reducedMotion: false, saveData: false, deviceMemoryGb: 8, webgl: true, viewportWidth: 1440, cores: 8 };
const CURRENT_NOW = new Date('2026-10-14T12:00:00Z'); // latest.json: as_of 8 Oct, week ends 4 Oct
const STALE_NOW = new Date('2026-11-30T12:00:00Z');

// ---- 1. Budget -----------------------------------------------------------------------------------
const binPath = join(ROOT, 'public', HEIGHTFIELD_URL);
check('heightfield asset is committed, gzip, and small (≤ 25 KB)', () => {
  const b = readFileSync(binPath);
  assert.equal(b[0], 0x1f);
  assert.equal(b[1], 0x8b);
  assert.ok(b.length <= 25 * 1024, `heightfield is ${b.length} B`);
});

const chunksDir = join(ROOT, '.next/static/chunks');
if (!existsSync(chunksDir)) {
  if (process.env.RELIEF_REQUIRE_BUILD === '1') check('build output present', () => assert.fail('no .next/static/chunks: run npm run build'));
  else console.log('SKIP budget: no .next build output (run npm run build first, or set RELIEF_REQUIRE_BUILD=1)');
} else {
  check(`relief transfer (lazy chunks gzip + heightfield) ≤ ${BUDGET_BYTES / 1024} KB, none in the initial load`, () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.js')) files.push(p);
      }
    };
    walk(chunksDir);
    const glSrc = readFileSync(join(ROOT, 'components/home/relief/relief-gl.ts'), 'utf8');
    const markers: Record<string, string> = {
      'WebGL renderer': 'fract(e*k)>.55',
      'relief layer': HEIGHTFIELD_URL,
      'poster geometry': POSTER_COAST.slice(0, 48),
      'lane status (lib/corridors)': 'chokepoints-history/v1',
    };
    assert.ok(glSrc.includes(markers['WebGL renderer']), 'marker no longer in relief-gl.ts: update the test');
    const found = new Map<string, number>();
    for (const [what, m] of Object.entries(markers)) {
      const hits = files.filter((f) => readFileSync(f, 'utf8').includes(m));
      assert.ok(hits.length > 0, `${what} not found in the build output: the measurement would be wrong`);
      for (const f of hits) found.set(f, gzipSync(readFileSync(f), { level: 9 }).length);
    }
    const manifest = JSON.parse(readFileSync(join(ROOT, '.next/app-build-manifest.json'), 'utf8')) as { pages: Record<string, string[]> };
    const initial = new Set([...(manifest.pages['/page'] ?? []), ...(manifest.pages['/layout'] ?? [])].map((f) => join(ROOT, '.next', f)));
    for (const f of found.keys()) assert.ok(!initial.has(f), `${f} is in the home page's initial load (must be lazy)`);
    const chunkBytes = [...found.values()].reduce((a, b) => a + b, 0);
    const bin = statSync(binPath).size;
    const total = chunkBytes + bin;
    console.log(`     relief chunks ${[...found.keys()].map((f) => f.split('/').pop()).join(', ')}: ${chunkBytes} B gzip; heightfield ${bin} B; total ${total} B`);
    assert.ok(total <= BUDGET_BYTES, `relief transfer ${total} B > ${BUDGET_BYTES} B`);
  });
}

// ---- 2. Status colours ---------------------------------------------------------------------------
check('current view: lanes take their published status and the StatusChip token, solid', () => {
  const v = buildCorridors(latestJson, null, CURRENT_NOW);
  assert.equal(v.state, 'current');
  const s = reliefLaneStyles(v);
  for (const lane of v.lanes) {
    const st = s[lane.id as keyof typeof s];
    assert.equal(st.status, lane.status, `${lane.id}: relief ${st.status}, strip ${lane.status}`);
    assert.equal(st.colorVar, `--status-${lane.status.toLowerCase()}`);
    assert.equal(st.dashed, false);
  }
  assert.equal(s.hormuz.status, 'DISRUPTED');
  assert.equal(s.suez.colorVar, '--status-elevated');
});

check('stale view: every lane UNKNOWN, --status-unknown, dashed (as the CorridorStrip prints it)', () => {
  const v = buildCorridors(latestJson, null, STALE_NOW);
  assert.equal(v.state, 'stale');
  const s = reliefLaneStyles(v);
  for (const id of ['hormuz', 'bam_redsea', 'suez'] as const) {
    assert.deepEqual(s[id], { status: 'UNKNOWN', colorVar: '--status-unknown', dashed: true });
    assert.equal(v.lanes.find((l) => l.id === id)?.status, 'UNKNOWN');
  }
});

check('not current: UNKNOWN even if lane statuses are still filled in (the relief checks the state itself)', () => {
  const lanes = [{ id: 'hormuz', status: 'DISRUPTED' }, { id: 'bam_redsea', status: 'DISRUPTED' }, { id: 'suez', status: 'ELEVATED' }];
  for (const state of ['stale', 'withheld'] as const) {
    const s = reliefLaneStyles({ state, lanes });
    for (const id of ['hormuz', 'bam_redsea', 'suez'] as const) assert.equal(s[id].status, 'UNKNOWN', `${state} ${id}`);
  }
});

check('withheld view, missing view, unknown status word: UNKNOWN, never a guess', () => {
  const broken = { ...latestJson, lanes: latestJson.lanes.slice(0, 2) };
  const v = buildCorridors(broken, null, CURRENT_NOW);
  assert.equal(v.state, 'withheld');
  assert.equal(reliefLaneStyles(v).suez.status, 'UNKNOWN');
  assert.equal(reliefLaneStyles(null).hormuz.status, 'UNKNOWN');
  const odd = reliefLaneStyles({ state: 'current', lanes: [{ id: 'hormuz', status: 'BLOCKADED' }] });
  assert.equal(odd.hormuz.status, 'UNKNOWN');
  assert.equal(odd.bam_redsea.status, 'UNKNOWN');
});

check('every status token the relief uses is defined in app/globals.css', () => {
  const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
  for (const s of ['normal', 'elevated', 'disrupted', 'closed', 'unknown']) assert.match(css, new RegExp(`--status-${s}:\\s*#`));
});

check('poster colours: only tokens (lanes = status tokens), no hex or other colour', () => {
  const html = renderToStaticMarkup(h(ReliefPoster, { styles: reliefLaneStyles(buildCorridors(latestJson, null, CURRENT_NOW)) }));
  const strokes = [...html.matchAll(/stroke="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(strokes.length >= 6);
  for (const s of strokes) assert.match(s, /^var\(--(line|muted|status-(normal|elevated|disrupted|closed|unknown))\)$/, s);
  assert.match(html, /data-lane="hormuz"[^>]*data-status="DISRUPTED"|data-status="DISRUPTED"/);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(html), 'hex colour in poster');
  const stale = renderToStaticMarkup(h(ReliefPoster, { styles: reliefLaneStyles(buildCorridors(latestJson, null, STALE_NOW)) }));
  assert.equal((stale.match(/stroke="var\(--status-unknown\)"/g) ?? []).length, 3);
  assert.equal((stale.match(/data-lane="[a-z_]+" data-status="UNKNOWN"|data-status="UNKNOWN"/g) ?? []).length, 3);
});

// ---- 3. Reduced motion ---------------------------------------------------------------------------
check('reduced motion: no WebGL (static poster), camera at rest from t = 0, no fade', () => {
  assert.deepEqual(hero3DDecision({ ...capable, reducedMotion: true }), { render: false, reason: 'reduced-motion' });
  assert.equal(heroReliefMode({ ...capable, reducedMotion: true }), 'poster');
  for (const t of [0, 16, 1000, DRIFT_MS - 1]) {
    assert.deepEqual(cameraPose(t, { reducedMotion: true }), { az: REST.az, el: REST.el, done: true });
  }
  const html = renderToStaticMarkup(h(ReliefLayer, { gl: false, reducedMotion: true }));
  assert.match(html, /<svg[^>]*data-relief-poster/);
  assert.ok(!/transition/.test(html), 'a transition with reduced motion');
  assert.match(html, /opacity:1/);
  assert.ok(!html.includes('<canvas'), 'canvas with reduced motion');
});

check('motion: drift is a few degrees, ends within DRIFT_MS on the rest pose (the poster view)', () => {
  const p0 = cameraPose(0, { reducedMotion: false });
  assert.equal(p0.done, false);
  assert.ok(Math.abs(p0.az - REST.az) <= (6 * Math.PI) / 180 && Math.abs(p0.el - REST.el) <= (6 * Math.PI) / 180);
  assert.ok(DRIFT_MS <= 5000);
  assert.deepEqual(cameraPose(DRIFT_MS, { reducedMotion: false }), { az: REST.az, el: REST.el, done: true });
});

// ---- 4. No WebGL ---------------------------------------------------------------------------------
check('no WebGL / software renderer: poster mode, poster rendered, no canvas; Save-Data: gradient only', () => {
  assert.equal(heroReliefMode({ ...capable, webgl: false }), 'poster');
  assert.equal(heroReliefMode({ ...capable, viewportWidth: 390 }), 'poster');
  assert.equal(heroReliefMode({ ...capable, saveData: true }), 'none');
  assert.equal(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), true);
  const html = renderToStaticMarkup(h(ReliefLayer, { gl: false, reducedMotion: false }));
  assert.match(html, /<svg[^>]*data-relief-poster/);
  assert.match(html, /data-lane="hormuz"/);
  assert.ok(!html.includes('<canvas'));
  const withGl = renderToStaticMarkup(h(ReliefLayer, { gl: true, reducedMotion: false }));
  assert.match(withGl, /data-relief-poster/, 'the poster stays under the canvas until its first frame');
  assert.match(withGl, /<canvas/);
});

check('HeroScene first render: the gradient box (aria-hidden, fixed size) is always there', () => {
  const html = renderToStaticMarkup(h(HeroScene));
  assert.match(html, /<div class="hero-scene" aria-hidden="true" data-hero-3d="off"><\/div>/);
});

// ---- 5. Honesty and map rules ----------------------------------------------------------------------
check('no text in the relief, never mirrored', () => {
  const html = renderToStaticMarkup(h(ReliefLayer, { gl: true, reducedMotion: false }));
  assert.ok(!/<text|<tspan|<title/.test(html), 'text inside the relief');
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /direction:ltr/);
  for (const f of ['ReliefPoster.tsx', 'ReliefLayer.tsx', 'relief-gl.ts']) {
    const src = readFileSync(join(ROOT, 'components/home/relief', f), 'utf8');
    assert.ok(!/scaleX\(\s*-1|scale\(\s*-1|rtl:|\[dir=['"]?rtl/.test(src), `${f} mirrors`);
    assert.ok(!/fillText|strokeText|<text/.test(src), `${f} draws text`);
  }
});

check('lane points lie over open sea in the committed heightfield (canal points excepted)', () => {
  const raw = gunzipSync(readFileSync(binPath));
  const w = raw[3] | (raw[4] << 8);
  const hh = raw[5] | (raw[6] << 8);
  assert.equal(w, GRID.w);
  assert.equal(hh, GRID.h);
  const b = undelta(raw.subarray(7), w, hh);
  const y = (r: number, c: number) => decodeHeight(b[Math.min(hh - 1, r) * w + Math.min(w - 1, c)]);
  for (const pts of [...Object.values(RELIEF_LANES), RELIEF_CONNECTOR]) {
    for (const p of pts) {
      if (p.canal) continue;
      const c = (p.lon - GRID.lon0) / GRID.step;
      const r = (GRID.latN - p.lat) / GRID.step;
      const c0 = Math.floor(c);
      const r0 = Math.floor(r);
      const fc = c - c0;
      const fr = r - r0;
      const v = (y(r0, c0) * (1 - fc) + y(r0, c0 + 1) * fc) * (1 - fr) + (y(r0 + 1, c0) * (1 - fc) + y(r0 + 1, c0 + 1) * fc) * fr;
      assert.ok(v < 0, `${p.lon},${p.lat} is on land`);
    }
  }
});

check('poster and WebGL share one camera: project → unproject round-trips', () => {
  for (const [lon, lat] of [[32.3, 31.2], [43.4, 12.6], [56.3, 26.5], [46.5, 20.5]]) {
    const p = toWorld(lon, lat, 0);
    const [sx, sy] = projectToPoster(p);
    const q = unprojectFromPoster(sx, sy);
    assert.ok(Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[2] - p[2]) < 1e-6, `${lon},${lat}`);
  }
});

console.log(`\n${n} passed, ${failed} failed`);
if (failed) process.exit(1);
