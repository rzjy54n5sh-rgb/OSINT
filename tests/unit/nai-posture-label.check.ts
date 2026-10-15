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
  [0, 'Seeks immediate ceasefire'],
  [12, 'Seeks immediate ceasefire'],
  [12.4, 'Seeks immediate ceasefire'], // numeric column may carry decimals: rounded like the SQL integer column
  [13, 'Conditional de-escalation'],
  [25, 'Conditional de-escalation'],
  [37, 'Conditional de-escalation'],
  [38, 'Ambivalent'],
  [50, 'Ambivalent'],
  [62, 'Ambivalent'],
  [63, 'Supports continued pressure'],
  [75, 'Supports continued pressure'],
  [87, 'Supports continued pressure'],
  [88, 'Supports escalation'],
  [100, 'Supports escalation'],
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

// Every label has exactly one colour, taken from the v2 War Posture scale (four bands: the two
// de-escalation labels share band 1), null has none.
try {
  assert.deepEqual(
    NAI_POSTURE_LABELS.map((l) => NAI_POSTURE_COLOR[l]),
    ['var(--posture-1, #6FA8F0)', 'var(--posture-1, #6FA8F0)', 'var(--posture-2, #98A3B3)', 'var(--posture-3, #E8A066)', 'var(--posture-4, #FF7F3F)'],
  );
  // postureColor(e) is the SCORE band: 35 is band 2 although its label (Conditional de-escalation) anchors in band 1.
  assert.equal(postureColor(35), 'var(--posture-2, #98A3B3)');
  assert.equal(postureColor(85), 'var(--posture-4, #FF7F3F)');
  // EG / AE / SA: no posture colour, whatever the score.
  for (const cc of ['EG', 'AE', 'SA', 'sa']) assert.equal(postureColor(85, cc), null, cc);
  assert.equal(postureColor(85, 'IR'), 'var(--posture-4, #FF7F3F)');
  assert.equal(postureColor(null), null);
  assert.equal(postureColor(80), NAI_POSTURE_COLOR['Supports continued pressure']);
  // No adjective labels survive (War Posture v2, editorial seat 08).
  assert.ok(!NAI_POSTURE_LABELS.some((l) => /escalatory/i.test(l)));
  console.log('ok   colour ramp: v2 posture scale (label anchor, score band for scores), null -> null, no adjective labels');
} catch (err) {
  failed++;
  console.error(`FAIL colour ramp: ${(err as Error).message.split('\n')[0]}`);
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nall ${cases.length + 1} checks passed`);
