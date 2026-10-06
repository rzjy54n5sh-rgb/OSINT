/**
 * Boundary checks for postureLabel() (lib/nai-v2.ts). The repo has no unit-test runner
 * (Playwright e2e only), so this is a plain assert script:
 *
 *   npx --yes tsx tests/unit/nai-posture-label.check.ts
 *
 * Exits non-zero on the first failed assertion. Deliberately NOT named *.test.ts / *.spec.ts so
 * Playwright's testMatch does not pick it up.
 */
import assert from 'node:assert/strict';
import {
  NAI_POSTURE_COLOR,
  NAI_POSTURE_LABELS,
  postureColor,
  postureLabel,
  type PostureLabel,
} from '../../lib/nai-v2';

const cases: [unknown, PostureLabel | null][] = [
  [0, 'Ceasefire-seeking'],
  [10, 'Ceasefire-seeking'],
  [24, 'Ceasefire-seeking'],
  [25, 'De-escalatory'],
  [49, 'De-escalatory'],
  [50, 'Conditional pressure'],
  [74, 'Conditional pressure'],
  [75, 'Escalatory'],
  [90, 'Escalatory'],
  [100, 'Escalatory'],
  [24.5, 'Ceasefire-seeking'], // numeric column may carry decimals: still below the 25 cut-point
  [null, null],
  [undefined, null],
  [-1, null],
  [101, null],
  [Number.NaN, null],
  [Number.POSITIVE_INFINITY, null],
];

let failed = 0;
for (const [input, expected] of cases) {
  try {
    assert.equal(postureLabel(input as number | null), expected);
    console.log(`ok   postureLabel(${String(input)}) -> ${expected}`);
  } catch (err) {
    failed++;
    console.error(`FAIL postureLabel(${String(input)}): ${(err as Error).message.split('\n')[0]}`);
  }
}

// Every label has exactly one colour, all four colours are distinct, null has none.
try {
  assert.equal(new Set(NAI_POSTURE_LABELS.map((l) => NAI_POSTURE_COLOR[l])).size, 4);
  assert.equal(postureColor(null), null);
  assert.equal(postureColor(80), NAI_POSTURE_COLOR['Escalatory']);
  console.log('ok   colour ramp: 4 distinct steps, null -> null');
} catch (err) {
  failed++;
  console.error(`FAIL colour ramp: ${(err as Error).message.split('\n')[0]}`);
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nall ${cases.length + 1} checks passed`);
