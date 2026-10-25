import { readFileSync } from 'node:fs';
import { formatReportValue, isMissingReportValue } from '../src/core/reportFormat.js';
import { reportInputDescription, reportPatientSummary, reportQuestions } from '../src/core/reportWording.js';

let failed = 0;
const check = (name, actual, expected) => {
  const pass = actual === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` (expected ${expected}, got ${actual})`}`);
  if (!pass) failed++;
};

check('null is missing', isMissingReportValue(null), true);
check('undefined is missing', isMissingReportValue(undefined), true);
check('NaN is missing', isMissingReportValue(Number.NaN), true);
check('infinity is missing', isMissingReportValue(Number.POSITIVE_INFINITY), true);
check('zero is a measured value', formatReportValue(0, 'steps/min'), '0 steps/min');
check('null has no unit suffix', formatReportValue(null, 'steps/min'), 'Not measured');
check('undefined percentage has no suffix', formatReportValue(undefined, '%'), 'Not measured');
check('non-finite value has no suffix', formatReportValue(Number.NaN, 'of 1'), 'Not measured');
check('valid percent formatting is preserved', formatReportValue(2.5, '%'), '2.5%');
check('text categories are preserved', formatReportValue('Near-fall'), 'Near-fall');
const symptomOnly = [
  { symptoms: { feetNumb: 1, handsNumb: 0, feetPain: 0 } },
  { symptoms: { feetNumb: 4, handsNumb: 0, feetPain: 0 } },
];
const symptomsDescription = reportInputDescription(symptomOnly);
const symptomsSummary = reportPatientSummary(
  symptomsDescription,
  [{ text: 'Reports numbness or tingling in the feet at 4/10 (baseline 1/10).' }],
  symptomOnly.length,
);
check('symptoms-only estimate is explicitly based on reported symptoms', /uses reported symptoms only/.test(symptomsDescription), true);
check('symptoms-only estimate does not imply physical performance was measured', /walking, balance, and hand performance were not measured/.test(symptomsDescription), true);
check('patient summary includes the supported symptom change', /numbness or tingling in the feet/.test(symptomsSummary), true);
check('eligible recorded walking and balance are identified', reportInputDescription([{ symptoms: { feetNumb: 0 }, gait: { ok: true }, balance: { ok: true } }]), 'This estimate uses reported symptoms and eligible recorded measurements for walking, balance.');

const demoDescription = reportInputDescription([{ demo: true }], true);
const demoSummary = reportPatientSummary(demoDescription, [], 1, true);
check('demo input description explicitly identifies fictional simulated data', /fictional demo data; simulated measurements and fictional symptom responses/.test(demoDescription), true);
check('demo summary says it does not describe a real person', /do not describe a real person/.test(demoSummary), true);
check('patient questions are phrased from patient to clinician', reportQuestions([{ id: 'feetNumb' }]).every((question) => /\bI\b|\bme\b|\bmy\b/i.test(question)), true);

const reportSource = readFileSync(new URL('../src/screens/Report.jsx', import.meta.url), 'utf8');
check('Report imports and uses the current input-description helper', /import \{ reportInputDescription \}/.test(reportSource) && (reportSource.match(/reportInputDescription\(/g) || []).length >= 2, true);
check('Report has no stale score-input helper reference', !reportSource.includes('reportScoreInputNote'), true);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
