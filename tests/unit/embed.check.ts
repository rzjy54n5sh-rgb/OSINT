/**
 * Embeds for media / partners (/embed/*) and the free analytics beacon:
 *   - lib/embed/chokepoints.ts  data/chokepoints/latest.json -> three lanes; greyed "Not updated since <date>" when
 *                               the card's own staleness gate (scripts/card/lib/gates.mjs) says stale; no numbers
 *                               at all when the file fails the gate for any other reason.
 *   - lib/embed/posture.ts      one conflict of the War Posture board (lib/posture.ts getPostureBoard): never a grade
 *                               for EG / AE / SA ("Stated positions only"), Yemen always two separate lines.
 *   - lib/embed/brief.ts        latest brief of a type: headline + first 3 sourced bullets (verbatim first sentence,
 *                               outlet + link), greyed when older than the card's brief age limit.
 *   - lib/security-headers.ts   framing allowed ONLY on /embed/* paths; Cloudflare beacon host in CSP only when set.
 *   - lib/analytics.ts          beacon token read from NEXT_PUBLIC_CF_BEACON_TOKEN, rejected when malformed.
 * Fixtures only (no database, no network). Plain assert script:
 *
 *   npx --yes tsx@4.23.13 tests/unit/embed.check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as posture from '../../lib/posture';
import type { PostureBoard, PostureView } from '../../lib/posture';

const results: { label: string; err: unknown }[] = [];
async function check(label: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ label, err: null });
    console.log(`ok   ${label}`);
  } catch (err) {
    results.push({ label, err });
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split('\n').join('\n     ') : String(err)}`);
  }
}

// Loaded lazily so a missing module fails each check cleanly instead of crashing the script.
type Mod = Record<string, unknown>;
const load = async (rel: string): Promise<Mod> => (await import(rel)) as Mod;
const fn = <T extends (...a: never[]) => unknown>(m: Mod, name: string): T => {
  const f = m[name];
  if (typeof f !== 'function') throw new Error(`module does not export ${name}()`);
  return f as T;
};

const ROOT = path.resolve(__dirname, '../..');
const LATEST = JSON.parse(readFileSync(path.join(ROOT, 'data/chokepoints/latest.json'), 'utf8'));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// --- chokepoints -------------------------------------------------------------------------------------
type Lane = { id: string; name: string; status: string; indexPct: number; transits: number; weekStart: string; weekEnd: string };
type CpView = { state: 'ok' | 'stale' | 'invalid'; lanes: Lane[]; asOf: string | null; week: { start: string; end: string } | null; sourceCredit: string | null; staleNote: string | null; errors: string[] };

async function cp(file: unknown, nowIso: string): Promise<CpView> {
  const m = await load('../../lib/embed/chokepoints');
  return fn<(f: unknown, now: Date) => CpView>(m, 'chokepointsEmbedView')(file, new Date(nowIso));
}
async function cpHtml(v: CpView): Promise<string> {
  const m = await load('../../lib/embed/chokepoints');
  return fn<(v: CpView) => string>(m, 'renderChokepointsEmbed')(v);
}

// --- posture fixtures (viewer_posture_v2 rows, same shape as tests/unit/posture-yemen-dual-actor.check.ts) ----
const ANON = { latent: false, gap: false };
const v2Base = {
  conflict_code: 'us-iran', actor: 'government', actor_display_name: null, actor_display_name_ar: null,
  score_id: 's', score_day: 228, as_of: '2026-10-13', stance: 'position',
  label: 'continued_pressure', expressed_score: 75, defensive: false, confidence_base: 'high', confidence_now: 'high',
  decay_factor: '1', half_life_days: 30, evidence_id: 'e', evidence_kind: 'statement', act_type: null,
  position_quote: 'TEST quote', speaker: 'TEST', speaker_office: 'PM', source_url: 'https://example.test/q',
  archive_url: null, page_sha256: null, party_source: false, stated_at: '2026-10-13T07:00:00+00:00',
  captured_at: '2026-10-13T09:00:00+00:00', evidence_age_days: 0, freshness: 'current', change_reason: 'new_evidence',
  note: null, previous_day: 221, previous_stance: 'position', previous_label: 'ambivalent', previous_score: 50,
  withheld: false, latent_low: null, latent_high: null, latent_basis: null, gap: null, category: null,
  latent_access: false, gap_access: false, method_version: 'war-posture-v2',
};
const row = (o: Record<string, unknown>): PostureView => posture.fromV2Row({ ...v2Base, ...o }, ANON);
const board = (rows: PostureView[], schema: 'v1' | 'v2' = 'v2'): PostureBoard => ({
  schema, day: 228, firstDay: 221, latestDay: 228, conflicts: [...posture.CONFLICTS_FALLBACK], rows, hasLatentAccess: false, hasGapAccess: false,
});
/** A row that pretends to grade a withheld country (DB bug / tampering): the embed must still show no grade. */
const forgedGrade = (cc: string): PostureView => ({ ...row({ country_code: 'IR' }), country_code: cc, withheld: false, stance: 'position', label: 'escalation', expressed_score: 99 });

type Line = { key: string; label: string; stanceText: string; score: number | null; withheld: boolean; actor: string; frozenV1: boolean };
type PView = { conflictCode: string; conflictName: string; schema: string; lines: Line[]; frozenV1Count: number; blended: boolean };
async function pv(b: PostureBoard, conflict = 'us-iran'): Promise<PView> {
  const m = await load('../../lib/embed/posture');
  return fn<(b: PostureBoard, c: string) => PView>(m, 'postureEmbedView')(b, conflict);
}
async function pvHtml(v: PView): Promise<string> {
  const m = await load('../../lib/embed/posture');
  return fn<(v: PView) => string>(m, 'renderPostureEmbed')(v);
}

// --- brief fixture: the shape of the live Day 228 overnight brief (sections[0] = one "list" section) ----
const src = (name: string, url: string, published_at = '2026-10-12T20:17:00Z', extra: Record<string, unknown> = {}) => ({ name, url, published_at, tier: 1, party_source: false, ...extra });
const BRIEF = {
  conflict_day: 228,
  report_type: 'overnight',
  title: 'Day 228 Overnight: TEST headline <b>bold</b>',
  lead: 'TEST lead.',
  quality: 'full',
  generated_at: '2026-10-13T01:56:03Z',
  sections: [
    {
      id: 'changes', type: 'list', heading: 'Changes between 16:30 and 01:30 UTC',
      subsections: [
        {
          id: 'changes_main', heading: 'Ranked by consequence',
          paragraphs: [
            { text: 'First item said Gen. Smith in Riyadh on Monday. Second sentence is not shown.', sources: [src('ABC News', 'https://abc.example/1')] },
            { text: 'Unsourced item that must never be shown as a bullet.', sources: [] },
            { text: 'Licence-blocked item citing a tanker count.', sources: [src("Lloyd's List", 'https://lloydslist.example/x')] },
            { text: 'Third item from a state outlet and a wire. More text.', sources: [src('IRNA', 'https://irna.ir/x', '2026-10-12T21:00:00Z', { party_source: true }), src('Reuters', 'https://reuters.example/y')] },
            { text: 'Fourth item reported by a single party outlet.', sources: [src('Tasnim', 'https://tasnimnews.com/z', '2026-10-12T22:00:00Z', { party_source: true })] },
            { text: 'Fifth item is beyond the first three bullets.', sources: [src('BBC', 'https://bbc.example/5')] },
          ],
        },
      ],
    },
    { id: 'markets', type: 'analysis', heading: 'Markets', subsections: [{ id: 'm', heading: 'M', paragraphs: [{ text: 'Analysis item must not be picked while a list section exists.', sources: [src('FT', 'https://ft.example/m')] }] }] },
  ],
};
type Bullet = { text: string; outlet: string; url: string; partySource: boolean };
type BView = { state: 'ok' | 'stale' | 'empty'; day: number | null; title: string | null; path: string; bullets: Bullet[]; staleNote: string | null; quality: string | null };
async function bv(r: unknown, type: string, nowIso: string): Promise<BView> {
  const m = await load('../../lib/embed/brief');
  return fn<(r: unknown, t: string, now: Date) => BView>(m, 'briefEmbedView')(r, type, new Date(nowIso));
}
async function bvHtml(v: BView): Promise<string> {
  const m = await load('../../lib/embed/brief');
  return fn<(v: BView) => string>(m, 'renderBriefEmbed')(v);
}

async function main() {
  // ---------------------------------------------------------------------------- chokepoints
  await check('chokepoints: the committed file renders its real values (copied, never recomputed) at Day 228', async () => {
    const v = await cp(LATEST, '2026-10-13T12:00:00Z');
    assert.equal(v.state, 'ok', `errors: ${v.errors.join('; ')}`);
    assert.deepEqual(v.lanes.map((l) => l.id), ['suez', 'bam_redsea', 'hormuz']);
    for (const l of v.lanes) {
      const f = LATEST.lanes.find((x: { lane: string }) => x.lane === l.id);
      assert.equal(l.status, f.status);
      assert.equal(l.indexPct, f.index_pct_of_2023);
      assert.equal(l.transits, f.transits_week);
      assert.equal(l.weekStart, f.week_start);
      assert.equal(l.weekEnd, f.week_end);
    }
    assert.equal(v.sourceCredit, LATEST.source_credit);
    assert.match(String(v.sourceCredit), /IMF PortWatch \(UN Global Platform\), AIS-based/);
    assert.equal(v.staleNote, null);
    const html = await cpHtml(v);
    assert.match(html, /Suez Canal/);
    assert.match(html, /58\.6%/);
    assert.match(html, /IMF PortWatch \(UN Global Platform\), AIS-based/);
    assert.doesNotMatch(html, /Not updated since/);
  });

  await check('chokepoints: as_of 8 days old is still current; 9 days old is greyed "Not updated since 8 Oct 2026" (gates.mjs MAX_AGE_DAYS)', async () => {
    assert.equal((await cp(LATEST, '2026-10-16T23:00:00Z')).state, 'ok');
    const v = await cp(LATEST, '2026-10-17T00:30:00Z');
    assert.equal(v.state, 'stale');
    assert.equal(v.staleNote, 'Not updated since 8 Oct 2026');
    assert.equal(v.lanes.length, 3, 'a stale block still shows its (dated) values, greyed');
    const html = await cpHtml(v);
    assert.match(html, /Not updated since 8 Oct 2026/);
    assert.match(html, /class="[^"]*\bstale\b/);
  });

  await check('chokepoints: a data week ending > 13 days ago is stale even when as_of is fresh (gates.mjs MAX_WEEK_END_AGE_DAYS)', async () => {
    const f = clone(LATEST);
    for (const l of f.lanes) l.as_of = '2026-10-18T09:00:00Z';
    f.as_of = '2026-10-18T09:00:00Z';
    const v = await cp(f, '2026-10-18T10:00:00Z'); // week_end 2026-10-04 -> 14 days
    assert.equal(v.state, 'stale');
    assert.equal(v.staleNote, 'Not updated since 18 Oct 2026');
  });

  await check('chokepoints: a file failing any other gate shows NO numbers (index that does not follow from the counts, missing file)', async () => {
    const f = clone(LATEST);
    f.lanes[0].index_pct_of_2023 = 75.0; // 302 / 515.4 = 58.6%, so 75.0 is inconsistent (and its band too)
    const v = await cp(f, '2026-10-13T12:00:00Z');
    assert.equal(v.state, 'invalid');
    assert.equal(v.lanes.length, 0);
    assert.ok(v.errors.some((e) => /index/.test(e)), v.errors.join('; '));
    const html = await cpHtml(v);
    assert.doesNotMatch(html, /75(\.0)?%/);
    assert.doesNotMatch(html, /58\.6%/);
    assert.equal((await cp(null, '2026-10-13T12:00:00Z')).state, 'invalid');
    // errors from the other card blocks (scenarios, brief) never leak into the chokepoint verdict
    assert.ok(v.errors.every((e) => e.startsWith('chokepoints')), v.errors.join('; '));
  });

  // ---------------------------------------------------------------------------- posture
  await check('posture: EG / AE / SA never carry a grade — policy rows AND a forged graded row both read "Stated positions only"', async () => {
    const b = board([
      row({ country_code: 'IR', expressed_score: 80, label: 'continued_pressure' }),
      posture.withheldPolicyRow('AE'),
      posture.withheldPolicyRow('SA'),
      forgedGrade('EG'),
    ]);
    const v = await pv(b);
    for (const cc of ['EG', 'AE', 'SA']) {
      const l = v.lines.find((x) => x.key.startsWith(`${cc}|`));
      assert.ok(l, `${cc} line missing`);
      assert.equal(l!.withheld, true);
      assert.equal(l!.score, null);
      assert.equal(l!.stanceText, 'Stated positions only');
    }
    const ir = v.lines.find((x) => x.key.startsWith('IR|'))!;
    assert.equal(ir.score, 80);
    assert.equal(ir.stanceText, 'Supports continued pressure');
    const html = await pvHtml(v);
    assert.doesNotMatch(html, /\b99\b/, 'the forged EG grade must not reach the HTML');
    assert.match(html, /Stated positions only/);
  });

  await check('posture: Yemen is two separate lines (Government (PLC) / Ansar Allah de facto authority), each its own score', async () => {
    const b = board([
      row({ country_code: 'YE', actor: 'government', expressed_score: 70, label: 'continued_pressure' }),
      row({ country_code: 'YE', actor: 'de_facto_authority', expressed_score: 95, label: 'escalation' }),
    ]);
    const v = await pv(b);
    const ye = v.lines.filter((l) => l.key.startsWith('YE|'));
    assert.equal(ye.length, 2);
    const gov = ye.find((l) => l.actor === 'government')!;
    const dfa = ye.find((l) => l.actor === 'de_facto_authority')!;
    assert.equal(gov.label, 'Yemen — Government (PLC)');
    assert.equal(dfa.label, 'Yemen — Ansar Allah (Houthi), de facto authority');
    assert.equal(gov.score, 70);
    assert.equal(dfa.score, 95);
  });

  await check('posture: a Yemen line with no row on this conflict is still shown, as "No position captured", never borrowing the other line', async () => {
    const v = await pv(board([row({ country_code: 'YE', actor: 'government', expressed_score: 70 })]));
    const ye = v.lines.filter((l) => l.key.startsWith('YE|'));
    assert.equal(ye.length, 2);
    const dfa = ye.find((l) => l.actor === 'de_facto_authority')!;
    assert.equal(dfa.score, null);
    assert.match(dfa.stanceText, /No position captured/);
  });

  await check('posture: only the requested conflict; frozen v1 rows are counted, never filed under a real war', async () => {
    const frozen: PostureView = { ...row({ country_code: 'QA' }), method: posture.POSTURE_V1_METHOD, conflict_code: null, score_day: 224 };
    const b = board([
      row({ country_code: 'IR' }),
      row({ country_code: 'ET', conflict_code: 'horn-tigray' }),
      frozen,
    ]);
    const v = await pv(b, 'us-iran');
    assert.deepEqual(v.lines.map((l) => l.key.split('|')[0]), ['IR']);
    assert.equal(v.frozenV1Count, 1);
    assert.equal(v.conflictName, 'US–Iran');
    const horn = await pv(b, 'horn-tigray');
    assert.deepEqual(horn.lines.map((l) => l.key.split('|')[0]), ['ET']);
  });

  await check('posture: a v1 board (no v2 rows yet) shows its rows as blended, as the /nai map does', async () => {
    const v1row: PostureView = { ...row({ country_code: 'IR', expressed_score: 60, label: 'ambivalent' }), method: posture.POSTURE_V1_METHOD, conflict_code: null };
    const v = await pv(board([v1row], 'v1'));
    assert.equal(v.blended, true);
    assert.equal(v.lines.length, 1);
    assert.match(await pvHtml(v), /blended/i);
  });

  await check('posture: end-to-end through getPostureBoard (fake PostgREST): withheld EG row with a score never shows the score', async () => {
    const client = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'lt', 'lte', 'gt', 'order', 'limit', 'in']) b[m] = () => b;
        b.maybeSingle = async () => ({ data: null, error: null });
        b.then = (res: (r: unknown) => unknown) => Promise.resolve({ data: [...posture.CONFLICTS_FALLBACK], error: null }).then(res);
        return b;
      },
      rpc: async (name: string) =>
        name === 'viewer_posture_v2'
          ? { data: [{ ...v2Base, country_code: 'EG', expressed_score: 88, withheld: false }, { ...v2Base, country_code: 'IR' }], error: null }
          : { data: [], error: null },
    } as unknown as Parameters<typeof posture.getPostureBoard>[0];
    const b = await posture.getPostureBoard(client, { day: 228, access: ANON });
    const v = await pv(b);
    const eg = v.lines.find((l) => l.key.startsWith('EG|'))!;
    assert.equal(eg.score, null);
    assert.equal(eg.stanceText, 'Stated positions only');
    assert.doesNotMatch(await pvHtml(v), /\b88\b/);
  });

  // ---------------------------------------------------------------------------- brief
  await check('brief: headline + first 3 SOURCED bullets of the list section, verbatim first sentence, non-party outlet preferred', async () => {
    const v = await bv(BRIEF, 'overnight', '2026-10-13T06:00:00Z');
    assert.equal(v.state, 'ok');
    assert.equal(v.day, 228);
    assert.equal(v.path, '/briefings/228/overnight');
    assert.equal(v.title, BRIEF.title);
    assert.deepEqual(
      v.bullets.map((b) => b.text),
      [
        'First item said Gen. Smith in Riyadh on Monday.',
        'Third item from a state outlet and a wire.',
        'Fourth item reported by a single party outlet.',
      ],
    );
    assert.deepEqual(v.bullets.map((b) => b.outlet), ['ABC News', 'Reuters', 'Tasnim']);
    assert.equal(v.bullets[1].url, 'https://reuters.example/y');
    assert.deepEqual(v.bullets.map((b) => b.partySource), [false, false, true]);
    const html = await bvHtml(v);
    assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/, 'headline is HTML-escaped');
    assert.doesNotMatch(html, /Unsourced item|Lloyd|lloydslist|Fifth item|Analysis item/);
    assert.match(html, /href="https:\/\/reuters\.example\/y"[^>]*rel="noopener/);
  });

  await check('brief: no list section -> first sourced paragraph per subsection of the brief, in order', async () => {
    const r = { ...BRIEF, sections: [BRIEF.sections[1]] };
    const v = await bv(r, 'overnight', '2026-10-13T06:00:00Z');
    assert.deepEqual(v.bullets.map((b) => b.text), ['Analysis item must not be picked while a list section exists.']);
  });

  await check('brief: older than the card brief limit (1 day) is greyed "Not updated since"; no row -> empty state linking the index', async () => {
    const v = await bv(BRIEF, 'overnight', '2026-10-15T06:00:00Z');
    assert.equal(v.state, 'stale');
    assert.equal(v.staleNote, 'Not updated since 13 Oct 2026');
    assert.match(await bvHtml(v), /class="[^"]*\bstale\b/);
    const e = await bv(null, 'overnight', '2026-10-13T06:00:00Z');
    assert.equal(e.state, 'empty');
    assert.equal(e.bullets.length, 0);
    assert.equal(e.path, '/briefings');
  });

  // ---------------------------------------------------------------------------- shared shell
  await check('embed shell: attribution footer links the full page with rel noopener, light/dark via prefers-color-scheme, no scripts', async () => {
    const html = await cpHtml(await cp(LATEST, '2026-10-13T12:00:00Z'));
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /MENA Intel Desk/);
    assert.match(html, /<footer[\s\S]*<a [^>]*href="https:\/\/[^"]+"[^>]*target="_blank"[^>]*rel="noopener[^"]*"/);
    assert.match(html, /prefers-color-scheme:\s*dark/);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /cloudflareinsights|plausible/i, 'no analytics inside partner embeds');
  });

  // ---------------------------------------------------------------------------- headers + analytics
  await check('security headers: framing allowed only on /embed/*; site keeps DENY + frame-ancestors none', async () => {
    const h = await load('../../lib/security-headers');
    const isEmbed = fn<(p: string) => boolean>(h, 'isEmbedPath');
    assert.equal(isEmbed('/embed/chokepoints'), true);
    assert.equal(isEmbed('/embed/brief/latest'), true);
    assert.equal(isEmbed('/embed'), false, 'the snippet page itself is not frameable');
    assert.equal(isEmbed('/embedded'), false);
    assert.equal(isEmbed('/admin/embed/x'), false);
    const embed = h.EMBED_SECURITY_HEADERS as Record<string, string>;
    assert.match(embed['Content-Security-Policy'], /frame-ancestors \*/);
    assert.match(embed['Content-Security-Policy'], /script-src 'none'/);
    assert.equal(embed['X-Frame-Options'], undefined);
    const site = h.SECURITY_HEADERS as Record<string, string>;
    assert.equal(site['X-Frame-Options'], 'DENY');
    assert.match(site['Content-Security-Policy'], /frame-ancestors 'none'/);
    // applyEmbedSecurityHeaders removes an X-Frame-Options set earlier on the same response
    const res = { headers: new Headers({ 'X-Frame-Options': 'DENY' }) };
    fn<(r: typeof res) => typeof res>(h, 'applyEmbedSecurityHeaders')(res);
    assert.equal(res.headers.get('X-Frame-Options'), null);
    assert.match(String(res.headers.get('Content-Security-Policy')), /frame-ancestors \*/);
  });

  await check('CSP: Cloudflare Web Analytics hosts appear only when the beacon token is set', async () => {
    const h = await load('../../lib/security-headers');
    const csp = fn<(o?: { beacon?: boolean }) => string>(h, 'contentSecurityPolicy');
    assert.doesNotMatch(csp(), /cloudflareinsights/);
    assert.doesNotMatch(csp({ beacon: false }), /cloudflareinsights/);
    const on = csp({ beacon: true });
    assert.match(on, /script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
    assert.match(on, /connect-src [^;]*https:\/\/cloudflareinsights\.com/);
    assert.match(on, /frame-ancestors 'none'/);
  });

  await check('analytics: NEXT_PUBLIC_CF_BEACON_TOKEN is used only when it looks like a token', async () => {
    const a = await load('../../lib/analytics');
    const tok = fn<(raw?: string | null) => string | null>(a, 'cfBeaconToken');
    assert.equal(tok(undefined), null);
    assert.equal(tok(''), null);
    assert.equal(tok('   '), null);
    assert.equal(tok(' 0123456789abcdef0123456789abcdef '), '0123456789abcdef0123456789abcdef');
    assert.equal(tok('abc"}\'><script>'), null);
    assert.equal(a.CF_BEACON_SRC, 'https://static.cloudflareinsights.com/beacon.min.js');
  });

  const failed = results.filter((r) => r.err);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
