import {
  clearMeasurementSources,
  skipMeasurements,
  setMeasurementSource,
  sourceFromMeasurements,
  withSampleData,
} from '../src/core/checkinSource.js';

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
check('sample only remaining measurements stay sample', sourceFromMeasurements({ tapping: 'sample' }), 'sample');
check('sensor and sample measurements are mixed', sourceFromMeasurements({ gait: 'sensor', tapping: 'sample' }), 'mixed');
check('clearing the only sample result removes sample disclosure', sourceFromMeasurements(clearMeasurementSources({ tapping: 'sample' }, ['tapping'])), 'sensor');
check('clearing a sample from mixed results restores sensor label', sourceFromMeasurements(clearMeasurementSources({ gait: 'sensor', tapping: 'sample' }, ['tapping'])), 'sensor');
check('clearing a sensor result preserves remaining sample label', sourceFromMeasurements(clearMeasurementSources({ gait: 'sensor', tapping: 'sample' }, ['gait'])), 'sample');
check('skipped measurement source is removed', !Object.hasOwn(clearMeasurementSources({ gait: 'sample' }, ['gait']), 'gait'), true);
const previousWalk = { gait: { ok: true, cadence: 100 }, balance: { ok: true }, source: 'mixed' };
let walkCancelled = false;
const skippedWalk = skipMeasurements(previousWalk, { gait: 'sample', balance: 'sensor' }, ['gait'], () => { walkCancelled = true; });
check('skipping a measurement stops its active recording', walkCancelled, true);
check('skipping clears a prior measurement instead of saving zero', skippedWalk.checkin.gait === null, true);
check('skipping recalculates source from remaining measurements', skippedWalk.checkin.source, 'sensor');
const skippedHands = skipMeasurements({ tapping: { right: { ok: true }, left: { ok: true } }, source: 'sample' }, { tapping: 'sample' }, ['tapping']);
check('skipping hands clears both tapping results', skippedHands.checkin.tapping === null, true);
check('skipping the only sample result clears sample source', skippedHands.checkin.source, 'sensor');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
