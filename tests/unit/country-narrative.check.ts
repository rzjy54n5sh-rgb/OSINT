/**
 * parseNarrative() (lib/country-narrative.ts) must never throw on bad source rows — a throw is a
 * 500 on the paid /countries/[slug] page. Plain assert script (the repo has no unit runner):
 *
 *   npx --yes tsx tests/unit/country-narrative.check.ts
 */
import assert from 'node:assert/strict';
import { parseNarrative, NARRATIVE_KEYS } from '../../lib/country-narrative';

const bad = [
  { url: 'https://', name: 'empty host' },
  { url: 'http://exa mple.com', name: 'space in host' },
  { url: 'javascript:alert(1)', name: 'js' },
  { url: 'JaVaScRiPt:alert(1)' },
  { url: 'data:text/html,<script>' },
  { url: '//evil.com' },
  { url: 'ftp://example.com/x' },
  { url: 42 },
  { url: null },
  null,
  'string',
  [],
];
const good = { url: 'https://www.aljazeera.com/news/x', name: 'Al Jazeera', published_at: '2026-10-04' };
const noName = { url: 'https://example.org/path?q=1' };

// Before the fix, `new URL('https://')` threw here (500 on the paid country page).
const n = parseNarrative({ assessment: 'Day 222: text', sources: [...bad, good, noName] });
assert.ok(n);
const sources = n.sources;
assert.equal(sources.length, 2, `only the two valid sources survive, got ${JSON.stringify(sources)}`);
assert.equal(sources[0]!.name, 'Al Jazeera');
assert.equal(sources[1]!.name, 'example.org', 'hostname fallback when name is missing');
assert.ok(sources.every((s) => /^https?:\/\/[^/\s]+/.test(s.url)));

// Legacy keys are ignored; only maintained keys are read.
const legacy = parseNarrative({ nai: { expressed: 5 }, scenarios: { A: 5 }, elite_network: [{ name: 'x' }], social_summary: 'old' });
assert.equal(legacy, null, 'a row with only legacy keys yields no narrative');
assert.deepEqual([...NARRATIVE_KEYS], ['assessment', 'key_risks', 'stabilizers', 'sources', 'data_integrity_note', 'generated_at']);

// Non-object inputs never throw.
for (const v of [null, undefined, 'x', 1, [], [1, 2]]) assert.equal(parseNarrative(v), null);

console.log('country-narrative.check: all assertions passed');
