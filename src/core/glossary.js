/*
 * Plain-language meanings for words that show up in radiology reports.
 * Each meaning explains the word in general. None of them interprets a particular report.
 *   lookup(word)      -> entry or null
 *   segments(text)    -> [{ text, entry? }] with known words marked, longest match first
 *   termsIn(text)     -> unique entries found in a text, in order of first appearance
 */
const TERMS = [
  ['metastatic disease', 'Cancer that has spread from where it started to another part of the body.'],
  ['metastases|metastasis|metastatic', 'Cancer that has spread from where it started to another part of the body.'],
  ['hepatic', 'About the liver.'],
  ['hepatic segments?|segments?', 'The liver is divided into 8 numbered sections. The number tells you which part of the liver a spot is in.'],
  ['hypoattenuating|hypodense', 'Looks darker than the tissue around it on a CT image.'],
  ['attenuation|density', 'How bright or dark a tissue looks on a CT image.'],
  ['hyperattenuating|hyperdense', 'Looks brighter than the tissue around it on a CT image.'],
  ['lesions?', 'An area that looks different from normal tissue. The word alone doesn’t say what it is.'],
  ['nodules?', 'A small, round spot, usually smaller than 3 cm.'],
  ['mass', 'A lump, usually larger than 3 cm.'],
  ['axillary|axilla', 'In the armpit.'],
  ['lymph nodes?', 'Small, bean-shaped glands that are part of the immune system. They are found throughout the body, including the armpits, neck, and chest.'],
  ['adenopathy|lymphadenopathy', 'Lymph nodes that are larger than usual.'],
  ['enlarged', 'Bigger than usual.'],
  ['short axis', 'The narrowest width of a lymph node. Lymph nodes are usually measured this way.'],
  ['pulmonary', 'About the lungs.'],
  ['right lower lobe|right middle lobe|right upper lobe|left lower lobe|left upper lobe', 'The lungs are divided into lobes: three on the right and two on the left. This names which part of which lung.'],
  ['lobes?', 'One of the sections of a lung. The right lung has three, the left has two.'],
  ['osseous', 'About bone.'],
  ['interval', 'Since the last scan.'],
  ['consistent with', 'Fits with. The radiologist is saying the images match this explanation.'],
  ['response to therapy', 'A sign that the cancer is reacting to treatment, for example by getting smaller.'],
  ['indeterminate', 'Can’t be identified from this scan alone.'],
  ['attention on follow-up|follow-up', 'Worth looking at again on a later scan.'],
  ['benign', 'Not cancer.'],
  ['suspicious', 'Has features that could be cancer, so it deserves a closer look.'],
  ['with contrast|contrast', 'A dye given through a vein so organs and blood vessels show up more clearly on the scan.'],
  ['impression', 'The radiologist’s summary and conclusion. It’s usually the most important part of the report.'],
  ['findings', 'The detailed description of what the radiologist saw, organ by organ.'],
  ['prior study|prior imaging|prior', 'An earlier scan.'],
  ['comparison', 'The earlier scans this one was compared with.'],
  ['unremarkable', 'Normal. Nothing stood out.'],
  ['stable', 'About the same as on the earlier scan.'],
  ['pleural effusion|effusion', 'A build-up of fluid. A pleural effusion is fluid around the lungs.'],
  ['ascites', 'Fluid in the belly.'],
  ['mediastinal|mediastinum', 'The middle of the chest, between the lungs.'],
  ['hilar', 'Where the airways and blood vessels enter each lung.'],
  ['peritoneal|peritoneum', 'About the thin lining inside the belly.'],
  ['adrenal', 'The small glands that sit on top of the kidneys.'],
  ['sclerotic', 'Bone that looks denser than usual.'],
  ['lytic', 'Areas where bone looks thinner or worn away.'],
  ['hypermetabolic|fdg-avid|avid', 'On a PET scan: taking up more of the tracer than the tissue around it.'],
  ['fdg', 'A sugar-based tracer used in PET scans. Busy cells take up more of it.'],
  ['suv|suvmax', 'On a PET scan: a number for how much tracer a spot takes up.'],
  ['subcentimeter', 'Smaller than 1 cm.'],
  ['calcified|calcification', 'Contains calcium, which shows up bright on CT.'],
  ['cysts?', 'A small sac filled with fluid.'],
  ['spiculated', 'Has spiky lines coming off its edges.'],
  ['enhancing|enhancement', 'Lights up after the contrast dye is given.'],
];

const ENTRIES = TERMS.map(([pattern, plain]) => ({ word: pattern.split('|')[0].replace(/\?/g, '').replace(/s$/, (m, i, w) => (/(lesion|nodule|node|lobe|segment|cyst)s$/.test(w) ? '' : m)), pattern, plain }));
// Longest alternatives first, so "lymph node" wins over shorter words and "metastatic disease" over "metastatic".
const ALTS = ENTRIES.flatMap((e, i) => e.pattern.split('|').map((alt) => ({ alt, i }))).sort((a, b) => b.alt.length - a.alt.length);
const RE = new RegExp(`\\b(?:${ALTS.map((a) => `(${a.alt.replace(/[-]/g, '\\-').replace(/ /g, '\\s+')})`).join('|')})\\b`, 'gi');

function lookup(word) {
  const w = String(word || '').trim();
  if (!w) return null;
  RE.lastIndex = 0;
  const m = new RegExp(`^(?:${RE.source})$`, 'i').exec(w);
  if (!m) return null;
  const k = m.slice(1).findIndex((g) => g !== undefined);
  return ENTRIES[ALTS[k].i];
}

function segments(text) {
  const s = String(text || ''), out = [];
  let last = 0, m;
  RE.lastIndex = 0;
  while ((m = RE.exec(s))) {
    const k = m.slice(1).findIndex((g) => g !== undefined);
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[0], entry: ENTRIES[ALTS[k].i] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

function termsIn(text) {
  const seen = new Map();
  for (const seg of segments(text)) if (seg.entry && !seen.has(seg.entry.plain + seg.entry.word)) seen.set(seg.entry.plain + seg.entry.word, { ...seg.entry, as: seg.text });
  return [...seen.values()];
}

const api = { lookup, segments, termsIn, ENTRIES };
export const Glossary = api;
export default api;
