import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { useStore, HOSTED_PREVIEW } from '../store.jsx';
import { writeReport } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';

/*
 * Report: one quiet page. A one-line headline, then every measure as a single row with a tiny
 * trend across all cycles and its latest value. A pink dot marks what changed since cycle 1.
 * Scans follow the same row pattern. Numbers come from fixed rules and the twin; Gemma writes
 * only the optional plain-language summary.
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
    { id: 'romberg', short: 'eyes-closed sway', label: 'Sway with eyes closed, vs. eyes open', unit: '×', get: (c) => (c.balance?.ok && c.balanceClosed?.ok ? +(c.balanceClosed.swayRms / c.balance.swayRms).toFixed(1) : null) },
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
const plain = (t) => t.replace(/than at baseline/g, 'than at your first check-in').replace(/\(baseline:? /g, '(first check-in: ').replace(/× baseline/g, '× your first check-in').replace(/ since the last check-in/g, '');
const show = (v, unit) => (v == null ? '–' : unit && typeof v === 'number' ? (/^[%/×]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`) : String(v));

function TwinSpark({ twin }) {
  if (twin.length < 2) return null;
  const W = 260, H = 64, P = 6, top = Math.max(40, ...twin.map((t) => t.high));
  const x = (i) => P + (i / (twin.length - 1)) * (W - 2 * P), y = (v) => H - P - (v / top) * (H - 2 * P);
  const band = twin.map((t, i) => `${x(i)},${y(t.high)}`).concat(twin.map((t, i) => `${x(i)},${y(t.low)}`).reverse()).join(' ');
  return (
    <svg className="twin-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polygon points={band} fill="var(--rose-wash)" />
      <polyline points={twin.map((t, i) => `${x(i)},${y(t.mean)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      {twin.map((t, i) => <circle key={i} cx={x(i)} cy={y(t.mean)} r={t.surprise === 'worse' ? 4.5 : 2.6} fill={t.surprise === 'worse' ? 'var(--red)' : 'var(--ink)'} />)}
    </svg>
  );
}

function Spark({ values, lo, hi }) {
  const W = 120, H = 30, P = 4;
  const pts = values.map((v, i) => ({ v: typeof v === 'number' ? v : null, i })).filter((p) => p.v != null);
  if (pts.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  let a = lo ?? Math.min(...pts.map((p) => p.v)), b = hi ?? Math.max(...pts.map((p) => p.v));
  if (b - a < 1e-6) { a -= 1; b += 1; }
  const x = (i) => P + (i / (values.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - a) / (b - a)) * (H - 2 * P);
  const end = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(end.i)} cy={y(end.v)} r="3" fill="currentColor" />
    </svg>
  );
}

const BOUNDS = { 'of 1': [0, 1], '/10': [0, 10] };
const fmtChange = (a, b) => {
  if (typeof a !== 'number' || typeof b !== 'number') return '';
  if (a === 0) return b === 0 ? '' : `+${b}`;
  const p = Math.round(((b - a) / a) * 100);
  return p === 0 ? '' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`;
};

export default function Report({ go }) {
  const { user, checkins, scans } = useStore();
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
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
  const changed = new Set(flags.map((f) => f.id));
  const worse = twin.filter((t) => t.surprise === 'worse').map((t) => t.cycle);
  const questions = [...(out?.questions || []), ...scans.flatMap((s) => s.opinion?.questions || [])].filter((q, k, a) => a.indexOf(q) === k);
  const twoReads = groups.filter((g) => g.length > 1);
  const headline = `Walking, balance, and hand function have changed ${r0(step.mean)} out of 100 since cycle ${first.cycle}.`;

  const asText = () => [
    `Report for ${user.name}, before cycle ${last.cycle + 1} (${fmtDate(first.date)} to ${fmtDate(last.date)})`, '',
    `${headline} Likely ${r0(step.low)} to ${r0(step.high)}.${worse.length ? ` Cycle ${worse.join(', ')} was worse than expected.` : ''}`, '',
    ...(out?.patient ? ['Summary', plain(out.patient), ''] : []),
    `Changes since cycle ${first.cycle} (cycle ${first.cycle} → cycle ${last.cycle})`, '',
    ...GROUPS.flatMap((g) => [g.name, ...g.rows.map((r) => `- ${r.label}: ${show(r.get(first), r.unit)} → ${show(r.get(last), r.unit)}${changed.has(r.id) ? '  (changed)' : ''}`), '']),
    ...(tracks.tracks.length ? [`Scans (${tracks.dates.map(fmtDate).join(', ')})`, ...tracks.tracks.map((t) => {
      const seen = t.points.map((p, k) => (p ? `${p.mm} mm` : null)).filter(Boolean);
      const firstK = t.points.findIndex(Boolean);
      return `- ${t.location}: ${seen.join(' → ')}${firstK > 0 ? `, first seen ${fmtDate(tracks.dates[firstK])}` : ''}`;
    }), ''] : []),
    ...(questions.length ? ['Questions for the next visit', ...questions.map((q, k) => `${k + 1}. ${q}`), ''] : []),
    'Phone measurements are approximate and measure function, not nerves directly. Not a diagnosis.',
  ].join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(asText()); setCopied('Copied. Paste it into a patient-portal message or email.'); }
    catch (_) { setCopied('Your browser blocked copying. Select the report text and copy it.'); }
  }

  return (
    <div className="wrap wide sheet-page">
      <article className="sheet">
        <header className="sheet-head">
          <div className="who">
            <p className="kicker-line">Report for your care team</p>
            <h1>{user.name}</h1>
            <p className="muted">Before cycle {last.cycle + 1}. Check-ins {fmtDate(first.date)} to {fmtDate(last.date)}{user.mode === 'demo' ? ', demo patient' : ''}.</p>
            <div className="sheet-actions no-print">
              <button type="button" className="btn primary small" onClick={copy}><Icon name="copy" size={16} /> Copy report text</button>
              {!HOSTED_PREVIEW && <button type="button" className="btn small" onClick={() => window.print()}><Icon name="printer" size={16} /> Print</button>}
            </div>
            {copied && <p className="fine" role="status">{copied}</p>}
          </div>
          <div className="score-block">
            <div className="score-num"><b>{r0(step.mean)}</b><span>of 100</span></div>
            <TwinSpark twin={twin} />
            <p className="fine">Change in walking, balance, and hand function since cycle {first.cycle}. Likely {r0(step.low)} to {r0(step.high)}.</p>
          </div>
        </header>

        <p className="headline">{checkins.length > 1 ? `${changed.size} of ${GROUPS.reduce((n, g) => n + g.rows.length, 0)} measures have changed since cycle ${first.cycle}.` : 'Your first check-in sets the baseline.'}{worse.length ? <> <span className="warn">Cycle {worse.join(' and ')} was worse than expected.</span></> : null}</p>

        {checkins.length > 1 && <>
          <div className="cols-head"><span />{['Trend', `Cycle ${first.cycle}`, `Cycle ${last.cycle}`, ''].map((h, k) => <span key={k}>{h}</span>)}</div>
          {GROUPS.map((g) => (
            <section key={g.name} className="mgroup" aria-label={g.name}>
              <h2>{g.name}</h2>
              {g.rows.map((r) => {
                const vals = checkins.map(r.get), a = vals[0], b = vals[vals.length - 1];
                const [lo, hi] = BOUNDS[r.unit] || [];
                const on = changed.has(r.id);
                return (
                  <div key={r.id} className={`mrow${on ? ' on' : ''}`}>
                    <span className="name">{on && <i className="dot" aria-label="Changed" />}{r.label}</span>
                    <Spark values={vals} lo={lo} hi={hi} />
                    <span className="v then">{show(a, r.unit)}</span>
                    <span className="v now">{show(b, r.unit)}</span>
                    <span className="delta">{fmtChange(a, b)}</span>
                  </div>
                );
              })}
            </section>
          ))}
          <p className="fine key"><i className="dot" /> changed since cycle {first.cycle}</p>
        </>}

        {tracks.tracks.length > 0 && <section className="mgroup" aria-label="Scans">
          <h2>Scans</h2>
          {tracks.tracks.map((t) => (
            <div key={t.location} className="mrow">
              <span className="name">{t.location}</span>
              <Spark values={t.points.map((p) => (p ? p.mm : null))} lo={0} />
              <span className="v then">{t.points[0] ? `${t.points[0].mm} mm` : '–'}</span>
              <span className="v now">{t.last} mm</span>
              <span className="delta">{t.changePct == null ? 'new' : fmtChange(t.first, t.last)}</span>
            </div>
          ))}
          <p className="fine">{groups.length} scan dates, {fmtDate(tracks.dates[0])} to {fmtDate(tracks.dates[tracks.dates.length - 1])}.{twoReads.length ? ` ${twoReads.map((g) => `${fmtDate(g[0].date)} read by ${g.length} radiologists`).join('; ')}.` : ''}</p>
        </section>}

        {questions.length > 0 && <section className="mgroup" aria-label="Questions">
          <h2>Questions for the next visit</h2>
          <ul className="checks">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </section>}

        <details className="quiet">
          <summary>Summary in plain words</summary>
          {busy && !out ? <p className="muted">Writing…</p> : out && <>
            <p>{plain(out.patient)}</p>
            <p className="fine">{out.source === 'gemma' ? `Written by Gemma 4 (${out.model}).` : 'Template text. Gemma isn’t connected here.'} <button type="button" className="linkish no-print" disabled={busy} onClick={write}>{busy ? 'Rewriting…' : 'Rewrite'}</button></p>
          </>}
        </details>

        <details className="quiet">
          <summary>Every number, for the oncology team</summary>
          <p className="fine">Function twin: an uncalibrated Kalman filter over phone measures and symptom ratings, not nerve-specific. Per cycle, with likely range: {twin.map((t) => `C${t.cycle} ${r0(t.mean)} (${r0(t.low)}–${r0(t.high)})`).join(', ')}. Changes are marked by fixed thresholds against the patient’s own first check-in. Unvalidated smartphone measures.</p>
          <div className="table-wrap"><table className="changes-table all">
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{checkins.map((c) => <th key={c.id} scope="col">C{c.cycle}</th>)}</tr></thead>
            <tbody>{GROUPS.flatMap((g) => g.rows).map((r) => <tr key={r.id}><th scope="row">{r.label}{r.unit ? <span className="u"> {r.unit}</span> : null}</th>{checkins.map((c) => <td key={c.id}>{r.get(c) ?? '–'}</td>)}</tr>)}</tbody>
          </table></div>
        </details>

        <p className="fine foot">Phone measurements are approximate and measure function, not nerves directly. This is not a diagnosis.</p>
      </article>
    </div>
  );
}
