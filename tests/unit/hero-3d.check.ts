/**
 * Checks for lib/hero-3d.ts: when the home hero may load its WebGL scene, and which routes may
 * ever carry 3D. Plain assert script, like the other *.check.ts files:
 *
 *   npx --yes tsx tests/unit/hero-3d.check.ts
 *
 * Not named *.test.ts / *.spec.ts so Playwright's testMatch ignores it.
 */
import assert from 'node:assert/strict';
import { hero3DDecision, isSoftwareRenderer, readHero3DEnv, HERO_3D_MIN_DEVICE_MEMORY_GB, type Hero3DEnv } from '../../lib/hero-3d';

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`PASS ${label}`);
};

const capable: Hero3DEnv = { reducedMotion: false, saveData: false, deviceMemoryGb: 8, webgl: true };

// --- hero3DDecision ----------------------------------------------------------------------------
ok('capable device: render', () => {
  assert.deepEqual(hero3DDecision(capable), { render: true, reason: 'ok' });
});

ok('prefers-reduced-motion: never render', () => {
  assert.deepEqual(hero3DDecision({ ...capable, reducedMotion: true }), { render: false, reason: 'reduced-motion' });
});

ok('Save-Data: never render', () => {
  assert.deepEqual(hero3DDecision({ ...capable, saveData: true }), { render: false, reason: 'save-data' });
});

ok('device memory below 4 GB: skip', () => {
  assert.equal(HERO_3D_MIN_DEVICE_MEMORY_GB, 4);
  assert.deepEqual(hero3DDecision({ ...capable, deviceMemoryGb: 2 }), { render: false, reason: 'low-memory' });
  assert.deepEqual(hero3DDecision({ ...capable, deviceMemoryGb: 0.5 }), { render: false, reason: 'low-memory' });
});

ok('device memory exactly 4 GB: render (rule is "< 4")', () => {
  assert.equal(hero3DDecision({ ...capable, deviceMemoryGb: 4 }).render, true);
});

ok('device memory unknown (Safari / Firefox do not expose it): not a reason to skip', () => {
  assert.equal(hero3DDecision({ ...capable, deviceMemoryGb: null }).render, true);
});

ok('no WebGL (or only a software / major-performance-caveat context): skip', () => {
  assert.deepEqual(hero3DDecision({ ...capable, webgl: false }), { render: false, reason: 'no-webgl' });
});

ok('WebGL not probed yet (null): the cheap checks decide, the probe runs last', () => {
  // The component calls the decision once without probing (null) so a reduced-motion, Save-Data or
  // low-memory visitor never pays for a WebGL context; only then does it probe.
  assert.deepEqual(hero3DDecision({ ...capable, webgl: null }), { render: true, reason: 'ok' });
  assert.deepEqual(hero3DDecision({ ...capable, webgl: null, reducedMotion: true }), { render: false, reason: 'reduced-motion' });
});

ok('order: reduced-motion wins over every other reason', () => {
  assert.equal(
    hero3DDecision({ reducedMotion: true, saveData: true, deviceMemoryGb: 1, webgl: false }).reason,
    'reduced-motion',
  );
  assert.equal(hero3DDecision({ reducedMotion: false, saveData: true, deviceMemoryGb: 1, webgl: false }).reason, 'save-data');
  assert.equal(hero3DDecision({ reducedMotion: false, saveData: false, deviceMemoryGb: 1, webgl: false }).reason, 'low-memory');
});

ok('non-finite / non-positive memory values are treated as unknown, not as low', () => {
  assert.equal(hero3DDecision({ ...capable, deviceMemoryGb: Number.NaN }).render, true);
  assert.equal(hero3DDecision({ ...capable, deviceMemoryGb: 0 }).render, true);
});

// --- readHero3DEnv (pure: takes the browser objects as arguments) -------------------------------
ok('readHero3DEnv: reads matchMedia, navigator.connection.saveData and navigator.deviceMemory', () => {
  const env = readHero3DEnv({
    matchMedia: (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }),
    navigator: { connection: { saveData: true }, deviceMemory: 2 },
  });
  assert.deepEqual(env, { reducedMotion: true, saveData: true, deviceMemoryGb: 2, webgl: null });
});

ok('readHero3DEnv: missing APIs give safe defaults (no throw)', () => {
  assert.deepEqual(readHero3DEnv({ navigator: {} }), { reducedMotion: false, saveData: false, deviceMemoryGb: null, webgl: null });
  assert.deepEqual(readHero3DEnv({}), { reducedMotion: false, saveData: false, deviceMemoryGb: null, webgl: null });
});

ok('readHero3DEnv: a throwing matchMedia is treated as reduced motion (fail closed)', () => {
  const env = readHero3DEnv({
    matchMedia: () => {
      throw new Error('blocked');
    },
    navigator: {},
  });
  assert.equal(env.reducedMotion, true);
  assert.equal(hero3DDecision(env).render, false);
});

// --- isSoftwareRenderer (the caveat flag alone lets SwiftShader through in Chromium) -------------
ok('isSoftwareRenderer: software rasterisers are rejected', () => {
  assert.equal(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), true);
  assert.equal(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)'), true);
  assert.equal(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)'), true);
  assert.equal(isSoftwareRenderer('Google SwiftShader'), true);
});

ok('isSoftwareRenderer: hardware and masked renderers pass', () => {
  assert.equal(isSoftwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'), false);
  assert.equal(isSoftwareRenderer('Adreno (TM) 640'), false);
  assert.equal(isSoftwareRenderer('Mali-G78'), false);
  assert.equal(isSoftwareRenderer('WebKit WebGL'), false);
  assert.equal(isSoftwareRenderer(null), false);
  assert.equal(isSoftwareRenderer(undefined), false);
});

console.log(`\n${n} checks passed`);
