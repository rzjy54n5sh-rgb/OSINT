#!/usr/bin/env node
// Runs the chokepoint part of the daily card's data-quality gate (lib/gates.mjs runGates, the same
// function render-card.mjs uses) on one chokepoints/v1 file, without network or Chromium.
// Used by PR CI when a PR changes data/chokepoints/latest.json: the file must pass exactly what the
// next scheduled card run would demand (allowStale = false, now = the current time).
//
// Usage: node scripts/card/check-chokepoints.mjs [FILE] [--now ISO]
//   FILE defaults to data/chokepoints/latest.json. Exit 0 pass · 1 usage / unreadable · 2 gate refused.
// Scenario and brief blocks are not part of this check: they come from the database, not the PR.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runGates } from './lib/gates.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Chokepoint errors only: "chokepoints..." and "STALE chokepoints..." (gates.mjs message format). */
export function chokepointErrors(chokepoints, now) {
  const gate = runGates({ chokepoints, registry: [], daily: [], brief: null, changes: [] }, { now, allowStale: false });
  return gate.errors.filter((e) => e.replace(/^STALE /, '').startsWith('chokepoints'));
}

function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { now: { type: 'string' } } });
  } catch (e) {
    console.error(`check-chokepoints: ${e.message}`);
    process.exit(1);
  }
  const file = args.positionals[0] ?? join(REPO, 'data', 'chokepoints', 'latest.json');
  const now = args.values.now ? new Date(args.values.now) : new Date();
  if (Number.isNaN(now.getTime())) { console.error(`check-chokepoints: --now ${args.values.now} is not a date`); process.exit(1); }
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`check-chokepoints: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const errors = chokepointErrors(data, now);
  console.log(`check-chokepoints: ${file} at now=${now.toISOString()} (allowStale=false)`);
  if (errors.length) {
    console.error(`check-chokepoints: REFUSED, ${errors.length} chokepoint gate failure(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    process.exit(2);
  }
  console.log('check-chokepoints: PASS (the daily card would accept this chokepoint block)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
