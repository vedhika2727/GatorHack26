// Calls to the Gemma 4 server routes, with clearly labeled offline fallbacks.
import Trends from '../core/trends.js';
import FunctionTwin from '../core/twin.js';
import Scans from '../core/scans.js';
import Glossary from '../core/glossary.js';
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

export async function explainOpinions(...args) {
  const reads = (Array.isArray(args[0]) ? args[0] : args).map((r) => ({ reader: r.reader, text: r.text, extracted: r.extracted }));
  try { return await post('/api/opinions', { reads }); }
  catch (_) { return { ...Scans.opinionsTemplate(reads), source: 'template', note: NO_SERVER }; }
}

export async function explainTerm(term, context) {
  const known = Glossary.lookup(term);
  if (known) return { term, plain: known.plain, source: 'glossary' };
  try { return await post('/api/term', { term, context }); }
  catch (_) { return { term, plain: null, source: 'none', note: HOSTED_PREVIEW ? 'That word isn’t in the built-in list. In the full app, Gemma explains any word.' : 'That word isn’t in the built-in list, and Gemma couldn’t be reached.' }; }
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
    twin: `The function score is ${Math.round(t.score)} out of 100 at cycle ${last.cycle} (likely between ${Math.round(t.scoreLow)} and ${Math.round(t.scoreHigh)}), where 100 is how things were at the first check-in.${worse.length ? ` The check-in at cycle ${worse.join(', ')} was worse than the twin expected.` : ''} Only your care team can tell what is causing a change.`,
    scans: groups.map((g) => `${g[0].kind} on ${fmtDate(g[0].date)}: ${g.map((x) => `${x.reader || 'radiologist'} said "${x.extracted.impression.slice(0, 160)}"`).join('; ')}`).join(' '),
    clinician: [`Phone-based check-ins: ${list.length} (cycles ${list.map((c) => c.cycle).join(', ')}).`, `Function-change twin (uncalibrated Kalman filter; not nerve-specific): ${tw.map((x) => `C${x.cycle} ${x.mean} [${x.low}–${x.high}]`).join(', ')}.`, ...(flags.length ? flags.map((f) => `• ${f.text}`) : ['• No changes beyond thresholds versus baseline.']), "Unvalidated smartphone measures; interpret against the patient's own trend only."].join('\n'),
    questions: flags.length ? ['Are the changes in my walking, balance, or hands something to watch?', 'Should I be doing anything to stay safe from falls at home?', 'Who should I call if my numbness gets worse between visits?'] : ['What nerve symptoms should I watch for during treatment?', 'Who should I call if I notice numbness or tingling?', 'How often should I do these check-ins?'],
    source: 'template', note: why,
  };
}

