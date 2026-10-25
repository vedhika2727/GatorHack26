// Run: node test/twin.test.js — checks the function twin model behaves sensibly.
import NT from '../src/core/twin.js';
import G from '../src/core/gait.js';
import { checkinsForPersonalTwin, checkinsForTwin } from '../src/core/checkinSource.js';
import Trends from '../src/core/trends.js';
let failed = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${d}`); if (!c) failed++; };
const walk = (o) => G.analyze(G.synthesizeWalk(o).samples);
const stand = (o) => G.analyzeBalance(G.synthesizeStand(o).samples, { trimSeconds: 1 });
const mk = (cycle, feet, w, s) => ({ cycle, date: `2026-01-${String(cycle).padStart(2, '0')}`, symptoms: { feetNumb: feet, handsNumb: 0, feetPain: 0 }, gait: w, balance: s });

const steady = [1, 2, 3, 4].map((c) => mk(c, 0, walk({ cadence: 110, cv: 1.6, seed: c }), stand({ sway: 0.03, seed: c })));
const rs = NT.run(steady);
check('steady patient stays low', rs[3].mean < 20, `estimate ${rs[3].mean}`);
check('uncertainty shrinks after baseline data', rs[3].sd < Math.sqrt(NT.PARAMS.P0 + NT.PARAMS.Q), `sd ${rs[3].sd}`);

const worse = [mk(1, 0, walk({ cadence: 110, cv: 1.6, seed: 1 }), stand({ sway: 0.03, seed: 1 })), mk(2, 1, walk({ cadence: 108, cv: 2, seed: 2 }), stand({ sway: 0.035, seed: 2 })), mk(3, 8, walk({ cadence: 85, cv: 6, pauses: 2, seed: 3 }), stand({ sway: 0.12, wobbles: 3, seed: 3 }))];
const rw = NT.run(worse);
check('sudden decline flagged as worse than expected', rw[2].surprise === 'worse', `z ${rw[2].surpriseZ}`);
check('estimate rises with decline', rw[2].mean > rw[1].mean + 20, `${rw[1].mean} -> ${rw[2].mean}`);

const mixed = [1, 2, 3].map((c) => mk(c, c === 3 ? 8 : 0, walk({ cadence: 110, cv: 1.6, seed: c }), stand({ sway: 0.03, seed: c })));
const rm = NT.run(mixed);
check('one high signal alone moves estimate less than all signals', rm[2].mean < rw[2].mean, `${rm[2].mean} vs ${rw[2].mean}`);
check('disagreement is described', /disagree/.test(NT.disagreements(rm[2]) || ''), NT.disagreements(rm[2]));
check('signal shares sum to ~1', Math.abs(rm[2].signals.reduce((t, g) => t + (g.share || 0), 0) - 1) < 0.02);
check(
  'model discrepancy without recorded change is described neutrally',
  /does not establish deterioration/.test(NT.interpretation({ surprise: 'worse' }, false)),
);
check(
  'supported recorded changes are described relative to baseline',
  /Recorded changes from baseline/.test(NT.interpretation({ surprise: 'worse' }, true)),
);

const noWalk = NT.run([mk(1, 0, null, null), mk(2, 5, null, null)]);
check('works with symptoms only', noWalk[1].mean > 0 && noWalk[1].signals.filter((s) => s.value != null).length === 3);

const physical = (cadence, sway, tapRate, seed) => ({
  gait: walk({ cadence, cv: 3, seed }),
  balance: stand({ sway, seed }),
  balanceClosed: stand({ sway: sway * 1.6, seed: seed + 10 }),
  tapping: {
    right: G.analyzeTapping(G.synthesizeTaps({ rate: tapRate, seed }), 10),
    left: G.analyzeTapping(G.synthesizeTaps({ rate: tapRate, seed: seed + 1 }), 10),
  },
});
const history = [
  { ...mk(1, 0, null, null), ...physical(60, 0.3, 2, 10), source: 'sample' },
  {
    ...mk(2, 1, null, null), ...physical(82, 0.15, 3.2, 20), source: 'mixed',
    measurementSources: { gait: 'sample', balance: 'sensor', balanceClosed: 'sample', tapping: 'sample' },
  },
  { ...mk(3, 2, null, null), ...physical(100, 0.04, 4.3, 30), source: 'sensor' },
  { ...mk(4, 3, null, null), gait: null, balance: null, balanceClosed: null, tapping: null, source: 'sensor' },
];
const changedSamples = history.map((checkin) => ({ ...checkin }));
changedSamples[0] = {
  ...changedSamples[0],
  ...physical(140, 0.01, 6, 40),
};
changedSamples[1] = {
  ...changedSamples[1],
  gait: walk({ cadence: 40, cv: 20, seed: 50 }),
  balanceClosed: stand({ sway: 0.7, seed: 50 }),
  tapping: physical(80, 0.3, 1, 50).tapping,
};
const personalHistory = checkinsForPersonalTwin(history);
const changedPersonalHistory = checkinsForPersonalTwin(changedSamples);
const sampleHistory = NT.run(personalHistory);
const changedSampleHistory = NT.run(changedPersonalHistory);
check(
  'changing excluded sample measurements cannot change personal estimates',
  sampleHistory.every((step, index) => step.mean === changedSampleHistory[index].mean),
  `${sampleHistory.map((step) => step.mean).join(', ')} vs ${changedSampleHistory.map((step) => step.mean).join(', ')}`,
);
check(
  'changing excluded sample measurements cannot change personal change flags',
  JSON.stringify(Trends.compare(personalHistory[0], personalHistory[1]))
    === JSON.stringify(Trends.compare(changedPersonalHistory[0], changedPersonalHistory[1])),
);
check(
  'sample physical values are excluded from personal baseline and check-ins',
  personalHistory[0].gait.cadence === history[2].gait.cadence
    && personalHistory[0].tapping.right.rate === history[2].tapping.right.rate
    && personalHistory[1].gait === null
    && personalHistory[1].balance.swayRms === history[1].balance.swayRms,
);
check(
  'legacy mixed entries without task provenance exclude physical values but retain symptoms',
  (() => {
    const legacy = checkinsForPersonalTwin([{ ...history[1], measurementSources: undefined }])[0];
    return legacy.gait === null && legacy.balance === null && legacy.balanceClosed === null
      && legacy.tapping === null && legacy.symptoms === history[1].symptoms;
  })(),
);
check(
  'skipped measurements remain missing',
  personalHistory[3].gait === null && personalHistory[3].balance === null
    && personalHistory[3].balanceClosed === null && personalHistory[3].tapping === null,
);
const sensorOnly = [{ ...history[2], source: 'sensor', measurementSources: undefined }];
check(
  'legacy sensor-only check-ins remain available',
  checkinsForTwin(sensorOnly)[0].gait === sensorOnly[0].gait
    && checkinsForTwin(sensorOnly)[0].balance === sensorOnly[0].balance,
);
const demoHistory = history.map((checkin) => ({ ...checkin, demo: true, source: 'simulated' }));
check(
  'fictional demo measurements remain available',
  checkinsForTwin(demoHistory)[0].gait === demoHistory[0].gait,
);

console.log(failed ? `\n${failed} failed` : '\nAll checks passed'); process.exit(failed ? 1 : 0);
