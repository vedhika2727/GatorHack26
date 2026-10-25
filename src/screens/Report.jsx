import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { BandChart } from '../components/Viz.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { useStore, HOSTED_PREVIEW } from '../store.jsx';
import { writeReport } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';

/*
 * Report laid out like Apple Health's Highlights: a short summary, one card per change
 * (sentence plus a first-vs-latest bar comparison), then cards for the twin, scans and
 * questions, and every number folded away for the oncology team.
 * Everything except the summary paragraph comes from fixed rules and the twin, so it is
 * ready instantly. Gemma writes only the summary paragraph.
 */
const r0 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));
const FALLS = { none: 'None', near: 'Near-fall', fall: 'Fall' };
const tap = (c, h) => (c.tapping?.[h]?.ok ? c.tapping[h].rate : null);
const GROUPS = [
  { name: 'Walking', tone: 'navy', rows: [
    { id: 'cadence', short: 'walking pace', label: 'Walking pace', unit: 'steps/min', get: (c) => (c.gait?.ok ? r0(c.gait.cadence) : null) },
    { id: 'variability', short: 'step timing', label: 'Step timing variation', unit: '%', get: (c) => (c.gait?.ok ? c.gait.stepTimeCV : null) },
    { id: 'regularity', short: 'step evenness', label: 'Step evenness', unit: 'of 1', get: (c) => (c.gait?.ok ? c.gait.stepRegularity : null) },
    { id: 'hesitations', short: 'pauses while walking', label: 'Pauses during the walk', unit: '', get: (c) => (c.gait?.ok ? c.gait.hesitations : null) },
  ] },
  { name: 'Balance', tone: 'forest', rows: [
    { id: 'sway', short: 'standing sway', label: 'Sway, standing still', unit: 'index', get: (c) => (c.balance?.ok ? +(c.balance.swayRms * 100).toFixed(1) : null) },
    { id: 'romberg', short: 'eyes-closed sway', label: 'Sway with eyes closed', unit: '× eyes open', get: (c) => (c.balance?.ok && c.balanceClosed?.ok ? +(c.balanceClosed.swayRms / c.balance.swayRms).toFixed(1) : null) },
  ] },
  { name: 'Hands', tone: 'rose', rows: [
    { id: 'tap-right', short: 'right-hand tapping', label: 'Tapping, right hand', unit: 'taps/s', get: (c) => tap(c, 'right') },
    { id: 'tap-left', short: 'left-hand tapping', label: 'Tapping, left hand', unit: 'taps/s', get: (c) => tap(c, 'left') },
    { id: 'buttons', short: 'trouble with buttons', label: 'Trouble with buttons or zips', unit: '', get: (c) => (c.buttons ? 'Yes' : 'No') },
  ] },
  { name: 'Symptoms', tone: 'ink', rows: [
    { id: 'feetNumb', short: 'foot numbness', label: 'Numbness or tingling, feet', unit: '/10', get: (c) => c.symptoms?.feetNumb ?? 0 },
    { id: 'handsNumb', short: 'hand numbness', label: 'Numbness or tingling, hands', unit: '/10', get: (c) => c.symptoms?.handsNumb ?? 0 },
    { id: 'feetPain', short: 'foot pain', label: 'Burning or pain, feet', unit: '/10', get: (c) => c.symptoms?.feetPain ?? 0 },
    { id: 'falls', short: 'falls', label: 'Falls since last check-in', unit: '', get: (c) => FALLS[c.falls] || 'None' },
  ] },
];
const STATUS = { notable: 'Large change', watch: 'Some change' };
const MAXES = { 'of 1': 1, '/10': 10 };
const plain = (t) => t.replace(/than at baseline/g, 'than at your first check-in').replace(/\(baseline:? /g, '(first check-in: ').replace(/× baseline/g, '× your first check-in').replace(/ since the last check-in/g, '');
const show = (v, unit) => (v == null ? '–' : unit && typeof v === 'number' ? (/^[%/]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`) : String(v));

export default function Report({ go }) {
  const { user, checkins, scans } = useStore();
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [allHl, setAllHl] = useState(false);
  const twin = useMemo(() => FunctionTwin.run(checkins), [checkins]);
  const tracks = useMemo(() => Scans.lesionTracks(scans), [scans]);
  const groups = useMemo(() => Scans.groupOpinions(scans), [scans]);

  async function write() { setBusy(true); setOut(await writeReport(checkins, scans)); setBusy(false); }
  useEffect(() => { if (checkins.length) write(); }, [checkins.length, scans.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checkins.length) return (
    <div className="wrap"><h1>Report for your care team</h1>
      <div className="card"><p>Do a check-in first, and your report will be ready.</p>
        <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn primary" onClick={() => go('checkin')}>Start a check-in</button></div></div></div>
  );

  const first = checkins[0], last = checkins[checkins.length - 1], step = twin[twin.length - 1];
  const flags = Trends.compare(first, last);
  const worse = twin.filter((t) => t.surprise === 'worse').map((t) => t.cycle);
  const rows = GROUPS.flatMap((g) => g.rows.map((r) => ({ ...r, group: g })));
  const highlights = flags.map((f) => ({ f, r: rows.find((r) => r.id === f.id) })).filter((h) => h.r)
    .sort((a, b) => (a.f.level === b.f.level ? 0 : a.f.level === 'notable' ? -1 : 1));
  const shownHl = allHl ? highlights : highlights.slice(0, 6);
  const twoReads = groups.filter((g) => g.length > 1);
  const questions = [...(out?.questions || []), ...scans.flatMap((s) => s.opinion?.questions || [])].filter((q, k, a) => a.indexOf(q) === k);

  const asText = () => [
    `Visit summary for ${user.name}, before cycle ${last.cycle + 1}`,
    `${checkins.length} check-ins, ${fmtDate(first.date)} to ${fmtDate(last.date)}.`, '',
    ...(out?.patient ? [out.patient, ''] : []),
    `Function twin: changed ${r0(step.mean)} out of 100 since cycle ${first.cycle} (likely ${r0(step.low)} to ${r0(step.high)}).${worse.length ? ` Cycle ${worse.join(', ')} came in worse than expected.` : ''}`, '',
    'Changes since the first check-in', ...highlights.map(({ f }) => `- ${plain(f.text)} (${STATUS[f.level].toLowerCase()})`), '',
    ...(tracks.tracks.length ? ['Scans', ...tracks.tracks.map((t) => `- ${t.location}: ${t.points.map((p) => (p ? `${p.mm} mm` : '–')).join(' → ')}`), ''] : []),
    ...(questions.length ? ['Questions for the next visit', ...questions.map((q) => `- ${q}`), ''] : []),
    'Phone measurements are approximate and measure function, not nerves directly. Not a diagnosis.',
  ].join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(asText()); setCopied('Copied. Paste it into a patient-portal message or email.'); }
    catch (_) { setCopied('Your browser blocked copying. Select the report text and copy it.'); }
  }

  return (
    <div className="wrap wide report-page">
      <div className="rep-top">
        <div>
          <h1>Report for your care team</h1>
          <p className="lede">{user.name}, before cycle {last.cycle + 1}. {checkins.length} check-in{checkins.length > 1 ? 's' : ''} from {fmtDate(first.date)} to {fmtDate(last.date)}.{user.mode === 'demo' ? ' Demo patient.' : ''}</p>
        </div>
        <div className="actions no-print">
          <button type="button" className="btn primary" onClick={copy}><Icon name="copy" size={18} /> Copy report text</button>
          {!HOSTED_PREVIEW && <button type="button" className="btn" onClick={() => window.print()}><Icon name="printer" size={18} /> Print</button>}
        </div>
      </div>
      {copied && <p className="notice no-print" role="status">{copied}</p>}

      <section className="card rep-summary" aria-label="Summary">
        {busy && !out ? <p className="muted">Writing the summary…</p> : out && <>
          <p className="summary-text">{out.patient}</p>
          <p className="fine">{out.source === 'gemma' ? `Written by Gemma 4 (${out.model}) from the numbers on this page.` : 'Template text. Gemma isn’t connected here.'} <button type="button" className="linkish no-print" disabled={busy} onClick={write}>{busy ? 'Rewriting…' : 'Rewrite'}</button></p>
        </>}
      </section>

      {checkins.length > 1 && <>
        <div className="hl-head">
          <h2>Highlights</h2>
          <p className="muted">{highlights.length ? `${highlights.length} change${highlights.length > 1 ? 's' : ''} since cycle ${first.cycle}, biggest first.` : `Nothing beyond normal day-to-day variation since cycle ${first.cycle}.`}</p>
        </div>
        <div className="hl-grid">
          {shownHl.map(({ f, r }) => {
            const a = r.get(first), b = r.get(last);
            const num = typeof a === 'number' && typeof b === 'number';
            const max = MAXES[r.unit] || Math.max(a || 0, b || 0, 0.001) * 1.12;
            return (
              <article key={f.id} className={`card hl ${r.group.tone}`}>
                <div className="hl-top"><span className="cat">{r.group.name}</span><span className={`lvl ${f.level}`}>{STATUS[f.level]}</span></div>
                <p className="hl-text">{plain(f.text)}</p>
                {num ? (
                  <div className="bars" aria-hidden="true">
                    {[[`Cycle ${first.cycle}`, a, 'then'], [`Cycle ${last.cycle}`, b, 'now']].map(([lab, v, cls]) => (
                      <div key={lab} className={`bar-row ${cls}`}>
                        <span className="bar-val"><b>{v}</b>{r.unit && <small> {r.unit}</small>}</span>
                        <span className="bar-track"><span style={{ width: `${Math.max(2, (v / max) * 100)}%` }} /></span>
                        <span className="bar-lab">{lab}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="hl-pair"><span className="muted">Cycle {first.cycle}: {show(a, r.unit)}</span><b>Cycle {last.cycle}: {show(b, r.unit)}</b></p>}
              </article>
            );
          })}
        </div>
        {highlights.length > 6 && <button type="button" className="btn small no-print" style={{ marginTop: 12 }} onClick={() => setAllHl(!allHl)}>{allHl ? 'Show fewer' : `Show all ${highlights.length}`}</button>}
      </>}

      <div className="rep-cols">
        <section className="card hl-tile navy">
          <span className="cat">Function twin</span>
          <div className="big"><b>{r0(step.mean)}</b><span>of 100</span></div>
          <p className="muted" style={{ margin: 0 }}>Change in walking, balance, and hand function since cycle {first.cycle}, likely {r0(step.low)} to {r0(step.high)}.{worse.length ? ` Cycle ${worse.join(' and ')} came in worse than expected.` : ''}</p>
          {checkins.length > 1 && <BandChart steps={twin} selected={twin.length - 1} />}
        </section>

        <section className="card hl-tile rose">
          <span className="cat">Scans</span>
          {tracks.tracks.length ? <>
            <ul className="spot-rows">{tracks.tracks.map((t) => (
              <li key={t.location}>
                <span>{t.location}</span>
                <b>{t.changePct == null ? `${t.last} mm, new ${fmtDate(tracks.dates[t.points.findIndex(Boolean)])}` : `${t.first} → ${t.last} mm`}</b>
              </li>
            ))}</ul>
            {twoReads.length > 0 && <p className="fine">{twoReads.map((g) => `The ${g[0].kind} on ${fmtDate(g[0].date)} was read by ${g.length} radiologists.`).join(' ')} Their numbers differ a little; both are kept.</p>}
            <details className="more"><summary>Each radiologist’s conclusion</summary>
              <ul className="reads">{groups.flatMap((g) => g.map((s) => <li key={s.id}><b>{s.kind}, {fmtDate(s.date)}</b> <span className="muted">{s.reader}</span><br />“{s.extracted.impression}”</li>))}</ul>
            </details>
          </> : <p className="muted">No scan reports added yet.</p>}
        </section>
      </div>

      {questions.length > 0 && <section className="card rep-q">
        <h2>Questions for the next visit</h2>
        <ul className="checks">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
      </section>}

      <details className="card rep-tech">
        <summary>All measurements, for the oncology team</summary>
        <p className="fine">Function twin: an uncalibrated Kalman filter over phone measures and symptom ratings, not nerve-specific. Per cycle, with likely range: {twin.map((t) => `C${t.cycle} ${r0(t.mean)} (${r0(t.low)}–${r0(t.high)})`).join(', ')}. Change labels come from fixed thresholds against the patient’s own first check-in. Unvalidated smartphone measures; interpret against the patient’s own trend only.</p>
        <div className="table-wrap"><table className="changes-table all">
          <thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{checkins.map((c) => <th key={c.id} scope="col">C{c.cycle}</th>)}</tr></thead>
          {GROUPS.map((g) => (
            <tbody key={g.name}>
              <tr className="grp"><th scope="rowgroup" colSpan={checkins.length + 1}>{g.name}</th></tr>
              {g.rows.map((r) => <tr key={r.id}><th scope="row">{r.label}{r.unit ? <span className="u"> {r.unit}</span> : null}</th>{checkins.map((c) => <td key={c.id}>{r.get(c) ?? '–'}</td>)}</tr>)}
            </tbody>
          ))}
        </table></div>
      </details>

      <p className="fine">Phone measurements are approximate and measure function, not nerves directly. This is not a diagnosis.</p>
    </div>
  );
}
