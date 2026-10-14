/**
 * Home hero corridor relief (components/home/relief/, lib/hero-3d.ts, HeroScene, app/page.tsx):
 *   1. Budget: every chunk reachable from HeroScene's lazy import (react-loadable-manifest chain,
 *      followed recursively, plus every webpack chunk those files load) + the heightfield ≤ 60 KB gzip,
 *      and none of the relief chunks is in the home page's initial load.
 *   2. Status: lanes take the StatusChip token of the SAME corridors view the strip renders (computed
 *      once in app/page.tsx); stale / withheld → UNKNOWN, neutral, dashed. Fixtures, not the live file,
 *      so a new Chokepoint Weekly never breaks this check.
 *   3. Reduced motion: HeroScene's decision, the poster, and the WebGL drift step.
 *   4. No WebGL: the poster renders (never a blank box); software renderers stay rejected.
 *   5. Honesty / map rules: no text, never mirrored, lanes over open sea, top fade off the text rows.
 *
 *   npx --yes tsx tests/unit/hero-relief.check.ts
 *
 * The budget needs `npm run build` first. Without .next it prints SKIP (PR CI runs unit tests before
 * the build); RELIEF_REQUIRE_BUILD=1 turns a missing build into a failure.
 */
import '../helpers/render-env';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import issue1 from '../../scripts/card/test/fixtures/chokepoints-issue1.json';
import malformedBundle from '../../scripts/card/test/fixtures/malformed.json';
import latestJson from '../../data/chokepoints/latest.json';
import { buildCorridors, type CorridorsView } from '../../lib/corridors';
import { hero3DDecision, heroReliefMode, heroSceneMode, isSoftwareRenderer, type Hero3DEnv } from '../../lib/hero-3d';
import {
  DRIFT_MS,
  GRID,
  HEIGHTFIELD_URL,
  NEUTRAL_STYLES,
  REST,
  RELIEF_CONNECTOR,
  RELIEF_LANES,
  cameraPose,
  decodeHeight,
  laneStyle,
  projectToPoster,
  reliefLaneStyles,
  toWorld,
  undelta,
  unprojectFromPoster,
  type ReliefLaneId,
} from '../../components/home/relief/model';
import { ReliefPoster } from '../../components/home/relief/ReliefPoster';
import { ReliefLayer } from '../../components/home/relief/ReliefLayer';
import { driftStep, laneDrawParams } from '../../components/home/relief/relief-gl';
import { HeroScene } from '../../components/home/HeroScene';
import { CorridorStrip } from '../../components/corridors/CorridorStrip';

const ROOT = resolve(__dirname, '../..');
const BUDGET_BYTES = 60 * 1024;
const IDS: readonly ReliefLaneId[] = ['hormuz', 'bam_redsea', 'suez'];

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
// Frozen fixture (Chokepoint Weekly #1, as_of 2026-10-08): current at 13 Oct, stale from 17 Oct.
const FIX_CURRENT = buildCorridors(issue1, null, new Date('2026-10-13T09:00:00Z'));
const FIX_STALE = buildCorridors(issue1, null, new Date('2026-10-17T00:01:00Z'));
const FIX_WITHHELD = buildCorridors((malformedBundle as { chokepoints: unknown }).chokepoints, null, new Date('2026-10-08T12:30:00Z'));
// The committed file, one hour after its own as_of (whatever issue it is) and 30 days later.
const liveAsOf = Date.parse((latestJson as { as_of: string }).as_of);
const LIVE_FRESH = buildCorridors(latestJson, null, new Date(liveAsOf + 3600_000));
const LIVE_OLD = buildCorridors(latestJson, null, new Date(liveAsOf + 30 * 86400_000));
const VIEWS: [string, CorridorsView][] = [
  ['fixture current', FIX_CURRENT],
  ['fixture stale', FIX_STALE],
  ['fixture withheld', FIX_WITHHELD],
  ['live file at as_of + 1 h', LIVE_FRESH],
  ['live file at as_of + 30 d', LIVE_OLD],
];

/** [lane, data-status, stroke, dasharray] for every lane path in some markup. */
function lanePaths(html: string): { lane: string; status: string; stroke: string; dashed: boolean }[] {
  return [...html.matchAll(/<path\b[^>]*\bdata-lane="([a-z_]+)"[^>]*>/g)].map((m) => {
    const tag = m[0];
    return {
      lane: m[1],
      status: /data-status="([A-Z]+)"/.exec(tag)?.[1] ?? '',
      stroke: /\bstroke="([^"]+)"/.exec(tag)?.[1] ?? '',
      dashed: /stroke-dasharray=/.test(tag),
    };
  });
}

// ---- 1. Budget -----------------------------------------------------------------------------------
const binPath = join(ROOT, 'public', HEIGHTFIELD_URL);
check('heightfield asset is committed, gzip, and small (≤ 25 KB)', () => {
  const b = readFileSync(binPath);
  assert.equal(b[0], 0x1f);
  assert.equal(b[1], 0x8b);
  assert.ok(b.length <= 25 * 1024, `heightfield is ${b.length} B`);
});

const NEXT = join(ROOT, '.next');
if (!existsSync(join(NEXT, 'react-loadable-manifest.json'))) {
  if (process.env.RELIEF_REQUIRE_BUILD === '1') check('build output present', () => assert.fail('no .next build output: run npm run build'));
  else console.log('SKIP budget: no .next build output (run npm run build first, or set RELIEF_REQUIRE_BUILD=1)');
} else {
  check(`relief transfer (whole lazy import graph from HeroScene, gzip + heightfield) ≤ ${BUDGET_BYTES / 1024} KB, none in the initial load`, () => {
    const loadable = JSON.parse(readFileSync(join(NEXT, 'react-loadable-manifest.json'), 'utf8')) as Record<string, { files: string[] }>;
    const appManifest = JSON.parse(readFileSync(join(NEXT, 'app-build-manifest.json'), 'utf8')) as { pages: Record<string, string[]> };
    const initial = new Set([...(appManifest.pages['/page'] ?? []), ...(appManifest.pages['/layout'] ?? [])]);
    // webpack runtime: chunk id → hashed file name.
    const runtimeFile = readdirSync(join(NEXT, 'static/chunks')).find((f) => /^webpack-.*\.js$/.test(f));
    assert.ok(runtimeFile, 'no webpack runtime chunk');
    const runtime = readFileSync(join(NEXT, 'static/chunks', runtimeFile!), 'utf8');
    const idToFile = new Map<string, string>();
    for (const obj of runtime.matchAll(/\{((?:\d+:"[0-9a-f]{8,}",?)+)\}/g)) {
      for (const m of obj[1].matchAll(/(\d+):"([0-9a-f]+)"/g)) {
        const f = `static/chunks/${m[1]}.${m[2]}.js`;
        if (existsSync(join(NEXT, f))) idToFile.set(m[1], f);
      }
    }
    // (a) react-loadable-manifest chain: "<importer> -> <request>", followed recursively from HeroScene.
    const stripExt = (p: string) => p.replace(/\.(tsx?|jsx?|mjs)$/, '');
    const resolveReq = (importer: string, req: string) =>
      req.startsWith('@/') ? req.slice(2) : req.startsWith('.') ? posix.normalize(posix.join(posix.dirname(importer), req)) : req;
    const files = new Set<string>();
    const seenMods = new Set<string>();
    const mods = ['components/home/HeroScene'];
    const edges: string[] = [];
    while (mods.length) {
      const mod = mods.pop()!;
      if (seenMods.has(mod)) continue;
      seenMods.add(mod);
      for (const [key, v] of Object.entries(loadable)) {
        const [importer, req] = key.split(' -> ');
        if (stripExt(importer) !== mod || !req) continue;
        edges.push(key);
        v.files.forEach((f) => files.add(f));
        mods.push(stripExt(resolveReq(importer, req)));
      }
    }
    assert.ok(edges.some((e) => e.endsWith('relief/ReliefLayer')), `HeroScene → ReliefLayer not in the manifest: ${edges.join('; ')}`);
    assert.ok(edges.some((e) => e.endsWith('./relief-gl')), `ReliefLayer → relief-gl not in the manifest: ${edges.join('; ')}`);
    for (const f of files) assert.ok(!initial.has(f), `${f} is in the home page's initial load (must be lazy)`);
    // (b) every chunk those files load in turn (webpack `.e(<id>)`), recursively.
    const queue = [...files];
    while (queue.length) {
      const f = queue.pop()!;
      const src = readFileSync(join(NEXT, f), 'utf8');
      for (const m of src.matchAll(/\.e\((\d+)\)/g)) {
        const g = idToFile.get(m[1]);
        if (g && !files.has(g) && !initial.has(g)) {
          files.add(g);
          queue.push(g);
        }
      }
    }
    const sizes = [...files].map((f) => [f, gzipSync(readFileSync(join(NEXT, f)), { level: 9 }).length] as const);
    const chunkBytes = sizes.reduce((a, [, b]) => a + b, 0);
    const bin = statSync(binPath).size;
    const total = chunkBytes + bin;
    console.log(`     ${sizes.map(([f, b]) => `${f.split('/').pop()} ${b} B`).join(', ')}; heightfield ${bin} B; total ${total} B`);
    assert.ok(total <= BUDGET_BYTES, `relief transfer ${total} B > ${BUDGET_BYTES} B`);
  });
}

// ---- 2. Status -----------------------------------------------------------------------------------
check('fixtures: current → each lane its own published status and token (from v.lanes), solid', () => {
  assert.equal(FIX_CURRENT.state, 'current');
  const s = reliefLaneStyles(FIX_CURRENT);
  for (const lane of FIX_CURRENT.lanes) {
    const st = s[lane.id as ReliefLaneId];
    assert.notEqual(lane.status, 'UNKNOWN');
    assert.equal(st.status, lane.status, `${lane.id}`);
    assert.equal(st.colorVar, `--status-${lane.status.toLowerCase()}`);
    assert.equal(st.dashed, false);
  }
});

check('fixtures: stale and withheld → every lane UNKNOWN, --status-unknown, dashed', () => {
  assert.equal(FIX_STALE.state, 'stale');
  assert.equal(FIX_WITHHELD.state, 'withheld');
  for (const v of [FIX_STALE, FIX_WITHHELD]) {
    for (const id of IDS) assert.deepEqual(reliefLaneStyles(v)[id], { status: 'UNKNOWN', colorVar: '--status-unknown', dashed: true });
  }
});

check('not current: UNKNOWN even if lane statuses are still filled in (the relief checks the state itself)', () => {
  const lanes = [{ id: 'hormuz', status: 'DISRUPTED' }, { id: 'bam_redsea', status: 'DISRUPTED' }, { id: 'suez', status: 'ELEVATED' }];
  for (const state of ['stale', 'withheld'] as const) {
    const s = reliefLaneStyles({ state, lanes });
    for (const id of IDS) assert.equal(s[id].status, 'UNKNOWN', `${state} ${id}`);
  }
  assert.equal(reliefLaneStyles(null).hormuz.status, 'UNKNOWN');
  assert.equal(reliefLaneStyles({ state: 'current', lanes: [{ id: 'hormuz', status: 'BLOCKADED' }] }).hormuz.status, 'UNKNOWN');
});

check('live file (any issue): relief = v.lanes one hour after its as_of; UNKNOWN 30 days later', () => {
  for (const v of [LIVE_FRESH, LIVE_OLD]) {
    const s = reliefLaneStyles(v);
    for (const lane of v.lanes) assert.equal(s[lane.id as ReliefLaneId].status, v.state === 'current' ? lane.status : 'UNKNOWN', lane.id);
  }
  assert.notEqual(LIVE_OLD.state, 'current');
});

check('strip and relief always show the same status per lane (same view, rendered)', () => {
  for (const [label, v] of VIEWS) {
    const strip = renderToStaticMarkup(h(CorridorStrip, { view: v, compact: true }));
    const stripStatuses = [...strip.matchAll(/class="chip-status" data-status="([A-Z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(stripStatuses, v.lanes.map((l) => l.status), `${label}: strip chips`);
    const relief = lanePaths(renderToStaticMarkup(h(ReliefLayer, { gl: false, reducedMotion: true, lanes: reliefLaneStyles(v) })));
    v.lanes.forEach((l, i) => {
      const p = relief.find((x) => x.lane === l.id);
      assert.ok(p, `${label}: no relief lane ${l.id}`);
      assert.equal(p!.status, stripStatuses[i], `${label}: ${l.id} relief ${p!.status} vs strip ${stripStatuses[i]}`);
    });
  }
});

check('one view per render: app/page.tsx feeds the strip and the relief from the same variable; no client clock', () => {
  const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
  const m = /const (\w+) = getCorridors\(/.exec(page);
  assert.ok(m, 'app/page.tsx does not compute the corridors view');
  assert.ok(page.includes(`<CorridorStrip view={${m![1]}}`), 'CorridorStrip does not get the shared view');
  assert.ok(page.includes(`reliefLanes={reliefLaneStyles(${m![1]})}`), 'relief lanes do not come from the shared view');
  assert.match(readFileSync(join(ROOT, 'app/HomeDashboard.tsx'), 'utf8'), /<HeroScene lanes=\{reliefLanes\} \/>/);
  const scene = readFileSync(join(ROOT, 'components/home/HeroScene.tsx'), 'utf8');
  assert.match(scene, /lanes=\{lanes\} \/>/);
  assert.match(scene, /^import type \{[^}]*\} from '@\/components\/home\/relief\/model';$/m, 'HeroScene must import the model as types only (initial chunk)');
  assert.equal(reliefLaneStyles(undefined).suez.status, 'UNKNOWN');
  for (const f of ['ReliefLayer.tsx', 'ReliefPoster.tsx', 'relief-gl.ts']) {
    const src = readFileSync(join(ROOT, 'components/home/relief', f), 'utf8');
    assert.ok(!/lib\/corridors|getCorridors|chokepoints\/latest/.test(src), `${f} reads the corridor file itself`);
  }
});

check('every status token the relief uses is defined in app/globals.css', () => {
  const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
  for (const s of ['normal', 'elevated', 'disrupted', 'closed', 'unknown']) assert.match(css, new RegExp(`--status-${s}:\\s*#`));
});

check('poster: each lane stroke === var(--status-<its data-status>), dashed only when UNKNOWN; no other colour', () => {
  for (const [label, v] of VIEWS) {
    const html = renderToStaticMarkup(h(ReliefPoster, { styles: reliefLaneStyles(v) }));
    const lanes = lanePaths(html);
    assert.deepEqual(lanes.map((l) => l.lane).sort(), [...IDS].sort(), label);
    for (const l of lanes) {
      assert.equal(l.stroke, `var(--status-${l.status.toLowerCase()})`, `${label} ${l.lane}`);
      assert.equal(l.dashed, l.status === 'UNKNOWN', `${label} ${l.lane} dash`);
    }
    for (const m of html.matchAll(/stroke="([^"]+)"/g)) {
      assert.match(m[1], /^var\(--(line|muted|status-(normal|elevated|disrupted|closed|unknown))\)$/, m[1]);
    }
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(html), 'hex colour in poster');
  }
});

check('ReliefLayer renders exactly the lanes it is given (known input)', () => {
  const lanes = { hormuz: laneStyle('CLOSED'), bam_redsea: laneStyle('NORMAL'), suez: laneStyle('UNKNOWN') };
  const got = lanePaths(renderToStaticMarkup(h(ReliefLayer, { gl: false, reducedMotion: false, lanes })));
  assert.deepEqual(
    got.map((l) => [l.lane, l.status, l.stroke, l.dashed]),
    [
      ['hormuz', 'CLOSED', 'var(--status-closed)', false],
      ['bam_redsea', 'NORMAL', 'var(--status-normal)', false],
      ['suez', 'UNKNOWN', 'var(--status-unknown)', true],
    ],
  );
});

check('WebGL lane colour / dash: the status token colour, dashed only for UNKNOWN', () => {
  const pal = { normal: [0, 1, 0], elevated: [1, 1, 0], disrupted: [1, 0.5, 0], closed: [1, 0, 0], unknown: [0.5, 0.5, 0.5] } as Record<
    string,
    [number, number, number]
  >;
  for (const s of ['NORMAL', 'ELEVATED', 'DISRUPTED', 'CLOSED', 'UNKNOWN'] as const) {
    const d = laneDrawParams(laneStyle(s), pal);
    assert.deepEqual(d.rgb, pal[s.toLowerCase()], s);
    assert.equal(d.dash > 0, s === 'UNKNOWN', `${s} dash`);
  }
  const glSrc = readFileSync(join(ROOT, 'components/home/relief/relief-gl.ts'), 'utf8');
  assert.match(glSrc, /const d = laneDrawParams\(styles\[id\], pal\);\s*lineDraw\(mesh, d\.rgb, d\.alpha, d\.dash\);/, 'renderer bypasses laneDrawParams');
});

// ---- 3. Reduced motion ---------------------------------------------------------------------------
check('reduced motion: HeroScene decision is poster-only, keeps the flag, never probes WebGL', () => {
  let probed = 0;
  const probe = () => (probed++, true);
  assert.deepEqual(heroSceneMode({ ...capable, reducedMotion: true, webgl: null }, probe), { gl: false, reducedMotion: true });
  assert.equal(probed, 0, 'probed WebGL under reduced motion');
  assert.deepEqual(heroSceneMode({ ...capable, webgl: null }, probe), { gl: true, reducedMotion: false });
  assert.equal(probed, 1);
  assert.deepEqual(hero3DDecision({ ...capable, reducedMotion: true }), { render: false, reason: 'reduced-motion' });
  const scene = readFileSync(join(ROOT, 'components/home/HeroScene.tsx'), 'utf8');
  assert.match(scene, /heroSceneMode\(readHero3DEnv\(/, 'HeroScene does not use heroSceneMode');
  assert.match(scene, /<ReliefLayer gl=\{mode\.gl\} reducedMotion=\{mode\.reducedMotion\}/, 'HeroScene drops the decision');
});

check('reduced motion: poster with no fade and no canvas; camera at rest from t = 0', () => {
  for (const t of [0, 16, 1000, DRIFT_MS - 1]) {
    assert.deepEqual(cameraPose(t, { reducedMotion: true }), { az: REST.az, el: REST.el, done: true });
  }
  const html = renderToStaticMarkup(h(ReliefLayer, { gl: false, reducedMotion: true, lanes: NEUTRAL_STYLES }));
  assert.match(html, /<svg[^>]*data-relief-poster/);
  assert.ok(!/transition/.test(html), 'a transition with reduced motion');
  assert.match(html, /<svg[^>]*opacity:1/);
  assert.ok(!html.includes('<canvas'), 'canvas with reduced motion');
});

check('reduced motion in the WebGL loop: one frame at rest, no further frames; the renderer passes the flag', () => {
  const clock = { elapsed: 0, last: 0 };
  const a = driftStep(clock, 1000, { active: true, reducedMotion: true });
  assert.deepEqual([a.draw, a.again, a.pose.az, a.pose.el], [true, false, REST.az, REST.el]);
  const b = driftStep({ elapsed: 0, last: 0 }, 1000, { active: true, reducedMotion: false });
  assert.equal(b.again, true, 'no drift without reduced motion');
  // Inactive (hidden tab / off-screen): no draw, the clock does not advance.
  const c = { elapsed: 500, last: 900 };
  assert.equal(driftStep(c, 5000, { active: false, reducedMotion: false }).draw, false);
  assert.equal(c.elapsed, 500);
  const glSrc = readFileSync(join(ROOT, 'components/home/relief/relief-gl.ts'), 'utf8');
  assert.match(glSrc, /driftStep\(clock, now, \{ active: active\(\), reducedMotion: opts\.reducedMotion \}\)/, 'renderer drops reducedMotion');
  assert.match(glSrc, /let pose = cameraPose\(0, \{ reducedMotion: opts\.reducedMotion \}\)/);
});

check('motion: drift is a few degrees, ends within DRIFT_MS on the rest pose (the poster view)', () => {
  const p0 = cameraPose(0, { reducedMotion: false });
  assert.equal(p0.done, false);
  assert.ok(Math.abs(p0.az - REST.az) <= (6 * Math.PI) / 180 && Math.abs(p0.el - REST.el) <= (6 * Math.PI) / 180);
  assert.ok(DRIFT_MS <= 5000);
  assert.deepEqual(cameraPose(DRIFT_MS, { reducedMotion: false }), { az: REST.az, el: REST.el, done: true });
});

// ---- 4. No WebGL ---------------------------------------------------------------------------------
check('no WebGL / software renderer: poster, no canvas; Save-Data: gradient only, nothing probed', () => {
  assert.equal(heroReliefMode({ ...capable, webgl: false }), 'poster');
  assert.deepEqual(heroSceneMode({ ...capable, webgl: null }, () => false), { gl: false, reducedMotion: false });
  assert.deepEqual(heroSceneMode({ ...capable, viewportWidth: 390, webgl: null }, () => true), { gl: false, reducedMotion: false });
  let probed = 0;
  assert.equal(heroSceneMode({ ...capable, saveData: true }, () => (probed++, true)), null);
  assert.equal(probed, 0);
  assert.equal(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), true);
  const html = renderToStaticMarkup(h(ReliefLayer, { gl: false, reducedMotion: false, lanes: NEUTRAL_STYLES }));
  assert.match(html, /<svg[^>]*data-relief-poster/);
  assert.match(html, /data-lane="hormuz"/);
  assert.ok(!html.includes('<canvas'));
  const withGl = renderToStaticMarkup(h(ReliefLayer, { gl: true, reducedMotion: false, lanes: NEUTRAL_STYLES }));
  assert.match(withGl, /data-relief-poster/, 'the poster stays under the canvas until its first frame');
  assert.match(withGl, /<canvas/);
});

check('HeroScene first render: the gradient box (aria-hidden, fixed size) is always there', () => {
  const html = renderToStaticMarkup(h(HeroScene, {}));
  assert.match(html, /<div class="hero-scene" aria-hidden="true" data-hero-3d="off"><\/div>/);
});

// ---- 5. Honesty and map rules ----------------------------------------------------------------------
check('no text in the relief, never mirrored, top fade keeps the first 72 px clear', () => {
  const html = renderToStaticMarkup(h(ReliefLayer, { gl: true, reducedMotion: false, lanes: NEUTRAL_STYLES }));
  assert.ok(!/<text|<tspan|<title/.test(html), 'text inside the relief');
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /direction:ltr/);
  assert.match(html, /mask-image:linear-gradient\(to bottom, transparent 0, transparent 72px, #000 128px\)/);
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
