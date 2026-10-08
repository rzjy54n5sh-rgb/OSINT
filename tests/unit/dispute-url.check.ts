/**
 * normalizeDisputeUrl() / articleUrlForDispute() must accept exactly what the disputes CHECK accepts
 * (source_url ~* '^https?://[^[:space:]]+$', <= 2048 chars). Plain assert script:
 *
 *   npx --yes tsx tests/unit/dispute-url.check.ts
 */
import assert from 'node:assert/strict';
import { articleUrlForDispute, normalizeDisputeUrl } from '../../lib/dispute-url';

const DB_CHECK = /^https?:\/\/\S+$/i;
const cases: [string, string | null][] = [
  ['https://www.reuters.com/world/x', 'https://www.reuters.com/world/x'],
  ['  http://apnews.com/a  ', 'http://apnews.com/a'],
  ['HTTPS://BBC.CO.UK/x', 'HTTPS://BBC.CO.UK/x'],
  ['reuters.com/world/x', 'https://reuters.com/world/x'],
  ['www.aljazeera.com/news', 'https://www.aljazeera.com/news'],
  ['//example.org/p', 'https://example.org/p'],
  ['example.org:8443/p', 'https://example.org:8443/p'],
  ['javascript:alert(1)', null],
  ['mailto:a@b.co', null],
  ['ftp://files.example.org/x', null],
  ['data:text/html,hi', null],
  ['https://exa mple.org/x', null],
  ['not a url', null],
  ['localhost:3000/x', null],
  ['', null],
  ['https://e.org/' + 'a'.repeat(2050), null],
];
let failed = 0;
for (const [input, expected] of cases) {
  const got = normalizeDisputeUrl(input);
  if (got !== expected) { failed++; console.error(`FAIL normalizeDisputeUrl(${JSON.stringify(input.slice(0, 40))}) = ${got}, expected ${expected}`); }
  if (got !== null) assert.ok(DB_CHECK.test(got) && got.length <= 2048, `accepted value must pass the DB CHECK: ${got}`);
}
assert.equal(articleUrlForDispute('https://www.reuters.com/a'), 'https://www.reuters.com/a');
assert.equal(articleUrlForDispute('www.reuters.com/a'), null);
assert.equal(articleUrlForDispute('https://x.org/a b'), null);
assert.equal(articleUrlForDispute(null), null);
if (failed) process.exit(1);
console.log(`dispute-url.check: all ${cases.length + 4} checks passed`);
