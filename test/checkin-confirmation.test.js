import { confirmationMessage } from '../src/core/checkinConfirmation.js';
import { buildCheckinRecord } from '../src/core/checkinRecord.js';

const checks = [
  [
    'confirmation uses the saved check-in count for a baseline',
    confirmationMessage(1, 0),
    'This is your baseline. Check in again before your next infusion and your twin will start showing changes.',
  ],
  [
    'confirmation handles singular recorded change',
    confirmationMessage(2, 1),
    'Compared with your first check-in, 1 thing has changed. Your twin shows the details.',
  ],
  [
    'confirmation handles multiple recorded changes',
    confirmationMessage(2, 2),
    'Compared with your first check-in, 2 things have changed. Your twin shows the details.',
  ],
  [
    'confirmation does not claim change without recorded flags',
    confirmationMessage(2, 0),
    'Things look about the same as at your first check-in.',
  ],
];

let failed = 0;
for (const [name, actual, expected] of checks) {
  const pass = actual === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` (expected "${expected}", got "${actual}")`}`);
  if (!pass) failed++;
}

const tappingResults = {
  right: { ok: true, rate: 5.2, accuracy: 91 },
  left: { ok: true, rate: 4.8, accuracy: 88 },
};
const completed = buildCheckinRecord(
  { cycle: 2, symptoms: {}, tapping: null },
  { tapping: tappingResults },
  { tapping: 'sensor' },
  'c-completed',
  false,
);
if (completed.tapping?.right !== tappingResults.right || completed.tapping?.left !== tappingResults.left) {
  console.log('FAIL  completed check-in preserves both tapping hands');
  failed++;
} else console.log('PASS  completed check-in preserves both tapping hands');

const skipped = buildCheckinRecord(
  { cycle: 2, symptoms: {}, tapping: tappingResults },
  { tapping: null },
  {},
  'c-skipped',
  false,
);
if (skipped.tapping !== null || Object.hasOwn(skipped.measurementSources, 'tapping')) {
  console.log('FAIL  skipped tapping remains missing and unlabelled');
  failed++;
} else console.log('PASS  skipped tapping remains missing and unlabelled');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
