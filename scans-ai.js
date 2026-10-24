/*
 * Gemma 4 for scan reports:
 *   extractReport({ text, image })  -> structured findings, every size checked against the text
 *   explainOpinions({ a, b })       -> neutral plain-language comparison of two reads of one scan
 */
const Scans = require('../public/scans.js');
const { askGemma, MODEL } = require('./gemma.js');

const EXTRACT_SYSTEM = `You read radiology reports for a patient-facing app.
Extract ONLY what the report states. Never estimate or invent a measurement.
Return ONLY JSON:
{
 "transcript": string (only if you were given an image: the full report text you can read; otherwise ""),
 "lesions": [ { "location": short site name in plain words (e.g. "liver, segment 7"), "size_mm": longest stated size converted to millimeters, "previous_size_mm": previous size in mm if the report states it, else null } ],
 "change": one of "first" (no comparison to a prior scan), "smaller", "larger", "stable", "mixed", "unclear" — based on the radiologist's own impression,
 "new_lesions": true only if the report says there are new findings,
 "plain": 2-3 sentences explaining the impression at a 6th-grade reading level. Do not add any judgment that is not in the report.
}`;

async function extractReport({ text, image }) {
  text = String(text || '').slice(0, 20000);
  if (!text.trim() && !image) throw Object.assign(new Error('Paste the report text or upload a file.'), { status: 400 });
  if (image && (!image.data || image.data.length > 8e6)) throw Object.assign(new Error('That image is too large. Try a smaller photo.'), { status: 400 });

  const r = await askGemma({ system: EXTRACT_SYSTEM, text: image ? 'Read this photo of a radiology report and extract the findings.' : 'Report:\n' + text, image, maxTokens: image ? 2500 : 1200 });
  if (!r.ok) {
    if (image) throw Object.assign(new Error(`Reading a photo needs Gemma. ${r.reason} Paste the report text instead.`), { status: 503 });
    const ex = Scans.verify(Scans.extractRules(text), text);
    return { extracted: { ...ex, plain: null }, source: 'rules', note: r.reason, text };
  }
  const j = r.json;
  const sourceText = image ? String(j.transcript || '') : text;
  const mapped = {
    lesions: (Array.isArray(j.lesions) ? j.lesions : []).slice(0, 12).map((l) => ({ location: l.location, sizeMm: Number(l.size_mm), previousMm: l.previous_size_mm == null ? null : Number(l.previous_size_mm) })),
    impression: Scans.extractRules(sourceText).impression,
    change: ['first', 'smaller', 'larger', 'stable', 'mixed', 'unclear'].includes(j.change) ? j.change : 'unclear',
    newLesions: !!j.new_lesions,
    plain: typeof j.plain === 'string' ? j.plain.slice(0, 800) : null,
  };
  // Hallucination guard: keep only sizes that literally appear in the report text.
  const ex = Scans.verify(mapped, sourceText);
  return { extracted: ex, source: 'gemma', model: MODEL, text: sourceText, fromPhoto: !!image };
}

const OPINION_SYSTEM = `Two doctors read the same scan and wrote separate reports. Explain to the patient, neutrally:
- what both reports agree on,
- where they differ (sizes, whether something is new, the overall conclusion),
- common, general reasons radiologists can differ (for example: measuring a lesion at a slightly different point, having different prior images to compare, or judging a small finding differently).
Never say which doctor is right. Never recommend treatment. 6th-grade reading level. Use only facts in the reports.
Return ONLY JSON: { "summary": 4-6 sentences, "questions": [3 short questions the patient could ask their oncologist about the differences] }`;

function templateOpinions(a, b, cmp) {
  const diffs = cmp.rows.filter((r) => r.status !== 'agree');
  const agree = cmp.rows.filter((r) => r.status === 'agree').map((r) => r.location);
  const parts = [];
  if (agree.length) parts.push(`Both reports give similar measurements for: ${agree.join(', ')}.`);
  for (const r of diffs) {
    if (r.status === 'size') parts.push(`They measured the ${r.location} differently: ${r.a} mm versus ${r.b} mm.`);
    if (r.status === 'only-a') parts.push(`Only the first report lists a measurement for the ${r.location}.`);
    if (r.status === 'only-b') parts.push(`Only the second report lists a measurement for the ${r.location}.`);
  }
  if (!cmp.sameNew) parts.push(`One report describes a new finding and the other does not.`);
  if (!cmp.sameChange) parts.push(`Their overall conclusions about change differ.`);
  parts.push('Radiologists can differ because they measure at slightly different points or compare with different earlier scans. Your oncologist can help you understand what the differences mean for you.');
  return {
    summary: parts.join(' '),
    questions: ['Which measurements will you use to judge how treatment is working?', 'Does the difference between the two reports change anything about my care?', 'Should the finding they disagree on be checked again on my next scan?'],
  };
}

async function explainOpinions({ a, b }) {
  if (!a?.text || !b?.text) throw Object.assign(new Error('Two reports are needed.'), { status: 400 });
  const ea = Scans.verify(Scans.extractRules(a.text), a.text), eb = Scans.verify(Scans.extractRules(b.text), b.text);
  const cmp = Scans.compareReads({ extracted: a.extracted || ea }, { extracted: b.extracted || eb });
  const r = await askGemma({ system: OPINION_SYSTEM, text: `Report 1 (read by: ${a.reader || 'doctor 1'}):\n${a.text.slice(0, 8000)}\n\nReport 2 (read by: ${b.reader || 'doctor 2'}):\n${b.text.slice(0, 8000)}`, maxTokens: 900 });
  if (!r.ok) return { ...templateOpinions(a, b, cmp), source: 'template', note: r.reason };
  return { summary: String(r.json.summary || ''), questions: (r.json.questions || []).slice(0, 3).map(String), source: 'gemma', model: MODEL };
}

module.exports = { extractReport, explainOpinions };
