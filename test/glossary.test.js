// Run: node test/glossary.test.js — checks that report words are found and explained.
import G from '../src/core/glossary.js';
let failed = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${d}`); if (!c) failed++; };

const t = 'Hepatic lesions in segments 7 and 4 and an enlarged left axillary lymph node, consistent with metastatic disease.';
const found = G.segments(t).filter((s) => s.entry).map((s) => s.text);
check('finds report words', ['Hepatic', 'lesions', 'axillary', 'lymph node', 'consistent with', 'metastatic disease'].every((w) => found.includes(w)), found.join(', '));
check('longest phrase wins', found.includes('metastatic disease') && !found.includes('metastatic'));
check('text is kept exactly', G.segments(t).map((s) => s.text).join('') === t);
check('no matches inside other words', !G.segments('Segmental anatomy. Nodular.').some((s) => s.entry));
check('lookup ignores case and plurals', G.lookup('AXILLARY')?.plain === 'In the armpit.' && !!G.lookup('nodules'));
check('unknown word returns null', G.lookup('banana') === null);
check('termsIn lists each word once', G.termsIn('lesion lesion lesion').length === 1);
check('meanings never mention the patient', G.ENTRIES.every((e) => !/\byou(r)?\b.*(cancer|tumou?r) (is|has)/i.test(e.plain)));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
