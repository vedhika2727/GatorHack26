// Run: node test/gait.test.js
// Checks the engine recovers known cadence / variability from synthetic walks.
const Gait = require('../public/gait.js');

let failed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`);
  if (!cond) failed++;
}

const cases = [
  { name: 'steady healthy walk', o: { cadence: 112, cv: 1.5, seed: 3 } },
  { name: 'slow walk', o: { cadence: 85, cv: 2, seed: 4 } },
  { name: 'fast walk', o: { cadence: 128, cv: 1.5, seed: 5 } },
  { name: 'irregular walk', o: { cadence: 100, cv: 6, seed: 6 } },
  { name: 'asymmetric walk', o: { cadence: 105, cv: 2, asymmetry: 12, seed: 7 } },
  { name: 'walk with pauses', o: { cadence: 100, cv: 3, pauses: 2, seed: 8, seconds: 40 } },
  { name: 'low sample rate (30 Hz)', o: { cadence: 110, cv: 2, rate: 30, seed: 9 } },
];

for (const c of cases) {
  const { samples, trueStepTimes } = Gait.synthesizeWalk(c.o);
  const r = Gait.analyze(samples);
  if (!r.ok) { check(c.name, false, r.reason); continue; }
  const cadErr = Math.abs(r.cadence - c.o.cadence) / c.o.cadence * 100;
  check(`${c.name}: cadence`, cadErr < 5, `true ${c.o.cadence}, got ${r.cadence} (${cadErr.toFixed(1)}% err)`);
  // Steps inside the analysed window (2 s trimmed each end)
  const dur = (samples[samples.length - 1].t) / 1000;
  const inWin = trueStepTimes.filter((t) => t >= 2 && t <= dur - 2).length;
  check(`${c.name}: step count`, Math.abs(r.steps - inWin) <= 2, `true ${inWin}, got ${r.steps}`);
  if (c.o.cv >= 5) check(`${c.name}: high variability flagged`, r.stepTimeCV > 3.5, `CV ${r.stepTimeCV}%`);
  if (c.o.cv <= 2 && !c.o.asymmetry) check(`${c.name}: low variability`, r.stepTimeCV < 3.5, `CV ${r.stepTimeCV}%`);
  if (c.o.asymmetry) check(`${c.name}: asymmetry flagged`, r.stepAsymmetry > 6, `asym ${r.stepAsymmetry}%`);
  if (c.o.pauses) check(`${c.name}: hesitations found`, r.hesitations >= 1, `hesitations ${r.hesitations}`);
}

// Failure modes
const still = Array.from({ length: 2000 }, (_, i) => ({ t: i * 16, ax: 0.1, ay: 9.8, az: 0.2 }));
check('phone lying still is rejected', !Gait.analyze(still).ok, Gait.analyze(still).reason);
check('too-short recording rejected', !Gait.analyze(Gait.synthesizeWalk({ seconds: 8 }).samples).ok);

// Balance
const calm = Gait.analyzeBalance(Gait.synthesizeStand({ sway: 0.03 }).samples);
const shaky = Gait.analyzeBalance(Gait.synthesizeStand({ sway: 0.12, wobbles: 3 }).samples);
check('balance: steady stance measured', calm.ok, JSON.stringify(calm));
check('balance: unsteady stance shows more sway', shaky.ok && shaky.swayRms > 2 * calm.swayRms, `${calm.swayRms} vs ${shaky.swayRms}`);
check('balance: walking during balance test rejected', !Gait.analyzeBalance(Gait.synthesizeWalk({}).samples).ok);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
