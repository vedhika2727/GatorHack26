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
const rep = 'FINDINGS:\nLiver: Segment 7 lesion measures 1.8 cm, previously 2.4 cm. Segment 4 lesion measures 0.9 cm.\nIMPRESSION: Decrease.';
const src = Scans.sourceOf(rep, { location: 'Segment 7 lesion', sizeMm: 18, previousMm: 24 });
check('source: finds the sentence that states the size', src && /Segment 7/.test(src.sentence), src?.sentence);
check('source: marks the size and the previous size', src?.marks.length === 2 && src.sentence.slice(...src.marks[0]) === '1.8 cm' && src.sentence.slice(...src.marks[1]) === '2.4 cm');
check('source: none for a size not in the report', Scans.sourceOf(rep, { location: 'lung', sizeMm: 33 }) === null);
check('no tracks from no scans', Scans.lesionTracks([]).tracks.length === 0);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
