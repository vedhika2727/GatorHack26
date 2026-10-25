/*
 * Chemo Nerve Check — scan report logic (browser + Node).
 *   extractRules(text)      rule-based fallback extraction of measurements + impression
 *   verify(extracted, text) keeps only sizes that literally appear in the report text
 *   groupOpinions(scans)    finds reads of the same scan by different doctors
 *   compareReads(a, b)      lesion-by-lesion agreement table between two reads
 *   tumorSeries(scans)      total measured size per scan date (with min/max across reads)
 */

const ORGANS = ['liver', 'hepatic', 'lung', 'pulmonary', 'lobe', 'lymph node', 'node', 'nodal', 'breast', 'axilla', 'axillary', 'brain', 'bone', 'adrenal', 'pancreas', 'pancreatic', 'kidney', 'renal', 'ovary', 'ovarian', 'adnexa', 'colon', 'rectum', 'peritoneal', 'omentum', 'spleen', 'pleural', 'mediastinal', 'hilar', 'supraclavicular', 'retroperitoneal', 'pelvic', 'cervical', 'thyroid', 'prostate', 'bladder', 'stomach', 'esophag', 'mass', 'nodule', 'lesion', 'tumor'];
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(?:(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*)?(?:(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*)?(cm|mm)\b/gi;

const toMm = (v, unit) => (unit.toLowerCase() === 'cm' ? v * 10 : v);
function allSizesMm(text) {
  const out = []; let m; SIZE_RE.lastIndex = 0;
  while ((m = SIZE_RE.exec(text))) {
    const dims = [m[1], m[2], m[3]].filter(Boolean).map(Number);
    dims.forEach((d) => out.push(toMm(d, m[4])));
  }
  return out;
}

function sentences(text) {
  return text.replace(/\r/g, '').split(/(?<=[.;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

const GENERIC = new Set(['mass', 'nodule', 'lesion', 'tumor']);
function locationOf(sentence, idx, endIdx) {
  const clean = (x) => x.replace(/^[^A-Za-z]+/, '').replace(/[,:(]+$/, '').replace(/\b(measuring|measures|measure|now|currently|which|that|is|was|previously)\b.*$/i, '').trim().slice(0, 60);
  const body = sentence.replace(/^[A-Za-z ]{2,20}:\s*/, ''); // drop "Liver:" style headers
  const shift = sentence.length - body.length;
  const before = body.slice(0, Math.max(0, idx - shift)), lower = before.toLowerCase();
  let bestPos = -1, best = null;
  for (const o of ORGANS) { const p = lower.lastIndexOf(o); if (p > bestPos) { bestPos = p; best = o; } }
  if (bestPos >= 0 && !GENERIC.has(best)) {
    const start = Math.max(0, before.slice(0, bestPos).split(/\s+/).length - 3);
    return clean(before.split(/\s+/).slice(start).join(' ')) || best;
  }
  // Site named after the measurement: "4 mm nodule in the right lower lobe"
  const after = body.slice(Math.max(0, endIdx - shift)).split(/[.;]/)[0];
  const m = after.match(/\b(mass|nodule|lesion|tumou?r|node)?[^.]*?\bin (?:the )?([a-z0-9 ]{3,40})/i);
  if (m) return clean(`${m[1] || (best || 'lesion')} in the ${m[2]}`);
  const pre = after.match(/^\s*([a-z ]{3,40}?)(nodule|mass|lesion|node)/i);
  if (pre) return clean(pre[1] + pre[2]);
  return bestPos >= 0 ? clean(before) || best : 'Unspecified site';
}

function impressionOf(text) {
  const m = text.match(/impression\s*:?\s*([\s\S]+?)(?:\n\s*\n[A-Z][A-Z ]{3,}:|\n[A-Z][A-Z ]{3,}:|$)/i);
  return (m ? m[1] : text.split(/\n/).slice(-3).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 600);
}

function changeOf(impression, comparative) {
  const t = impression.toLowerCase();
  const has = (re) => re.test(t);
  const newL = has(/\bnew\b(?![^.]*\bno new\b)/) && !has(/\bno new\b/);
  if (!comparative) return { change: 'first', newLesions: false };
  if (has(/progress|increas|larger|worsen/)) return { change: 'larger', newLesions: newL };
  if (has(/decreas|smaller|interval improvement|partial response|response to (therapy|treatment)|regress|resolv/)) return { change: 'smaller', newLesions: newL };
  if (has(/stable|unchanged|no significant (interval )?change/)) return { change: 'stable', newLesions: newL };
  return { change: 'unclear', newLesions: newL };
}

/** Rule-based extraction (used when Gemma isn't connected, and as a cross-check). */
function extractRules(text) {
  const lesions = [];
  const findings = text.split(/\n\s*impression\s*:?/i)[0];
  for (const s of sentences(findings)) {
    if (/^impression/i.test(s)) continue;
    SIZE_RE.lastIndex = 0;
    const ms = [...s.matchAll(SIZE_RE)];
    if (!ms.length) continue;
    const first = ms[0];
    const prevMatch = ms.slice(1).find((m) => /(previously|prior|from|compared|was)\s*(?:measuring|measured)?\s*$/i.test(s.slice(0, m.index).slice(-30)));
    const dims = (m) => Math.max(...[m[1], m[2], m[3]].filter(Boolean).map(Number).map((d) => toMm(d, m[4])));
    const loc = locationOf(s, first.index, first.index + first[0].length);
    if (loc === 'Unspecified site' && !/mass|nodule|lesion|tumou?r|metasta/i.test(s)) continue;
    lesions.push({ location: loc, sizeMm: +dims(first).toFixed(1), previousMm: prevMatch ? +dims(prevMatch).toFixed(1) : null });
  }
  const impression = impressionOf(text);
  const comparative = /comparison|previously|prior|interval|compared/i.test(text);
  return { lesions: lesions.slice(0, 10), impression, ...changeOf(impression, comparative) };
}

/** Drop any lesion whose size doesn't literally appear in the report. */
function verify(ex, text) {
  const sizes = allSizesMm(text);
  const near = (v) => v != null && sizes.some((s) => Math.abs(s - v) < 0.6);
  const kept = [], dropped = [];
  for (const l of ex.lesions || []) {
    const v = Number(l.sizeMm);
    if (near(v)) kept.push({ location: String(l.location || 'Unspecified site').slice(0, 80), sizeMm: +v.toFixed(1), previousMm: near(Number(l.previousMm)) ? +Number(l.previousMm).toFixed(1) : null, verified: true });
    else dropped.push(l);
  }
  return { ...ex, lesions: kept, droppedCount: dropped.length };
}

const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

/** Reads of the same kind of scan within 7 days by different readers. */
function groupOpinions(scans) {
  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date));
  const groups = [];
  for (const s of sorted) {
    const g = groups.find((g) => g[0].kind === s.kind && dayDiff(g[0].date, s.date) <= 7);
    if (g) g.push(s); else groups.push([s]);
  }
  return groups;
}

const SITE_WORDS = (loc) => new Set(String(loc).toLowerCase().replace(/hepatic/g, 'liver').replace(/pulmonary/g, 'lung').replace(/nodal/g, 'node').match(/[a-z]+|\d+/g) || []);
const STOP = new Set(['the', 'a', 'in', 'of', 'and', 'with', 'measuring', 'mass', 'lesion', 'nodule', 'segment', 'unspecified', 'site']);
function siteScore(a, b) {
  const A = [...SITE_WORDS(a)].filter((w) => !STOP.has(w)), B = SITE_WORDS(b);
  if (!A.length) return 0;
  return A.filter((w) => B.has(w)).length / A.length;
}

/** Lesion-by-lesion comparison of two reads of the same scan. */
function compareReads(a, b) {
  const rows = [];
  const usedB = new Set();
  for (const la of a.extracted.lesions) {
    let best = -1, bi = -1;
    b.extracted.lesions.forEach((lb, i) => { if (usedB.has(i)) return; const sc = siteScore(la.location, lb.location); if (sc > best) { best = sc; bi = i; } });
    if (bi >= 0 && best >= 0.5) {
      usedB.add(bi);
      const lb = b.extracted.lesions[bi];
      const diff = Math.abs(la.sizeMm - lb.sizeMm) / Math.max(la.sizeMm, lb.sizeMm);
      rows.push({ location: la.location, a: la.sizeMm, b: lb.sizeMm, status: diff > 0.15 ? 'size' : 'agree' });
    } else rows.push({ location: la.location, a: la.sizeMm, b: null, status: 'only-a' });
  }
  b.extracted.lesions.forEach((lb, i) => { if (!usedB.has(i)) rows.push({ location: lb.location, a: null, b: lb.sizeMm, status: 'only-b' }); });
  const sameChange = a.extracted.change === b.extracted.change;
  const sameNew = !!a.extracted.newLesions === !!b.extracted.newLesions;
  const differences = rows.filter((r) => r.status !== 'agree').length + (sameChange ? 0 : 1) + (sameNew ? 0 : 1);
  return { rows, sameChange, sameNew, differences };
}

/**
 * Compare any number of reads of the same scan, spot by spot.
 * rows: [{ location, values: [mm | null per read], status: 'agree' | 'differ' | 'some', spread }]
 * 'agree' means every read measured it and the sizes are within 15% of each other.
 */
function compareMany(reads) {
  const n = reads.length, rows = [];
  reads.forEach((r, i) => {
    for (const l of r.extracted?.lesions || []) {
      let best = 0, row = null;
      for (const x of rows) {
        if (x.values[i] != null) continue;
        const sc = Math.max(siteScore(l.location, x.location), siteScore(x.location, l.location));
        if (sc > best) { best = sc; row = x; }
      }
      if (!row || best < 0.5) { row = { location: l.location, values: Array(n).fill(null) }; rows.push(row); }
      row.values[i] = l.sizeMm;
    }
  });
  for (const x of rows) {
    const v = x.values.filter((m) => m != null);
    x.spread = +(Math.max(...v) - Math.min(...v)).toFixed(1);
    x.status = v.length < n ? 'some' : x.spread / Math.max(...v) <= 0.15 ? 'agree' : 'differ';
  }
  const newFinding = reads.map((r) => !!r.extracted?.newLesions);
  const change = reads.map((r) => r.extracted?.change || 'unclear');
  const sameNew = newFinding.every((v) => v === newFinding[0]);
  const sameChange = change.every((v) => v === change[0]);
  const differences = rows.filter((x) => x.status !== 'agree').length + (sameNew ? 0 : 1) + (sameChange ? 0 : 1);
  return { rows, newFinding, change, sameNew, sameChange, differences };
}

/** Neutral template explanation for several reads, used when Gemma isn't connected. */
function opinionsTemplate(reads) {
  const cmp = compareMany(reads), name = (i) => reads[i].reader || `Doctor ${i + 1}`, parts = [];
  const agree = cmp.rows.filter((x) => x.status === 'agree').map((x) => x.location);
  if (agree.length) parts.push(`All ${reads.length} reports give similar sizes for: ${agree.join(', ')}.`);
  for (const x of cmp.rows) {
    if (x.status === 'differ') parts.push(`The ${x.location} was measured differently: ${x.values.map((v, i) => `${name(i)} ${v} mm`).join(', ')}.`);
    if (x.status === 'some') parts.push(`Only ${x.values.map((v, i) => (v != null ? name(i) : null)).filter(Boolean).join(' and ')} measured the ${x.location}.`);
  }
  if (!cmp.sameNew) parts.push('The reports disagree on whether there is a new finding.');
  if (!cmp.sameChange) parts.push('Their overall conclusions about change differ.');
  parts.push('Radiologists can differ because they measure at slightly different points or compare with different earlier scans. Your oncologist can help you understand what the differences mean for you.');
  return {
    summary: parts.join(' '),
    questions: ['Which measurements will you use to judge how treatment is working?', 'Does the difference between the reports change anything about my care?', 'Should the finding they disagree on be checked again on my next scan?'],
  };
}

const total = (s) => s.extracted.lesions.reduce((t, l) => t + l.sizeMm, 0);
/** One point per scan date: total of measured sizes; min/max when several doctors read it. */
function tumorSeries(scans) {
  return groupOpinions(scans).map((g) => {
    const vals = g.map(total).filter((v) => v > 0);
    return { date: g[0].date, kind: g[0].kind, value: vals.length ? vals[0] : null, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, reads: g.length };
  }).filter((p) => p.value != null);
}

/**
 * One track per measured spot, followed across scan dates (first read of each date).
 * Spots are matched by location words, so "lesion in hepatic segment 7" and
 * "Segment 7 lesion" join the same track. Second reads add a min/max range.
 */
function lesionTracks(scans) {
  const groups = groupOpinions(scans);
  const dates = groups.map((g) => g[0].date);
  const tracks = [];
  const match = (loc, k) => {
    let best = 0, bt = null;
    for (const t of tracks) {
      if (t.points[k]) continue;
      const sc = Math.max(siteScore(loc, t.location), siteScore(t.location, loc));
      if (sc > best) { best = sc; bt = t; }
    }
    return best >= 0.5 ? bt : null;
  };
  groups.forEach((g, k) => {
    for (const l of g[0].extracted.lesions) {
      let t = match(l.location, k);
      if (!t) { t = { location: l.location, points: [] }; tracks.push(t); }
      t.location = l.location;
      t.points[k] = { date: g[0].date, mm: l.sizeMm, min: l.sizeMm, max: l.sizeMm };
    }
    for (const other of g.slice(1)) {
      for (const l of other.extracted.lesions) {
        const t = tracks.find((t) => t.points[k] && Math.max(siteScore(l.location, t.location), siteScore(t.location, l.location)) >= 0.5);
        if (t) { t.points[k].min = Math.min(t.points[k].min, l.sizeMm); t.points[k].max = Math.max(t.points[k].max, l.sizeMm); }
      }
    }
  });
  return {
    dates,
    tracks: tracks.map((t) => {
      const pts = dates.map((_, k) => t.points[k] || null);
      const seen = pts.filter(Boolean);
      const first = seen[0], last = seen[seen.length - 1];
      return { location: t.location, points: pts, first: first.mm, last: last.mm, changePct: seen.length > 1 ? Math.round(((last.mm - first.mm) / first.mm) * 100) : null };
    }),
  };
}

/**
 * Where a measurement came from: the report sentence that states this size, preferring
 * the sentence that also names the same place. Returns { sentence, marks: [[start, end]] } or null.
 * marks are the character ranges of the matching size (and previous size) inside the sentence.
 */
function sourceOf(text, lesion) {
  const near = (mm) => (v) => v != null && Math.abs(v - mm) < 0.6;
  let best = null;
  for (const s of sentences(String(text || ''))) {
    SIZE_RE.lastIndex = 0;
    const ms = [...s.matchAll(SIZE_RE)];
    const sizes = (m) => [m[1], m[2], m[3]].filter(Boolean).map(Number).map((d) => toMm(d, m[4]));
    const hit = ms.find((m) => sizes(m).some(near(lesion.sizeMm)));
    if (!hit) continue;
    const score = 1 + Math.max(siteScore(lesion.location, s), siteScore(s, lesion.location)) + (/^impression/i.test(s) ? -0.5 : 0);
    if (!best || score > best.score) {
      const marks = [[hit.index, hit.index + hit[0].length]];
      const prev = lesion.previousMm != null && ms.find((m) => m !== hit && sizes(m).some(near(lesion.previousMm)));
      if (prev) marks.push([prev.index, prev.index + prev[0].length]);
      best = { sentence: s, marks: marks.sort((a, b) => a[0] - b[0]), score };
    }
  }
  return best && { sentence: best.sentence, marks: best.marks };
}

const CHANGE_WORDS = { first: 'First scan (nothing to compare with)', mixed: 'Some smaller, some larger', smaller: 'Smaller than before', larger: 'Larger than before', stable: 'About the same', unclear: 'Not stated clearly' };

const api = { extractRules, verify, sourceOf, groupOpinions, compareReads, compareMany, opinionsTemplate, tumorSeries, lesionTracks, allSizesMm, CHANGE_WORDS };
export const Scans = api;
export default api;
