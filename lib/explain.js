/*
 * Gemma 4 report writer (shared by server.js and the Vercel functions).
 * Gemma receives measurements, the rule-based change flags, the function twin's
 * estimates, and scan findings. Its only job is to put them in plain language.
 * It must not diagnose, grade, weigh tumor response against side effects, or
 * advise on dosing.
 */
import Trends from '../src/core/trends.js';
import NerveTwin from '../src/core/twin.js';
import Scans from '../src/core/scans.js';
import { checkinsForTwin, isDemoCheckins, personalMeasurementInputs } from '../src/core/checkinSource.js';
import { askGemma, MODEL } from './gemma.js';

const SYSTEM = `You write short summaries for a chemotherapy patient and their oncology team.
Data: phone-based check-ins before each chemo infusion (30-second walk, 20-second feet-together balance test
with eyes open and optionally eyes closed, a 10-second finger-tapping test per hand, nerve-symptom questions), a "function twin" (a Kalman-filter model that fuses those signals into an estimated
score from 0 to 100 for how much walking, balance, and hand function have changed since baseline, with an
uncertainty range). It describes what happened; it does not predict anything. The twin measures FUNCTION, not nerves: changes can
come from neuropathy but also from fatigue, anemia, pain, deconditioning, or other causes. Never call it a nerve-damage score,
and tumor measurements extracted from the patient's radiology reports.

Rules:
- Only describe what the data says. Never invent numbers.
- Do not diagnose, do not assign a neuropathy grade, never suggest changing, delaying, or stopping treatment,
  and never weigh tumor response against side effects or say whether treatment is "worth it".
- Phone measurements and the twin are approximate, uncalibrated, and only meaningful against the patient's own baseline.
- Treat any "excluded from personal estimate" measurement as unavailable; never interpret or repeat its value as a personal result.
- When the input says demo is true, describe the estimates and measurements as fictional demo data, not a real patient's results.
- If two doctors read the same scan differently, say so neutrally without picking a side.
- Patient text: warm, calm, 6th-grade reading level, 3-5 sentences, ends by encouraging them to share this with their care team.
- Twin text: 2 sentences in plain words about the latest function score (100 = how the patient was at their first check-in; lower = more change), and its model uncertainty range. Mention that only the care team can tell what is causing a change.
- When you mention the twin anywhere, use the function score (100 = first check-in), never a "change" number. Never predict future changes or talk about what was "expected".
- Scans text: 2-3 sentences on what the radiology reports say about tumor size over time (empty string if no scans).
- Clinician text: concise factual lines with cycle numbers and values; note the measures are unvalidated.
- Questions: 3 short questions for the next visit.
Return ONLY JSON: { "patient": string, "twin": string, "scans": string, "clinician": string, "questions": [3 strings] }`;

function buildPayload(checkins, scans = []) {
  const demo = isDemoCheckins(checkins);
  const twinInputs = checkinsForTwin(checkins, demo);
  const measurementInputs = demo ? checkins : personalMeasurementInputs(checkins);
  const base = twinInputs[0], latest = twinInputs[twinInputs.length - 1];
  const twin = NerveTwin.run(twinInputs);
  const rows = checkins.map((c, i) => {
    const input = measurementInputs[i];
    const hasExcludedWalk = !!c.gait?.ok && !input.gait?.ok;
    const hasExcludedBalance = !!c.balance?.ok && !input.balance?.ok;
    const hasExcludedBalanceClosed = !!c.balanceClosed?.ok && !input.balanceClosed?.ok;
    const hasExcludedTapping = !!c.tapping && !input.tapping;
    return {
    cycle: c.cycle, date: c.date, symptoms: c.symptoms, buttonsTrouble: !!c.buttons, falls: c.falls || 'none',
    walk: input.gait?.ok ? { cadence_steps_per_min: input.gait.cadence, step_regularity_0to1: input.gait.stepRegularity, step_time_variability_pct: input.gait.stepTimeCV, hesitations: input.gait.hesitations } : hasExcludedWalk ? 'excluded from personal estimate: sample or unverified source' : 'not completed',
    balance: input.balance?.ok ? { sway_index_eyes_open: +(input.balance.swayRms * 100).toFixed(1), eyes_closed_to_open_ratio: input.balanceClosed?.ok ? +(input.balanceClosed.swayRms / input.balance.swayRms).toFixed(2) : hasExcludedBalanceClosed ? 'excluded from personal estimate: sample or unverified source' : 'not done' } : hasExcludedBalance ? 'excluded from personal estimate: sample or unverified source' : 'not completed',
    finger_tapping_taps_per_sec: input.tapping ? { right: input.tapping.right?.ok ? input.tapping.right.rate : null, left: input.tapping.left?.ok ? input.tapping.left.rate : null } : hasExcludedTapping ? 'excluded from personal estimate: sample or unverified source' : 'not done',
    twin: { function_score: Math.round(twin[i].score), likely_range: [Math.round(twin[i].scoreLow), Math.round(twin[i].scoreHigh)] },
    };
  });
  const flags = Trends.compare(base, latest);
  const scanRows = Scans.groupOpinions(scans).map((g) => ({
    date: g[0].date, type: g[0].kind,
    reads: g.map((s) => ({ reader: s.reader || 'radiologist', measured_mm: s.extracted.lesions.map((l) => `${l.location}: ${l.sizeMm}${l.previousMm ? ` (previously ${l.previousMm})` : ''}`), radiologist_impression: s.extracted.impression, new_findings: !!s.extracted.newLesions })),
  }));
  return { rows, flags, twin, scanRows, overall: Trends.overall(flags), demo };
}

function templateExplain(p, why) {
  const n = p.rows.length, last = p.rows[n - 1], t = p.twin[n - 1];
  const discrepancies = p.twin.filter((s) => s.surprise !== 'none').map((s) => s.cycle);
  const excludedNote = !p.demo && p.rows.some((row) => [row.walk, row.balance, row.finger_tapping_taps_per_sec].some((value) => typeof value === 'string' && value.startsWith('excluded from personal estimate')))
    ? 'Sample or unverified physical measurements were excluded from the personal estimate; symptom answers were retained.'
    : null;
  const patient = p.flags.length
    ? `Since your first check-in, a few things have changed. ${p.flags.slice(0, 2).map((f) => f.text).join(' ')} Changes like these can happen during chemotherapy and are worth mentioning. Please share this report with your care team before your next infusion.`
    : excludedNote
      ? `Some physical measurements were excluded because they were sample or their source was not verified. Your symptom answers were retained. Please share this report with your care team.`
      : `Your walking, balance, and symptoms look about the same as at your first check-in. That's useful information for your care team. Keep checking in before each infusion, and share this report at your next visit.`;
  const modelNote = p.flags.length
    ? 'Recorded changes from baseline are described above.'
    : discrepancies.length
      ? `The experimental model estimate differs from recorded signals at cycle ${discrepancies.join(', ')}; that model discrepancy alone does not establish deterioration.`
      : 'No recorded symptom or sensor change crossed the comparison thresholds.';
  const twin = `${p.demo ? 'The fictional demo' : 'The personal'} experimental function score is ${Math.round(t.score)} out of 100 at cycle ${last.cycle}, where 100 is the first check-in (model uncertainty range ${Math.round(t.scoreLow)}–${Math.round(t.scoreHigh)}). ${modelNote}${excludedNote ? ` ${excludedNote}` : ''} Only the care team can tell what is causing a change.`;
  const scans = p.scanRows.length
    ? p.scanRows.map((g) => `${g.type} on ${g.date}: ${g.reads.map((r) => `${r.reader} said "${r.radiologist_impression.slice(0, 160)}"`).join('; ')}`).join(' ')
    : '';
  const clinician = [`Phone-based check-ins: ${n} (cycles ${p.rows.map((c) => c.cycle).join(', ')}).`,
    `Experimental function score (uncalibrated Kalman filter; function, not nerve-specific): ${p.twin.map((s) => `C${s.cycle} ${Math.round(s.score)} [model uncertainty ${Math.round(s.scoreLow)}–${Math.round(s.scoreHigh)}]`).join(', ')}.`,
    ...(p.flags.length ? p.flags.map((f) => `• ${f.text}`) : ['• No changes beyond thresholds versus baseline.']),
    ...(excludedNote ? [excludedNote] : []),
    'Measures are unvalidated smartphone estimates; interpret against the patient\'s own trend only.'].join('\n');
  const questions = p.flags.length
    ? ['Are the changes in my walking or balance something to watch?', 'Should I be doing anything to stay safe from falls at home?', 'Who should I call if my numbness gets worse between visits?']
    : ['What nerve symptoms should I watch for during treatment?', 'Who should I call if I notice numbness or tingling?', 'How often should I do these check-ins?'];
  return { patient, twin, scans, clinician, questions, source: 'template', note: why };
}

async function explain(checkins, scans) {
  if (!Array.isArray(checkins) || !checkins.length) throw Object.assign(new Error('No check-ins were sent.'), { status: 400 });
  if (checkins.length > 40 || (scans && scans.length > 40)) throw Object.assign(new Error('Too much data in one request.'), { status: 400 });
  checkins = [...checkins].sort((a, b) => a.cycle - b.cycle);
  const p = buildPayload(checkins, Array.isArray(scans) ? scans.filter((s) => s?.extracted?.lesions) : []);
  const r = await askGemma({
    system: SYSTEM,
    text: 'Data (oldest first):\n' + JSON.stringify({ demo: p.demo, checkins: p.rows, changesSinceBaseline: p.flags.map((f) => `[${f.level}] ${f.text}`), scans: p.scanRows }, null, 1),
    maxTokens: 1400,
  });
  if (!r.ok) return templateExplain(p, r.reason);
  const j = r.json;
  if (typeof j.patient !== 'string') return templateExplain(p, 'Gemma replied, but not in the expected format.');
  return { patient: j.patient, twin: String(j.twin || ''), scans: String(j.scans || ''), clinician: String(j.clinician || ''), questions: (j.questions || []).slice(0, 3).map(String), source: 'gemma', model: MODEL };
}

export { explain, buildPayload, MODEL };
