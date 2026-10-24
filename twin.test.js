// Run: node test/twin.test.js — checks the function twin model behaves sensibly.
const NT = require('../public/nervetwin.js');
const G = require('../public/gait.js');
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

const noWalk = NT.run([mk(1, 0, null, null), mk(2, 5, null, null)]);
check('works with symptoms only', noWalk[1].mean > 0 && noWalk[1].signals.filter((s) => s.value != null).length === 3);

console.log(failed ? `\n${failed} failed` : '\nAll checks passed'); process.exit(failed ? 1 : 0);
