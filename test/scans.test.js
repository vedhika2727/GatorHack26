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
const lk = (loc, mm) => ({ location: loc, sizeMm: mm });
const reads = [
  { reader: 'A', extracted: { lesions: [lk('Segment 7 lesion', 18), lk('axillary lymph node', 11)], newLesions: true, change: 'smaller' } },
  { reader: 'B', extracted: { lesions: [lk('liver segment 7', 22), lk('axillary node', 11)], newLesions: false, change: 'smaller' } },
  { reader: 'C', extracted: { lesions: [lk('segment 7 lesion', 19), lk('axillary lymph node', 12), lk('right adrenal nodule', 8)], newLesions: false, change: 'smaller' } },
];
const many = Scans.compareMany(reads);
const r7 = many.rows.find((x) => /7/.test(x.location));
check('compare 3 reads: one row per spot, a value per read', many.rows.length === 3 && r7.values.join() === '18,22,19', r7?.values.join());
check('compare 3 reads: a 4 mm gap on an 18-22 mm spot differs', r7.status === 'differ' && r7.spread === 4);
check('compare 3 reads: close sizes agree', many.rows.find((x) => /axillary/.test(x.location)).status === 'agree');
check('compare 3 reads: a spot only one doctor measured is marked', many.rows.find((x) => /adrenal/.test(x.location)).status === 'some');
check('compare 3 reads: disagreement on new findings counts', !many.sameNew && many.sameChange && many.differences === 3, `differences ${many.differences}`);
check('template explanation names every doctor', /A 18 mm, B 22 mm, C 19 mm/.test(Scans.opinionsTemplate(reads).summary));
check('no tracks from no scans', Scans.lesionTracks([]).tracks.length === 0);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
