/**
 * When the home hero may load its WebGL scene (owner direction: "minimalist with 3D immersive
 * touches" — ONE restrained 3D element, on the home hero only, never on data pages).
 *
 * Pure: no `window` access here, so it is unit-tested (tests/unit/hero-3d.check.ts). The component
 * (components/home/HeroScene.tsx) reads the browser through `readHero3DEnv(window)` and probes
 * WebGL last, so a visitor who is skipped for a cheap reason never pays for a GL context.
 */

/** navigator.deviceMemory below this (GB) skips the scene. */
export const HERO_3D_MIN_DEVICE_MEMORY_GB = 4;

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
}

export type Hero3DReason = 'ok' | 'reduced-motion' | 'save-data' | 'low-memory' | 'no-webgl';

export function hero3DDecision(env: Hero3DEnv): { render: boolean; reason: Hero3DReason } {
  if (env.reducedMotion) return { render: false, reason: 'reduced-motion' };
  if (env.saveData) return { render: false, reason: 'save-data' };
  const mem = env.deviceMemoryGb;
  if (mem != null && Number.isFinite(mem) && mem > 0 && mem < HERO_3D_MIN_DEVICE_MEMORY_GB) {
    return { render: false, reason: 'low-memory' };
  }
  if (env.webgl === false) return { render: false, reason: 'no-webgl' };
  return { render: true, reason: 'ok' };
}

/** The slice of `window` this reads (so tests can pass plain objects). */
export interface Hero3DWindowLike {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: {
    connection?: { saveData?: boolean } | null;
    deviceMemory?: number;
  };
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
  return { reducedMotion, saveData, deviceMemoryGb: mem, webgl: null };
}
