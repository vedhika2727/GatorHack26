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
import { askGemma, MODEL } from './gemma.js';

const SYSTEM = `You write short summaries for a chemotherapy patient and their oncology team.
Data: phone-based check-ins before each chemo infusion (30-second walk, 20-second feet-together balance test
with eyes open and optionally eyes closed, a 10-second finger-tapping test per hand, nerve-symptom questions), a "function twin" (a Kalman-filter model that fuses those signals into an estimated
score from 0 to 100 for how much walking, balance, and hand function have changed since baseline, with an
uncertainty range, and flags check-ins worse than it expected). The twin measures FUNCTION, not nerves: changes can
come from neuropathy but also from fatigue, anemia, pain, deconditioning, or other causes. Never call it a nerve-damage score,
and tumor measurements extracted from the patient's radiology reports.

Rules:
- Only describe what the data says. Never invent numbers.
- Do not diagnose, do not assign a neuropathy grade, never suggest changing, delaying, or stopping treatment,
  and never weigh tumor response against side effects or say whether treatment is "worth it".
- Phone measurements and the twin are approximate, uncalibrated, and only meaningful against the patient's own baseline.
- If two doctors read the same scan differently, say so neutrally without picking a side.
- Patient text: warm, calm, 6th-grade reading level, 3-5 sentences, ends by encouraging them to share this with their care team.
- Twin text: 2 sentences in plain words about the twin's latest estimate of change in function, its range, and any "worse than expected" check-in. Mention that only the care team can tell what is causing a change.
- Scans text: 2-3 sentences on what the radiology reports say about tumor size over time (empty string if no scans).
- Clinician text: concise factual lines with cycle numbers and values; note the measures are unvalidated.
- Questions: 3 short questions for the next visit.
Return ONLY JSON: { "patient": string, "twin": string, "scans": string, "clinician": string, "questions": [3 strings] }`;

function buildPayload(checkins, scans = []) {
  const base = checkins[0], latest = checkins[checkins.length - 1];
  const twin = NerveTwin.run(checkins);
  const rows = checkins.map((c, i) => ({
    cycle: c.cycle, date: c.date, symptoms: c.symptoms, buttonsTrouble: !!c.buttons, falls: c.falls || 'none',
    walk: c.gait?.ok ? { cadence_steps_per_min: c.gait.cadence, step_regularity_0to1: c.gait.stepRegularity, step_time_variability_pct: c.gait.stepTimeCV, hesitations: c.gait.hesitations } : 'not completed',
    balance: c.balance?.ok ? { sway_index_eyes_open: +(c.balance.swayRms * 100).toFixed(1), eyes_closed_to_open_ratio: c.balanceClosed?.ok ? +(c.balanceClosed.swayRms / c.balance.swayRms).toFixed(2) : 'not done' } : 'not completed',
    finger_tapping_taps_per_sec: c.tapping ? { right: c.tapping.right?.ok ? c.tapping.right.rate : null, left: c.tapping.left?.ok ? c.tapping.left.rate : null } : 'not done',
    twin: { estimate: twin[i].mean, likely_range: [twin[i].low, twin[i].high], expected_before_checkin: twin[i].priorMean, worse_than_expected: twin[i].surprise === 'worse' },
  }));
  const flags = Trends.compare(base, latest);
  const scanRows = Scans.groupOpinions(scans).map((g) => ({
    date: g[0].date, type: g[0].kind,
    reads: g.map((s) => ({ reader: s.reader || 'radiologist', measured_mm: s.extracted.lesions.map((l) => `${l.location}: ${l.sizeMm}${l.previousMm ? ` (previously ${l.previousMm})` : ''}`), radiologist_impression: s.extracted.impression, new_findings: !!s.extracted.newLesions })),
  }));
  return { rows, flags, twin, scanRows, overall: Trends.overall(flags) };
}

function templateExplain(p, why) {
  const n = p.rows.length, last = p.rows[n - 1], t = p.twin[n - 1];
  const surprises = p.twin.filter((s) => s.surprise === 'worse').map((s) => s.cycle);
  const patient = p.flags.length
    ? `Since your first check-in, a few things have changed. ${p.flags.slice(0, 2).map((f) => f.text).join(' ')} Changes like these can happen during chemotherapy and are worth mentioning. Please share this report with your care team before your next infusion.`
    : `Your walking, balance, and symptoms look about the same as at your first check-in. That's useful information for your care team. Keep checking in before each infusion, and share this report at your next visit.`;
  const twin = `The twin estimates that walking, balance, and hand function have changed by ${t.mean} out of 100 (likely between ${t.low} and ${t.high}) at cycle ${last.cycle}.${surprises.length ? ` Check-in${surprises.length > 1 ? 's' : ''} at cycle ${surprises.join(', ')} ${surprises.length > 1 ? 'were' : 'was'} worse than the twin expected.` : ' No check-in was much worse than the twin expected.'}`;
  const scans = p.scanRows.length
    ? p.scanRows.map((g) => `${g.type} on ${g.date}: ${g.reads.map((r) => `${r.reader} said "${r.radiologist_impression.slice(0, 160)}"`).join('; ')}`).join(' ')
    : '';
  const clinician = [`Phone-based check-ins: ${n} (cycles ${p.rows.map((c) => c.cycle).join(', ')}).`,
    `Function-change twin (uncalibrated Kalman filter; function, not nerve-specific): ${p.twin.map((s) => `C${s.cycle} ${s.mean} [${s.low}–${s.high}]`).join(', ')}.`,
    ...(p.flags.length ? p.flags.map((f) => `• ${f.text}`) : ['• No changes beyond thresholds versus baseline.']),
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
    text: 'Data (oldest first):\n' + JSON.stringify({ checkins: p.rows, changesSinceBaseline: p.flags.map((f) => `[${f.level}] ${f.text}`), scans: p.scanRows }, null, 1),
    maxTokens: 1400,
  });
  if (!r.ok) return templateExplain(p, r.reason);
  const j = r.json;
  if (typeof j.patient !== 'string') return templateExplain(p, 'Gemma replied, but not in the expected format.');
  return { patient: j.patient, twin: String(j.twin || ''), scans: String(j.scans || ''), clinician: String(j.clinician || ''), questions: (j.questions || []).slice(0, 3).map(String), source: 'gemma', model: MODEL };
}

export { explain, buildPayload, MODEL };
