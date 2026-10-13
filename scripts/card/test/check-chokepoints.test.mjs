// node --test test/   (no network, no browser). The PR CI chokepoint check (check-chokepoints.mjs).
// "now" is derived from the file's own as_of so these tests keep passing when the weekly file changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chokepointErrors } from '../check-chokepoints.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CP = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'data', 'chokepoints', 'latest.json'), 'utf8'));
const FRESH = new Date(Date.parse(CP.as_of) + 60 * 60 * 1000);

test('the committed file passes one hour after its own as_of', () => {
  assert.deepEqual(chokepointErrors(structuredClone(CP), FRESH), []);
});

test('only chokepoint errors are reported (no scenario / brief errors leak in)', () => {
  const errs = chokepointErrors(structuredClone(CP), new Date(FRESH.getTime() + 30 * 86400e3));
  assert.ok(errs.length > 0);
  assert.ok(errs.every((e) => /^(STALE )?chokepoints/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => e.startsWith('STALE chokepoints')));
});

test('a tampered index and a missing source URL are refused', () => {
  const cp = structuredClone(CP);
  cp.lanes[0].index_pct_of_2023 += 10;
  cp.lanes[1].source_url = '';
  const errs = chokepointErrors(cp, FRESH);
  assert.ok(errs.some((e) => /does not match transits\/baseline/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /source_url missing/.test(e)), errs.join('\n'));
});

test('a file with the wrong schema is refused', () => {
  assert.deepEqual(chokepointErrors({ schema: 'other' }, FRESH), ['chokepoints: file missing or schema is not "chokepoints/v1"']);
});
