/**
 * Design system v2 tokens (app/globals.css) against the System artboard:
 *  1. every text token reaches WCAG 2.x 4.5:1 on --bg and on --surface, in both themes;
 *     status text also on its own tint (the chips), and the CTA ink on the gold fill;
 *     the same for the @media print block (light inks);
 *  2. the War Posture scale, scenario identity and lane status colours equal the spec (CSS and TS);
 *  3. every legacy variable name still exists and resolves to a v2 token.
 *
 *   npx --yes tsx tests/unit/tokens.check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  POSTURE_SCALE,
  SCENARIO_IDENTITY,
  STATUS_COLORS,
  isPostureNoGrade,
  postureBand,
  postureScaleColor,
} from '../../lib/design-tokens';
import { SCENARIO_COLORS } from '../../lib/scenario-registry';
import { POSTURE_LABELS } from '../../lib/posture';

const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

/** Declarations of the first rule whose selector is exactly `selector`. */
function block(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `missing rule ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('\n}', at));
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const darkDecl = block(':root');
const lightDecl = { ...darkDecl, ...block(":root[data-theme='light']") };

/** The `:root` rule inside `@media print { … }` (print always uses the light inks). */
function printBlock(): Record<string, string> {
  const at = css.indexOf('@media print {');
  assert.ok(at >= 0, 'missing @media print block');
  const rootAt = css.indexOf(':root {', at);
  const body = css.slice(css.indexOf('{', rootAt) + 1, css.indexOf('}', rootAt));
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const printDecl = { ...darkDecl, ...printBlock() };

/** Resolve var() chains to a hex value. */
function resolve(decl: Record<string, string>, name: string, depth = 0): string {
  assert.ok(depth < 10, `var() cycle at ${name}`);
  const v = decl[name];
  assert.ok(v !== undefined, `token ${name} is not defined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolve(decl, ref[1], depth + 1) : v;
}

function lum(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a #rrggbb colour: ${hex}`);
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let n = 0;
let failed = 0;
const ok = (label: string, fn: () => void) => {
  try {
    fn();
    n++;
    console.log(`ok   ${label}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${label}: ${(e as Error).message.split('\n').slice(0, 12).join(' ')}`);
  }
};

const TEXT_TOKENS = [
  '--text', '--text-2', '--muted', '--accent', '--link', '--link-hover',
  '--status-normal', '--status-elevated', '--status-disrupted', '--status-closed', '--status-unknown',
  '--scn-a', '--scn-b', '--scn-c', '--scn-d', '--scn-unmeasured',
];

for (const [theme, decl] of [['dark', darkDecl], ['light', lightDecl], ['print', printDecl]] as const) {
  const bg = resolve(decl, '--bg');
  const surface = resolve(decl, '--surface');
  for (const t of TEXT_TOKENS) {
    ok(`${theme}: ${t} ≥ 4.5:1 on --bg and --surface`, () => {
      const fg = resolve(decl, t);
      const onBg = contrast(fg, bg);
      const onSurface = contrast(fg, surface);
      assert.ok(onBg >= 4.5, `${t} ${fg} on ${bg} = ${onBg.toFixed(2)}`);
      assert.ok(onSurface >= 4.5, `${t} ${fg} on ${surface} = ${onSurface.toFixed(2)}`);
    });
  }
  for (const st of ['normal', 'elevated', 'disrupted', 'closed', 'unknown']) {
    ok(`${theme}: status ${st} text ≥ 4.5:1 on its tint`, () => {
      const r = contrast(resolve(decl, `--status-${st}`), resolve(decl, `--status-${st}-tint`));
      assert.ok(r >= 4.5, `${st}: ${r.toFixed(2)}`);
    });
  }
  ok(`${theme}: CTA ink on gold fill ≥ 4.5:1`, () => {
    const r = contrast(resolve(decl, '--on-accent'), resolve(decl, '--accent-fill'));
    assert.ok(r >= 4.5, r.toFixed(2));
  });
  ok(`${theme}: focus ring ≥ 3:1 on --bg (non-text contrast)`, () => {
    const r = contrast(resolve(decl, '--focus-ring'), bg);
    assert.ok(r >= 3, r.toFixed(2));
  });
}

// 2. Spec values ---------------------------------------------------------------------------------------
const SPEC = {
  dark: {
    bg: '#0B0F14', surface: '#131A23', line: '#243041', text: '#E8EDF2', text2: '#B6C2CF', muted: '#8593A3', accent: '#E8C547', link: '#6CB4FF',
    posture: ['#6FA8F0', '#98A3B3', '#E8A066', '#FF7F3F'],
    scn: { a: '#4DA6FF', b: '#D6B370', c: '#36B8C8', d: '#A78BFA' },
  },
  light: {
    bg: '#FFFFFF', surface: '#F5F6F8', line: '#D9DEE5', text: '#0E1116', text2: '#3D4651', muted: '#5E6875', accent: '#8A6A00', link: '#0B5CAD',
    posture: ['#2F6FC0', '#7B8594', '#B8611F', '#C2410C'],
    scn: { a: '#1F6FC2', b: '#8C6A1F', c: '#0F7C8A', d: '#6D4FD1' },
  },
} as const;

for (const theme of ['dark', 'light'] as const) {
  const decl = theme === 'dark' ? darkDecl : lightDecl;
  const sp = SPEC[theme];
  ok(`${theme}: base tokens equal the System artboard`, () => {
    const got = ['--bg', '--surface', '--line', '--text', '--text-2', '--muted', '--accent', '--link'].map((t) => resolve(decl, t).toUpperCase());
    assert.deepEqual(got, [sp.bg, sp.surface, sp.line, sp.text, sp.text2, sp.muted, sp.accent, sp.link]);
  });
  ok(`${theme}: War Posture scale (CSS and TS) equals the spec`, () => {
    assert.deepEqual([1, 2, 3, 4].map((b) => resolve(decl, `--posture-${b}`).toUpperCase()), [...sp.posture]);
    assert.deepEqual([1, 2, 3, 4].map((b) => POSTURE_SCALE[theme][b as 1 | 2 | 3 | 4]), [...sp.posture]);
  });
  ok(`${theme}: scenario identity (CSS and TS) equals the spec`, () => {
    for (const c of ['a', 'b', 'c', 'd'] as const) {
      assert.equal(resolve(decl, `--scn-${c}`).toUpperCase(), sp.scn[c]);
      assert.equal(SCENARIO_IDENTITY[theme][c.toUpperCase() as 'A'], sp.scn[c]);
    }
  });
  ok(`${theme}: lane status (CSS and TS) agree`, () => {
    for (const [code, [fg, tint]] of Object.entries(STATUS_COLORS[theme])) {
      assert.equal(resolve(decl, `--status-${code.toLowerCase()}`).toUpperCase(), fg);
      assert.equal(resolve(decl, `--status-${code.toLowerCase()}-tint`).toUpperCase(), tint);
    }
  });
}

ok('posture bands: 0–30 / 31–60 / 61–80 / 81–100; off-scale → null', () => {
  const cases: [number | null, number | null][] = [[0, 1], [30, 1], [31, 2], [60, 2], [61, 3], [80, 3], [81, 4], [100, 4], [null, null], [-1, null], [101, null]];
  for (const [score, band] of cases) assert.equal(postureBand(score), band, `band(${score})`);
});
ok('EG / AE / SA never get a posture colour', () => {
  for (const cc of ['EG', 'AE', 'SA', 'eg']) {
    assert.equal(isPostureNoGrade(cc), true);
    assert.equal(postureScaleColor(90, { countryCode: cc }), null);
  }
  assert.equal(postureScaleColor(90, { countryCode: 'IR' }), '#FF7F3F');
});
ok('posture labels: theme-aware swatch var of their anchor band', () => {
  for (const l of POSTURE_LABELS) {
    const band = postureBand(l.anchor)!;
    assert.equal(l.color, `var(--posture-${band}, ${POSTURE_SCALE.dark[band]})`);
  }
});
ok('print mirrors the light theme for every colour token it sets', () => {
  for (const [name, v] of Object.entries(printBlock())) assert.equal(v.toUpperCase(), resolve(lightDecl, name).toUpperCase(), name);
});

// Posture colours are fills and swatches only, never text: no `color:` / `color={…}` may take a posture
// token, a posture hex or a posture label's `.color`. (If one ever must be text, assert its contrast here.)
ok('posture colours are never used as a text colour', () => {
  const POSTURE_HEX = [...Object.values(POSTURE_SCALE.dark), ...Object.values(POSTURE_SCALE.light)].map((h) => h.slice(1)).join('|');
  const direct = new RegExp(`(?<![-\\w])color(?:\\s*:\\s*|=\\{)[^;,}\\n]*(?:--posture-|#(?:${POSTURE_HEX})\\b|postur|POSTUR)`, 'i');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(name)) {
        const src = readFileSync(p, 'utf8');
        src.split('\n').forEach((line, i) => {
          if (direct.test(line.replace(/(background|border|fill|stroke|outline)[-\w]*\s*:/gi, ''))) offenders.push(`${p}:${i + 1}`);
        });
        // `POSTURE_LABELS.map((l) => … color={l.color} …)` — a label colour used as text.
        for (const m of src.matchAll(/POSTURE_LABELS\.map\(\(?(\w+)/g)) {
          const window = src.slice(m.index, m.index + 800);
          if (new RegExp(`(?<![-\\w])color(?:=\\{|\\s*:\\s*)${m[1]}\\.color`).test(window)) offenders.push(`${p}: ${m[1]}.color as text`);
        }
      }
    }
  };
  for (const d of ['app', 'components', 'lib']) walk(join(__dirname, '../..', d));
  assert.deepEqual(offenders, []);
});
ok('scenario colours: theme tokens with the spec hex as fallback, no red or green, E neutral', () => {
  assert.deepEqual([SCENARIO_COLORS.A, SCENARIO_COLORS.B, SCENARIO_COLORS.C, SCENARIO_COLORS.D], [
    'var(--scn-a, #4DA6FF)', 'var(--scn-b, #D6B370)', 'var(--scn-c, #36B8C8)', 'var(--scn-d, #A78BFA)',
  ]);
  assert.equal(SCENARIO_COLORS.E, 'var(--scn-unmeasured, #8593A3)');
  for (const v of Object.values(SCENARIO_COLORS)) assert.ok(!/#(E05252|4EC98A|E74C3C|27AE60|2ECC71)/i.test(v), v);
});

// 3. Legacy aliases -------------------------------------------------------------------------------------
const LEGACY = [
  '--bg-primary', '--bg-secondary', '--bg-card', '--bg-card-hover', '--bg-elevated', '--border', '--border-bright', '--border-gold',
  '--text-primary', '--text-secondary', '--text-muted', '--accent-gold', '--accent-red', '--accent-green', '--accent-blue',
  '--accent-orange', '--accent-purple', '--accent-teal', '--text-danger', '--text-success', '--text-warning',
  '--nai-aligned', '--nai-stable', '--nai-tension', '--nai-fracture', '--nai-inversion', '--nai-safe',
];
ok('every legacy variable is an alias of a v2 token (both themes resolve to a colour)', () => {
  for (const name of LEGACY) {
    assert.match(darkDecl[name] ?? '', /^var\(--[\w-]+\)$/, `${name} = ${darkDecl[name]}`);
    assert.match(resolve(darkDecl, name), /^#[0-9A-F]{6}$/i, name);
    assert.match(resolve(lightDecl, name), /^#[0-9A-F]{6}$/i, name);
  }
});

console.log(failed ? `\n${failed} of ${n + failed} checks FAILED` : `\nall ${n} checks passed`);
if (failed) process.exit(1);
