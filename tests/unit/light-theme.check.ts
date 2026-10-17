/**
 * Light theme readiness (design system v2):
 *  1. no public file in app/, components/ or lib/ (admin and e-mail templates excluded) hard-codes a colour
 *     that cannot follow the theme: hex, rgb()/hsl()/oklch()/lab() literals, Tailwind palette classes
 *     (text-white, bg-black, text-red-500 …) or theme(colors.…), CSS named colours (white, red, navy …) as a
 *     colour value, or a flag emoji; and no text control dims on hover (opacity hover). Colours come from the
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

/**
 * Not scanned: the admin panel (forced dark, see 2), route handlers, e-mail templates (rendered by mail
 * clients, not the site), the admin API layer, and files another workstream owns.
 */
const SKIP_DIRS = ['app/(admin)', 'components/admin', 'app/api', 'lib/email/templates', 'lib/admin', 'lib/api/admin'];
const SKIP_FILES = [
  // 3D hero relief: owned by the hero workstream (WebGL colours are uniforms, not CSS).
  'components/home/HeroScene.tsx',
  'components/home/HeroStarfield.tsx',
  'lib/hero-3d.ts',
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
  // The source of truth for the hex values that charts and maps need in TypeScript; tokens.check.ts asserts
  // each equals its CSS custom property. Components use the var() forms.
  'lib/design-tokens.ts': [{ re: /^#[0-9A-F]{6}$/, why: 'TS mirror of the v2 tokens (tokens.check.ts keeps it equal to globals.css)' }],
  'app/global-error.tsx': [
    { re: /#0B0F14|#E8EDF2|#8593A3|#E8C547|#243041/, why: 'renders without globals.css (replaces the root layout): inline dark tokens' },
  ],
};

const NAMED_COLOURS = 'aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen';

const RULES: { name: string; re: RegExp }[] = [
  { name: 'hex colour', re: /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g },
  { name: 'rgb()/hsl() literal', re: /\b(?:rgba?|hsla?)\(\s*\d/g },
  {
    name: 'Tailwind palette class',
    re: /(?<![\w-])(?:text|bg|border|from|via|to|ring|fill|stroke|divide|outline|decoration|placeholder|shadow|accent|caret)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?![\w-])/g,
  },
  {
    // CSS named colours (white, red, navy …) as a colour value: style props, CSS declarations, SVG attributes.
    name: 'named colour keyword',
    re: new RegExp(
      `(?:\\b(?:color|background|backgroundColor|fill|stroke|borderColor|outlineColor|stopColor|stop-color|caretColor|textDecorationColor|border(?:-\\w+)?)\\s*[:=]\\s*\\{?\\s*['"\`]?|\\b(?:solid|dashed|dotted|double)\\s+)(?:${NAMED_COLOURS})(?![\\w-])`,
      'gi',
    ),
  },
  { name: 'oklch()/lab()/lch()/hwb() literal', re: /\b(?:oklch|oklab|lch|lab|hwb)\(\s*[\d.]/g },
  { name: 'color() literal', re: /\bcolor\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?)\b/g },
  {
    // Named colours inside shadows and gradients (hex / rgb() there are already caught by the rules above).
    name: 'named colour in shadow / gradient',
    re: new RegExp(
      `(?:\\b(?:box-shadow|text-shadow|boxShadow|textShadow)\\s*:\\s*['"\`]?[^;'"\`\\n]*?|-gradient\\([^;\\n]*?)(?<![\\w-])(?:${NAMED_COLOURS})(?![\\w-])`,
      'gi',
    ),
  },
  { name: 'Tailwind theme(colors.…)', re: /\btheme\(\s*['"]?colors\./g },
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
  for (const p of [...walk(join(root, 'app')), ...walk(join(root, 'components')), ...walk(join(root, 'lib')), ...walk(join(root, 'hooks'))]) {
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

ok('the rules catch each kind of literal (self-test)', () => {
  const samples = [
    "style={{ color: 'red' }}", 'border: 1px solid navy;', 'fill="tomato"', "background: 'oklch(0.7 0.1 30)'",
    'color: lab(50% 40 59)', "color: theme('colors.slate.500')", 'className="text-white"', "color: '#E8C547'",
    'rgba(255,255,255,0.1)', '🇮🇷', 'color(srgb 1 0 0)', 'box-shadow: 0 0 4px crimson;', "boxShadow: '0 0 4px gold'",
    'background: linear-gradient(to right, navy, transparent);',
  ];
  for (const t of samples) assert.ok(RULES.some((r) => { r.re.lastIndex = 0; return r.re.test(t); }), `not caught: ${t}`);
  for (const t of ["color: 'var(--text)'", "border: '1px solid var(--line)'", 'color-mix(in oklch, var(--a) 20%, transparent)', "label: 'Red Sea'"])
    assert.ok(!RULES.some((r) => { r.re.lastIndex = 0; return r.re.test(t); }), `false positive: ${t}`);
});

ok('no hard-coded colour literal in public app/, components/, lib/ and hooks/ outside the allowlist', () => {
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

ok('no text control dims on hover (opacity hovers took gold and muted text under 4.5:1 in light)', () => {
  const offenders: string[] = [];
  for (const p of [...walk(join(root, 'app')), ...walk(join(root, 'components'))]) {
    const r = rel(p);
    stripComments(readFileSync(p, 'utf8')).split('\n').forEach((line, i) => {
      // Tailwind hover/focus opacity utilities, and inline hover handlers that lower opacity.
      if (/(?<![\w-])(?:group-)?(?:hover|focus|focus-visible|active):opacity-(?:\[[^\]]+\]|(?!100\b)\d+)/.test(line)) offenders.push(`${r}:${i + 1}`);
      if (/onMouse(?:Enter|Over)[^\n]*opacity\s*=\s*['"]?0?\.\d/.test(line)) offenders.push(`${r}:${i + 1}`);
    });
    // CSS: a :hover / :focus rule that sets opacity below 1 (revealing an overlay with opacity: 1 is fine).
    if (r.endsWith('.css')) {
      const css = stripComments(readFileSync(p, 'utf8'));
      for (const m of css.matchAll(/([^{}]*:(?:hover|focus|active)[^{}]*)\{([^}]*)\}/g))
        if (/(?:^|;|\s)opacity\s*:\s*0?\.\d/.test(m[2])) offenders.push(`${r}: ${m[1].trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], `opacity hovers: ${offenders.join(', ')}`);
});

ok('every allowlist entry is still needed (no stale exemptions)', () => {
  for (const [file, entries] of Object.entries(ALLOW)) {
    assert.ok(existsSync(join(root, file)), `${file} no longer exists`);
    const src = readFileSync(join(root, file), 'utf8');
    for (const a of entries) {
      const unanchored = new RegExp(a.re.source.replace(/^\^|\$$/g, ''), a.re.flags); // entries may match whole tokens
      assert.ok(unanchored.test(src), `${file}: allowlist entry ${a.re} matches nothing`);
    }
  }
});

const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const adminLayout = readFileSync(join(root, 'app/(admin)/admin/layout.tsx'), 'utf8');
const rootLayout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');

ok('admin layout wraps the panel in data-theme="dark"', () => {
  assert.match(adminLayout, /data-theme=["']dark["']/, 'no data-theme="dark" wrapper in app/(admin)/admin/layout.tsx');
  assert.match(adminLayout, /<AdminThemeLock\b/, 'AdminThemeLock (keeps <html> dark while an admin route is open) is not rendered');
  const lock = readFileSync(join(root, 'components/admin/AdminThemeLock.tsx'), 'utf8');
  assert.match(lock, /useLayoutEffect\(/, 'AdminThemeLock must apply before paint (useLayoutEffect, not useEffect)');
  const header = readFileSync(join(root, 'components/CommandHeader.tsx'), 'utf8');
  assert.ok(
    [...header.matchAll(/<ThemeToggle\b/g)].every((m) => /!isAdminRoute \? $/.test(header.slice(Math.max(0, m.index! - 40), m.index))),
    'every ThemeToggle in the header must be hidden on /admin (isAdminRoute)',
  );
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
  const pref = readFileSync(join(root, 'lib/theme-pref.ts'), 'utf8');
  assert.match(pref, /try\s*\{\s*localStorage\.setItem/, 'storage write must be wrapped in try/catch');
});

ok('ThemeGuard: a failed root hydration cannot drop the stored theme or banner dismissal; it never fights the toggle', () => {
  assert.match(rootLayout, /<ThemeGuard\s*\/>/, 'root layout must render <ThemeGuard />');
  const guard = readFileSync(join(root, 'components/ThemeGuard.tsx'), 'utf8');
  assert.match(guard, /useLayoutEffect\(/, 'guard must re-apply before paint');
  assert.match(guard, /new MutationObserver\(/);
  assert.match(guard, /attributeFilter:\s*\[\s*'data-theme',\s*'data-tb-dismissed'\s*\]/);
  assert.match(guard, /admin \? 'dark'/, 'on /admin the guard applies dark');
  assert.match(guard, /readThemePref\(\)/);
  const toggle = readFileSync(join(root, 'components/header/ThemeToggle.tsx'), 'utf8');
  const body = toggle.slice(toggle.indexOf('const toggle = () =>'));
  const write = body.indexOf('writeThemePref(next)');
  const attr = body.indexOf("setAttribute('data-theme', next)");
  assert.ok(write >= 0 && attr > write, 'ThemeToggle must record the choice (writeThemePref) before it changes data-theme');
});

console.log(`\n${n} passed, ${failed} failed`);
if (failed) process.exit(1);
