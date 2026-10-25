/*
 * Gemma 4 for scan reports:
 *   extractReport({ text, image })  -> structured findings, every size checked against the text
 *   explainOpinions({ a, b })       -> neutral plain-language comparison of two reads of one scan
 *   explainTerm({ term, context })  -> one or two plain sentences on what a report word means in general
 */
import Scans from '../src/core/scans.js';
import Glossary from '../src/core/glossary.js';
import { askGemma, MODEL } from './gemma.js';

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

const OPINION_SYSTEM = `Two or more doctors read the same scan and wrote separate reports. Explain to the patient, neutrally:
- what the reports agree on,
- where they differ (sizes, whether something is new, the overall conclusion),
- common, general reasons radiologists can differ (for example: measuring a lesion at a slightly different point, having different prior images to compare, or judging a small finding differently).
Never say which doctor is right. Never recommend treatment. 6th-grade reading level. Use only facts in the reports.
Return ONLY JSON: { "summary": 4-6 sentences, "questions": [3 short questions the patient could ask their oncologist about the differences] }`;

async function explainOpinions({ a, b, reads }) {
  reads = (Array.isArray(reads) && reads.length ? reads : [a, b]).filter(Boolean).slice(0, 6);
  if (reads.length < 2 || reads.some((r) => !r?.text)) throw Object.assign(new Error('At least two reports are needed.'), { status: 400 });
  reads = reads.map((r) => ({ ...r, extracted: r.extracted || Scans.verify(Scans.extractRules(r.text), r.text) }));
  const r = await askGemma({ system: OPINION_SYSTEM, text: reads.map((x, i) => `Report ${i + 1} (read by: ${x.reader || `doctor ${i + 1}`}):\n${x.text.slice(0, 6000)}`).join('\n\n'), maxTokens: 900 });
  if (!r.ok) return { ...Scans.opinionsTemplate(reads), source: 'template', note: r.reason };
  return { summary: String(r.json.summary || ''), questions: (r.json.questions || []).slice(0, 3).map(String), source: 'gemma', model: MODEL };
}

const TERM_SYSTEM = `A patient is reading their radiology report and asks what one word or short phrase means.
Explain what the word means IN GENERAL, in 1-2 short sentences at a 6th-grade reading level.
Do not interpret the patient's report. Do not say whether anything is good, bad, serious, or normal for them.
No diagnosis and no treatment advice. If it is not a medical word, say so briefly.
Return ONLY JSON: { "plain": string }`;

async function explainTerm({ term, context }) {
  term = String(term || '').trim().slice(0, 60);
  if (!term) throw Object.assign(new Error('Type a word to look up.'), { status: 400 });
  const known = Glossary.lookup(term);
  if (known) return { term, plain: known.plain, source: 'glossary' };
  const r = await askGemma({ system: TERM_SYSTEM, text: `Word: ${term}${context ? `\nSentence it appears in: ${String(context).slice(0, 300)}` : ''}`, maxTokens: 200 });
  if (!r.ok) return { term, plain: null, source: 'none', note: r.reason };
  return { term, plain: String(r.json.plain || '').slice(0, 400), source: 'gemma', model: MODEL };
}

export { extractReport, explainOpinions, explainTerm };
