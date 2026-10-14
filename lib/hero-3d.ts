/**
 * When the home hero may load its WebGL scene (owner direction: "minimalist with 3D immersive
 * touches" — ONE restrained 3D element, on the home hero only, never on data pages). The scene is the
 * corridor relief (components/home/relief/); the System artboard's upgrade rule is applied here:
 * viewport ≥ 768 px, hardwareConcurrency ≥ 4, deviceMemory ≥ 4, no Save-Data, no reduced motion,
 * hardware WebGL. Everyone else gets the static SVG poster (or, with Save-Data, only the CSS gradient).
 *
 * Pure: no `window` access here, so it is unit-tested (tests/unit/hero-3d.check.ts). The component
 * (components/home/HeroScene.tsx) reads the browser through `readHero3DEnv(window)` and probes
 * WebGL last, so a visitor who is skipped for a cheap reason never pays for a GL context.
 */

/** navigator.deviceMemory below this (GB) skips the scene. */
export const HERO_3D_MIN_DEVICE_MEMORY_GB = 4;
/** Viewport narrower than this (CSS px) skips the scene: phones get the static poster. */
export const HERO_3D_MIN_VIEWPORT_PX = 768;
/** navigator.hardwareConcurrency below this skips the scene. */
export const HERO_3D_MIN_CORES = 4;

export interface Hero3DEnv {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB; null when the browser does not expose it (Safari, Firefox). */
  deviceMemoryGb: number | null;
  /**
   * A hardware-accelerated WebGL context is available (probed with failIfMajorPerformanceCaveat, so
   * software rasterisers such as SwiftShader count as "no"). null = not probed yet.
   */
  webgl: boolean | null;
  /** window.innerWidth in CSS px; null/undefined = unknown (not a reason to skip). */
  viewportWidth?: number | null;
  /** navigator.hardwareConcurrency; null/undefined = unknown (not a reason to skip). */
  cores?: number | null;
}

export type Hero3DReason = 'ok' | 'reduced-motion' | 'save-data' | 'low-memory' | 'few-cores' | 'small-viewport' | 'no-webgl';

const known = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;

export function hero3DDecision(env: Hero3DEnv): { render: boolean; reason: Hero3DReason } {
  if (env.reducedMotion) return { render: false, reason: 'reduced-motion' };
  if (env.saveData) return { render: false, reason: 'save-data' };
  const mem = env.deviceMemoryGb;
  if (known(mem) && mem < HERO_3D_MIN_DEVICE_MEMORY_GB) return { render: false, reason: 'low-memory' };
  if (known(env.cores) && env.cores < HERO_3D_MIN_CORES) return { render: false, reason: 'few-cores' };
  if (known(env.viewportWidth) && env.viewportWidth < HERO_3D_MIN_VIEWPORT_PX) return { render: false, reason: 'small-viewport' };
  if (env.webgl === false) return { render: false, reason: 'no-webgl' };
  return { render: true, reason: 'ok' };
}

/**
 * What the hero backdrop shows on top of its CSS gradient:
 *   'gl'     the WebGL relief (hero3DDecision says render; with webgl null the caller probes first)
 *   'poster' the static SVG relief: reduced motion, no or software WebGL, small or low-end device
 *   'none'   Save-Data: nothing is downloaded, the CSS gradient stays (never a blank box)
 */
export type HeroReliefMode = 'gl' | 'poster' | 'none';

export function heroReliefMode(env: Hero3DEnv): HeroReliefMode {
  if (env.saveData) return 'none';
  return hero3DDecision(env).render ? 'gl' : 'poster';
}

/**
 * HeroScene's whole decision, pure: null = show nothing beyond the CSS gradient (Save-Data);
 * otherwise whether to run WebGL and whether motion is reduced. `probeWebGL` (it creates a GL context)
 * is called only when every cheap check already admits the visitor, never under reduced motion.
 */
export function heroSceneMode(env: Hero3DEnv, probeWebGL: () => boolean): { gl: boolean; reducedMotion: boolean } | null {
  if (heroReliefMode(env) === 'none') return null;
  const webgl = hero3DDecision(env).render ? probeWebGL() : false;
  const mode = heroReliefMode({ ...env, webgl });
  if (mode === 'none') return null;
  return { gl: mode === 'gl', reducedMotion: env.reducedMotion };
}

/**
 * `failIfMajorPerformanceCaveat` alone does not exclude software rasterisers: Chromium (verified on
 * build 1208, headless — the Lighthouse / PageSpeed environment) returns a SwiftShader context with
 * the flag set. So the probe also rejects a context whose renderer string names a software
 * rasteriser. Browsers that mask the renderer (Firefox, Safari) give a generic string: not matched.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;

export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return typeof renderer === 'string' && SOFTWARE_RENDERER.test(renderer);
}

/** The slice of `window` this reads (so tests can pass plain objects). */
export interface Hero3DWindowLike {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: {
    connection?: { saveData?: boolean } | null;
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  innerWidth?: number;
}

/** Reads the cheap signals. WebGL is left null: the caller probes it only if everything else passes. */
export function readHero3DEnv(w: Hero3DWindowLike): Hero3DEnv {
  let reducedMotion = false;
  try {
    reducedMotion = typeof w.matchMedia === 'function' && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // Cannot tell: fail closed (no animation).
    reducedMotion = true;
  }
  const nav = w.navigator ?? {};
  const saveData = nav.connection?.saveData === true;
  const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
  const viewportWidth = typeof w.innerWidth === 'number' ? w.innerWidth : null;
  return { reducedMotion, saveData, deviceMemoryGb: mem, webgl: null, viewportWidth, cores };
}
