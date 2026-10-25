// Run: node test/scans.test.js — checks spot tracking across scan reports.
import Scans from '../src/core/scans.js';
import { buildDemoScans } from '../src/core/demoScans.js';
import { buildDemoCheckins } from '../src/core/demo.js';
let failed = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${d}`); if (!c) failed++; };

const { dates, tracks } = Scans.lesionTracks(buildDemoScans(buildDemoCheckins()));
check('one column per scan date (second opinion merged)', dates.length === 3, dates.join(', '));
const seg7 = tracks.find((t) => /7/.test(t.location));
check('differently worded spots join one track', seg7 && seg7.points.every(Boolean), seg7 && seg7.points.map((p) => p?.mm).join(' '));
check('change since first scan is computed', seg7?.changePct === -44, `${seg7?.changePct}%`);
const last = seg7?.points[2];
check('second read adds a range', last && last.min === 18 && last.max === 22, last && `${last.min}-${last.max}`);
const nodule = tracks.find((t) => /lobe/.test(t.location));
check('a spot first seen later starts a new track', nodule && !nodule.points[0] && nodule.points[2]?.mm === 4);
check('no tracks from no scans', Scans.lesionTracks([]).tracks.length === 0);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
