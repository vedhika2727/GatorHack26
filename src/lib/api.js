// Calls to the Gemma 4 server routes, with clearly labeled offline fallbacks.
import Trends from '../core/trends.js';
import FunctionTwin from '../core/twin.js';
import Scans from '../core/scans.js';
import { HOSTED_PREVIEW } from '../store.jsx';
import { fmtDate } from './format.js';

const NO_SERVER = HOSTED_PREVIEW
  ? 'This hosted preview has no Gemma server, so built-in template text is shown. Run the app with its server to get Gemma 4.'
  : "The Gemma server couldn't be reached, so built-in template text is shown.";

async function post(path, body) {
  if (HOSTED_PREVIEW) throw new Error('preview');
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `Error ${res.status}`), { status: res.status });
  return out;
}

export async function writeReport(checkins, scans) {
  const slim = checkins.map(({ gait, ...c }) => ({ ...c, gait: gait ? { ...gait, stepTimes: undefined } : gait }));
  try { return await post('/api/explain', { checkins: slim, scans: scans.map(({ images, ...s }) => s) }); }
  catch (_) { return localReport(checkins, scans, NO_SERVER); }
}

export async function explainOpinions(a, b) {
  try { return await post('/api/opinions', { a: { reader: a.reader, text: a.text, extracted: a.extracted }, b: { reader: b.reader, text: b.text, extracted: b.extracted } }); }
  catch (_) { return localOpinions(a, b, NO_SERVER); }
}

export async function readReport({ text, image }) {
  try { return await post('/api/extract', image ? { image } : { text }); }
  catch (e) {
    if (image) throw new Error(HOSTED_PREVIEW ? "Reading a photo of a report needs Gemma, which this hosted preview doesn't have. Paste the report text instead." : e.message);
    return { extracted: Scans.verify(Scans.extractRules(text), text), source: 'rules', note: HOSTED_PREVIEW ? 'This hosted preview has no Gemma server, so built-in rules read the report.' : "The Gemma server couldn't be reached, so built-in rules read the report.", text };
  }
}

export function localReport(list, scanList, why) {
  const flags = Trends.compare(list[0], list[list.length - 1]);
  const tw = FunctionTwin.run(list), t = tw[tw.length - 1], last = list[list.length - 1];
  const worse = tw.filter((x) => x.surprise === 'worse').map((x) => x.cycle);
  const groups = Scans.groupOpinions(scanList);
  return {
    patient: flags.length
      ? `Since your first check-in, a few things have changed. ${flags.slice(0, 2).map((f) => f.text).join(' ')} Changes like these can happen during chemotherapy and are worth mentioning. Please share this report with your care team before your next infusion.`
      : "Your walking, balance, hand tests, and symptoms look about the same as at your first check-in. That's useful information for your care team. Keep checking in before each infusion, and share this report at your next visit.",
    twin: `The twin estimates that walking, balance, and hand function have changed by ${t.mean} out of 100 (likely between ${t.low} and ${t.high}) at cycle ${last.cycle}.${worse.length ? ` The check-in at cycle ${worse.join(', ')} was worse than the twin expected.` : ''} Only your care team can tell what is causing a change.`,
    scans: groups.map((g) => `${g[0].kind} on ${fmtDate(g[0].date)}: ${g.map((x) => `${x.reader || 'radiologist'} said "${x.extracted.impression.slice(0, 160)}"`).join('; ')}`).join(' '),
    clinician: [`Phone-based check-ins: ${list.length} (cycles ${list.map((c) => c.cycle).join(', ')}).`, `Function-change twin (uncalibrated Kalman filter; not nerve-specific): ${tw.map((x) => `C${x.cycle} ${x.mean} [${x.low}–${x.high}]`).join(', ')}.`, ...(flags.length ? flags.map((f) => `• ${f.text}`) : ['• No changes beyond thresholds versus baseline.']), "Unvalidated smartphone measures; interpret against the patient's own trend only."].join('\n'),
    questions: flags.length ? ['Are the changes in my walking, balance, or hands something to watch?', 'Should I be doing anything to stay safe from falls at home?', 'Who should I call if my numbness gets worse between visits?'] : ['What nerve symptoms should I watch for during treatment?', 'Who should I call if I notice numbness or tingling?', 'How often should I do these check-ins?'],
    source: 'template', note: why,
  };
}

export function localOpinions(a, b, why) {
  const cmp = Scans.compareReads(a, b), parts = [];
  const agree = cmp.rows.filter((r) => r.status === 'agree').map((r) => r.location);
  if (agree.length) parts.push(`Both reports give similar measurements for: ${agree.join(', ')}.`);
  for (const r of cmp.rows) {
    if (r.status === 'size') parts.push(`They measured the ${r.location} differently: ${r.a} mm versus ${r.b} mm.`);
    if (r.status === 'only-a') parts.push(`Only the first report lists the ${r.location}.`);
    if (r.status === 'only-b') parts.push(`Only the second report lists the ${r.location}.`);
  }
  if (!cmp.sameNew) parts.push('One report describes a new finding and the other does not.');
  if (!cmp.sameChange) parts.push('Their overall conclusions about change differ.');
  parts.push('Radiologists can differ because they measure at slightly different points or compare with different earlier scans. Your oncologist can help you understand what the differences mean for you.');
  return { summary: parts.join(' '), questions: ['Which measurements will you use to judge how treatment is working?', 'Does the difference between the two reports change anything about my care?', 'Should the finding they disagree on be checked again on my next scan?'], source: 'template', note: why };
}
