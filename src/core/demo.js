/*
 * Demo patient: six chemo cycles, three weeks apart, with nerve symptoms that
 * slowly build. Walks and balance tests are SIMULATED, then run through the
 * same analysis engine as real recordings.
 */
import Gait from './gait.js';

const plan = [
  { cadence: 112, cv: 1.6, asym: 0, pauses: 0, sway: 0.030, wob: 0, closed: 1.5, tap: 4.8, feet: 0, hands: 0, pain: 0, buttons: false, falls: 'none' },
  { cadence: 111, cv: 1.8, asym: 1, pauses: 0, sway: 0.032, wob: 0, closed: 1.6, tap: 4.7, feet: 1, hands: 0, pain: 0, buttons: false, falls: 'none' },
  { cadence: 108, cv: 2.2, asym: 2, pauses: 0, sway: 0.040, wob: 0, closed: 1.8, tap: 4.6, feet: 2, hands: 1, pain: 1, buttons: false, falls: 'none' },
  { cadence: 103, cv: 3.4, asym: 4, pauses: 1, sway: 0.060, wob: 1, closed: 2.2, tap: 4.3, feet: 4, hands: 2, pain: 2, buttons: false, falls: 'none' },
  { cadence: 95, cv: 5.0, asym: 6, pauses: 1, sway: 0.085, wob: 2, closed: 2.8, tap: 3.9, feet: 6, hands: 4, pain: 4, buttons: true, falls: 'near' },
  { cadence: 92, cv: 5.8, asym: 8, pauses: 2, sway: 0.100, wob: 3, closed: 3.1, tap: 3.7, feet: 7, hands: 4, pain: 4, buttons: true, falls: 'near' },
];
function iso(d) { return d.toISOString().slice(0, 10); }
export function buildDemoCheckins() {
  const today = new Date();
  return plan.map((p, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (plan.length - 1 - i) * 21);
    const walk = Gait.synthesizeWalk({ cadence: p.cadence, cv: p.cv, asymmetry: p.asym, pauses: p.pauses, seed: 100 + i, seconds: 30 });
    const stand = Gait.synthesizeStand({ sway: p.sway, wobbles: p.wob, seed: 200 + i, seconds: 20 });
    return {
      id: `demo-${i + 1}`, demo: true, cycle: i + 1, date: iso(d),
      symptoms: { feetNumb: p.feet, handsNumb: p.hands, feetPain: p.pain },
      buttons: p.buttons, falls: p.falls,
      gait: Gait.analyze(walk.samples), balance: Gait.analyzeBalance(stand.samples, { trimSeconds: 1 }),
      balanceClosed: Gait.analyzeBalance(Gait.synthesizeStand({ sway: p.sway * p.closed, wobbles: p.wob, seed: 300 + i, seconds: 20 }).samples, { trimSeconds: 1 }),
      tapping: { right: Gait.analyzeTapping(Gait.synthesizeTaps({ rate: p.tap, cv: 14 + i * 2, missRate: 0.02 + i * 0.01, seed: 400 + i }), 10), left: Gait.analyzeTapping(Gait.synthesizeTaps({ rate: p.tap * 0.92, cv: 15 + i * 2, missRate: 0.03 + i * 0.01, seed: 500 + i }), 10) },
      source: 'simulated',
    };
  });
}
