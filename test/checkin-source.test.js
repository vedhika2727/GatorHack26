import { withSampleData } from '../src/core/checkinSource.js';

let failed = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` (expected ${expected}, got ${actual})`}`);
  if (!pass) failed++;
}

check('sample tapping after real sensor measurements is labeled mixed', withSampleData('sensor', true), 'mixed');
check('sample tapping with skipped sensor tests is labeled sample', withSampleData('sensor', false), 'sample');
check('adding a sample to an already sample-based check-in stays sample', withSampleData('sample', true), 'sample');
check('adding a sample to mixed measurements stays mixed', withSampleData('mixed', true), 'mixed');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
