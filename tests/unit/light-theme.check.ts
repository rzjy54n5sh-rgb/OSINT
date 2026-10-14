/**
 * Light theme readiness (design system v2):
 *  1. no public file in app/ or components/ (admin excluded) hard-codes a colour that cannot follow the
 *     theme: hex literals, rgb()/rgba()/hsl() literals, Tailwind palette classes (text-white, bg-black,
 *     text-red-500 …), the keywords white/black as a colour value, or a flag emoji. Colours come from the
 *     tokens in app/globals.css (var(--…)), currentColor or color-mix() of tokens. The only exceptions
 *     are listed in ALLOW below, each with its reason; a new literal anywhere else fails;
 *  2. the admin panel (app/(admin)/**, about 190 hard-coded dark colours, not converted) is forced dark:
 *     its layout wraps everything in data-theme="dark", globals.css re-declares the dark tokens for
 *     [data-theme='dark'], and the boot script never applies a stored 'light' on /admin;
 *  3. the theme switch: LIGHT_THEME_ENABLED is on, the header renders the ThemeToggle, and the boot
 *     script applies only a stored choice (never prefers-color-scheme: dark is the default).
 *
 *   npx --yes tsx tests/unit/light-theme.check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = join(__dirname, '../..');
const rel = (p: string) => relative(root, p).split(sep).join('/');

/** Not scanned: the admin panel (forced dark, see 2), and files another workstream owns. */
const SKIP_DIRS = ['app/(admin)', 'components/admin', 'app/api'];
const SKIP_FILES = [
  // 3D hero relief: owned by the hero workstream (WebGL colours are uniforms, not CSS).
  'components/home/HeroScene.tsx',
  'components/home/HeroStarfield.tsx',
];

/**
 * Literals that stay, file → [pattern, reason]. Keep this short: every entry is a colour that must not
 * change with the theme (or is not a colour at all).
 */
const ALLOW: Record<string, { re: RegExp; why: string }[]> = {
  'app/globals.css': [
    { re: /#000\b|#fff\b|#0B0F14\b|#FFFFFF\b/i, why: 'mask-image gradients (alpha only) and the token blocks' },
  ],
  'app/layout.tsx': [
    { re: /#0B0F14|#FFFFFF/, why: 'theme-color meta: viewport default (dark --bg) and the boot script (light --bg), before CSS loads' },
  ],
  'app/global-error.tsx': [
    { re: /#0B0F14|#E8EDF2|#8593A3|#E8C547|#243041/, why: 'renders without globals.css (replaces the root layout): inline dark tokens' },
  ],
};

const RULES: { name: string; re: RegExp }[] = [
  { name: 'hex colour', re: /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g },
  { name: 'rgb()/hsl() literal', re: /\b(?:rgba?|hsla?)\(\s*\d/g },
  {
    name: 'Tailwind palette class',
    re: /(?<![\w-])(?:text|bg|border|from|via|to|ring|fill|stroke|divide|outline|decoration|placeholder|shadow|accent|caret)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?![\w-])/g,
  },
  {
    name: 'white/black keyword',
    re: /(?:color|background|backgroundColor|fill|stroke|borderColor|stopColor|stop-color|border(?:-\w+)?)\s*[:=]\s*\{?\s*['"]?(?:white|black)\b/gi,
  },
  { name: 'flag emoji', re: /[\u{1F1E6}-\u{1F1FF}]{2}/gu },
];

/** Comments are not code: strip block comments (keeping line numbers) and full-line // comments. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/(^|[^:'"`\w])\/\/(?![^'"`]*['"`]\s*[,)}]).*$/, '$1')))
    .join('\n');
}

/** globals.css: the token rules themselves (:root, [data-theme], print) are the definitions, not offenders. */
function blankTokenBlocks(css: string): string {
  return css.replace(/(^|\n)(:root[^{]*|\[data-theme[^{]*)\{[\s\S]*?\n\}/g, (m) => m.replace(/[^\n]/g, ' ')).replace(
    /@media print \{\s*:root \{[\s\S]*?\}\s*\}/g,
    (m) => m.replace(/[^\n]/g, ' '),
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const r = rel(p);
    if (SKIP_DIRS.some((d) => r === d || r.startsWith(`${d}/`))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !SKIP_FILES.includes(r)) out.push(p);
  }
  return out;
}

export function scan(): { file: string; line: number; rule: string; text: string }[] {
  const hits: { file: string; line: number; rule: string; text: string }[] = [];
  for (const p of [...walk(join(root, 'app')), ...walk(join(root, 'components'))]) {
    const r = rel(p);
    let src = stripComments(readFileSync(p, 'utf8'));
    if (r === 'app/globals.css') src = blankTokenBlocks(src);
    src.split('\n').forEach((line, i) => {
      for (const rule of RULES) {
        for (const m of line.matchAll(rule.re)) {
          if ((ALLOW[r] ?? []).some((a) => a.re.test(m[0]))) continue;
          hits.push({ file: r, line: i + 1, rule: rule.name, text: m[0] });
        }
      }
    });
  }
  return hits;
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
    console.error(`FAIL ${label}: ${(e as Error).message.split('\n').slice(0, 60).join('\n     ')}`);
  }
};

ok('no hard-coded colour literal in public app/ and components/ outside the allowlist', () => {
  const hits = scan();
  if (process.env.LIGHT_THEME_LIST) for (const h of hits) console.log(`${h.file}:${h.line}  [${h.rule}] ${h.text}`);
  const byFile = new Map<string, number>();
  for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  const summary = [...byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => `${String(c).padStart(4)}  ${f}`);
  assert.equal(
    hits.length,
    0,
    `${hits.length} literal(s) in ${byFile.size} file(s):\n${summary.join('\n')}\nfirst 40:\n${hits
      .slice(0, 40)
      .map((h) => `${h.file}:${h.line}  [${h.rule}] ${h.text}`)
      .join('\n')}`,
  );
});

ok('every allowlist entry is still needed (no stale exemptions)', () => {
  for (const [file, entries] of Object.entries(ALLOW)) {
    assert.ok(existsSync(join(root, file)), `${file} no longer exists`);
    const src = readFileSync(join(root, file), 'utf8');
    for (const a of entries) assert.ok(a.re.test(src), `${file}: allowlist entry ${a.re} matches nothing`);
  }
});

const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const adminLayout = readFileSync(join(root, 'app/(admin)/admin/layout.tsx'), 'utf8');
const rootLayout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');

ok('admin layout wraps the panel in data-theme="dark"', () => {
  assert.match(adminLayout, /data-theme=["']dark["']/, 'no data-theme="dark" wrapper in app/(admin)/admin/layout.tsx');
  assert.match(adminLayout, /<AdminThemeLock\b/, 'AdminThemeLock (keeps <html> dark while an admin route is open) is not rendered');
});

ok("globals.css re-declares the dark tokens for [data-theme='dark'] (a dark island inside a light page)", () => {
  const at = css.indexOf(":root,\n[data-theme='dark'] {");
  assert.ok(at >= 0, "the dark token rule must be `:root,\\n[data-theme='dark'] {` so a nested wrapper gets every dark value");
  const body = css.slice(at, css.indexOf('\n}', at));
  for (const t of ['--bg', '--surface', '--text', '--text-2', '--muted', '--link', '--status-closed', '--posture-4', '--scn-a', '--bg-primary', '--text-primary'])
    assert.match(body, new RegExp(`${t}\\s*:`), `${t} missing from the dark rule`);
});

ok('boot script: a stored choice only, never on /admin, never prefers-color-scheme', () => {
  assert.match(rootLayout, /localStorage\.getItem\('mid-theme'\)/);
  assert.match(rootLayout, /\/admin/, 'boot script must skip /admin');
  assert.doesNotMatch(rootLayout, /prefers-color-scheme/, 'dark is the default: the OS setting is not read');
});

ok('LIGHT_THEME_ENABLED is on and the header renders the ThemeToggle', () => {
  const tokens = readFileSync(join(root, 'lib/design-tokens.ts'), 'utf8');
  assert.ok(/export const LIGHT_THEME_ENABLED = true;/.test(tokens), 'lib/design-tokens.ts: LIGHT_THEME_ENABLED is not true');
  const header = readFileSync(join(root, 'components/CommandHeader.tsx'), 'utf8');
  assert.match(header, /<ThemeToggle\b/);
  const toggle = readFileSync(join(root, 'components/header/ThemeToggle.tsx'), 'utf8');
  assert.match(toggle, /aria-label=/, 'icon button needs an accessible name');
  assert.match(toggle, /try\s*\{[\s\S]*localStorage\.setItem/, 'storage write must be wrapped in try/catch');
});

console.log(`\n${n} passed, ${failed} failed`);
if (failed) process.exit(1);
