// Run: node test/gemma.test.js
// Simulates Gemini API responses (no key or network needed) to check request
// shape, JSON parsing, thought-part filtering, and the hallucination guard.
process.env.GEMINI_API_KEY = 'test-key';
let lastReq = null, reply = null;
global.fetch = async (url, opt) => { lastReq = { url, body: JSON.parse(opt.body), headers: opt.headers }; return { ok: true, json: async () => reply }; };
const { extractReport, explainOpinions } = await import('../lib/scans-ai.js');
const { explain, buildPayload } = await import('../lib/explain.js');
const { default: G } = await import('../src/core/gait.js');
let failed = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${d}`); if (!c) failed++; };
const wrap = (obj, thought) => ({ candidates: [{ content: { parts: [...(thought ? [{ text: 'thinking...', thought: true }] : []), { text: '```json\n' + JSON.stringify(obj) + '\n```' }] } }] });

(async () => {
  const text = 'COMPARISON: prior. FINDINGS: Liver segment 7 lesion measures 1.8 cm, previously 2.4 cm.\nIMPRESSION: Decrease in size.';
  reply = wrap({ transcript: '', lesions: [{ location: 'liver, segment 7', size_mm: 18, previous_size_mm: 24 }, { location: 'lung', size_mm: 9, previous_size_mm: null }], change: 'smaller', new_lesions: false, plain: 'The liver spot got smaller.' }, true);
  const r = await extractReport({ text });
  check('extract: uses Gemma 4 model', /gemma-4/.test(lastReq.url), lastReq.url.split('/models/')[1]);
  check('extract: API key sent in header, not URL', lastReq.headers['x-goog-api-key'] === 'test-key' && !/key=/.test(lastReq.url));
  check('extract: system instruction sent', !!lastReq.body.systemInstruction);
  check('extract: real size kept', r.extracted.lesions.length === 1 && r.extracted.lesions[0].sizeMm === 18);
  check('extract: invented size (9 mm) dropped', r.extracted.droppedCount === 1);
  check('extract: plain explanation passed through', r.extracted.plain === 'The liver spot got smaller.');

  reply = wrap({ transcript: 'FINDINGS: Mass measures 3.0 cm. IMPRESSION: Mass.', lesions: [{ location: 'breast', size_mm: 30 }], change: 'first', new_lesions: false, plain: 'x' });
  const ri = await extractReport({ image: { mimeType: 'image/jpeg', data: 'AAAA' } });
  check('photo: image sent as inlineData', !!lastReq.body.contents[0].parts[0].inlineData);
  check('photo: verified against transcript', ri.extracted.lesions[0]?.sizeMm === 30 && ri.fromPhoto);

  reply = wrap({ summary: 'They mostly agree.', questions: ['a', 'b', 'c'] });
  const o = await explainOpinions({ a: { reader: 'A', text }, b: { reader: 'B', text: text.replace('1.8', '2.2') } });
  check('opinions: Gemma summary returned', o.source === 'gemma' && o.summary === 'They mostly agree.');

  const ck = [1, 2, 3].map((c) => ({ cycle: c, date: `2026-0${c}-01`, symptoms: { feetNumb: c, handsNumb: 0, feetPain: 0 }, gait: G.analyze(G.synthesizeWalk({ seed: c }).samples), balance: null }));
  reply = wrap({ patient: 'p', twin: 't', scans: '', clinician: 'c', questions: ['1', '2', '3'] });
  const e = await explain(ck, []);
  const sent = lastReq.body.contents[0].parts[0].text;
  check('report: twin estimates included in prompt', /likely_range/.test(sent));
  check('report: Gemma output returned', e.source === 'gemma' && e.twin === 't');

  const sourced = [
    {
      ...ck[0], source: 'sample',
      gait: G.analyze(G.synthesizeWalk({ cadence: 60, seed: 21 }).samples),
    },
    {
      ...ck[1], source: 'mixed',
      gait: G.analyze(G.synthesizeWalk({ cadence: 65, seed: 22 }).samples),
      balance: { ok: true, swayRms: 0.2 },
      measurementSources: { gait: 'sample', balance: 'sensor' },
    },
    {
      ...ck[2], source: 'sensor',
      gait: G.analyze(G.synthesizeWalk({ cadence: 105, seed: 23 }).samples),
      balance: { ok: true, swayRms: 0.04 },
    },
  ];
  const reportPayload = buildPayload(sourced);
  check('report: sample physical values are excluded from rows', reportPayload.rows[0].walk.startsWith('excluded from personal estimate') && reportPayload.rows[1].walk.startsWith('excluded from personal estimate'));
  check('report: sensor measurements in mixed entries remain available', typeof reportPayload.rows[1].balance === 'object');
  check('report: genuine symptoms remain in personal twin flags', reportPayload.flags.some((flag) => flag.id === 'feetNumb'));
  check('report: demo entries retain simulated physical measurements', typeof buildPayload(ck.map((c) => ({ ...c, demo: true, source: 'simulated' }))).rows[0].walk === 'object');

  reply = { candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] };
  const bad = await explain(ck, []);
  check('report: bad Gemma output falls back to template', bad.source === 'template');
  check('report fallback labels model uncertainty without claiming the model proves decline', /model uncertainty range/.test(bad.twin) && !/worse than the twin expected/i.test(bad.twin));

  global.fetch = async () => ({ ok: false, status: 429, text: async () => 'quota' });
  const q = await extractReport({ text });
  check('extract: API error falls back to rules', q.source === 'rules' && q.extracted.lesions.length === 1, q.note);

  console.log(failed ? `\n${failed} failed` : '\nAll checks passed'); process.exit(failed ? 1 : 0);
})();
