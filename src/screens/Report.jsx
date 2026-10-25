import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { useStore, HOSTED_PREVIEW } from '../store.jsx';
import { writeReport } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';

/*
 * One-page visit sheet. Everything except the "In plain words" paragraph comes straight from the
 * data (fixed rules and the twin), so it is ready instantly. Gemma writes only that paragraph.
 * Order: the short version, what changed (table), scans, questions, then technical details.
 */
const r0 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));
const FALLS = { none: 'None', near: 'Near-fall', fall: 'Fall' };
const tap = (c, h) => (c.tapping?.[h]?.ok ? c.tapping[h].rate : null);
const GROUPS = [
  { name: 'Walking', rows: [
    { id: 'cadence', short: 'walking pace', label: 'Walking pace', unit: 'steps/min', get: (c) => (c.gait?.ok ? r0(c.gait.cadence) : null) },
    { id: 'variability', short: 'step timing', label: 'Step timing variation', unit: '%', get: (c) => (c.gait?.ok ? c.gait.stepTimeCV : null) },
    { id: 'regularity', short: 'step evenness', label: 'Step evenness', unit: 'of 1', get: (c) => (c.gait?.ok ? c.gait.stepRegularity : null) },
    { id: 'hesitations', short: 'pauses while walking', label: 'Pauses during the walk', unit: '', get: (c) => (c.gait?.ok ? c.gait.hesitations : null) },
  ] },
  { name: 'Balance', rows: [
    { id: 'sway', short: 'standing sway', label: 'Sway, standing still', unit: 'index', get: (c) => (c.balance?.ok ? +(c.balance.swayRms * 100).toFixed(1) : null) },
    { id: 'romberg', short: 'eyes-closed sway', label: 'Sway with eyes closed', unit: '× eyes open', get: (c) => (c.balance?.ok && c.balanceClosed?.ok ? +(c.balanceClosed.swayRms / c.balance.swayRms).toFixed(1) : null) },
  ] },
  { name: 'Hands', rows: [
    { id: 'tap-right', short: 'right-hand tapping', label: 'Tapping, right hand', unit: 'taps/s', get: (c) => tap(c, 'right') },
    { id: 'tap-left', short: 'left-hand tapping', label: 'Tapping, left hand', unit: 'taps/s', get: (c) => tap(c, 'left') },
    { id: 'buttons', short: 'trouble with buttons', label: 'Trouble with buttons or zips', unit: '', get: (c) => (c.buttons ? 'Yes' : 'No') },
  ] },
  { name: 'Symptoms', rows: [
    { id: 'feetNumb', short: 'foot numbness', label: 'Numbness or tingling, feet', unit: '/10', get: (c) => c.symptoms?.feetNumb ?? 0 },
    { id: 'handsNumb', short: 'hand numbness', label: 'Numbness or tingling, hands', unit: '/10', get: (c) => c.symptoms?.handsNumb ?? 0 },
    { id: 'feetPain', short: 'foot pain', label: 'Burning or pain, feet', unit: '/10', get: (c) => c.symptoms?.feetPain ?? 0 },
    { id: 'falls', short: 'falls', label: 'Falls since last check-in', unit: '', get: (c) => FALLS[c.falls] || 'None' },
  ] },
];
const STATUS = { notable: 'Large change', watch: 'Some change' };
const show = (v, unit) => (v == null ? '–' : unit && typeof v === 'number' ? (/^[%/]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`) : String(v));

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
  const flagById = Object.fromEntries(flags.map((f) => [f.id, f]));
  const worse = twin.filter((t) => t.surprise === 'worse').map((t) => t.cycle);
  const large = flags.filter((f) => f.level === 'notable').length, some = flags.length - large;
  const changedLabels = GROUPS.flatMap((g) => g.rows).filter((r) => flagById[r.id]?.level === 'notable').map((r) => r.short);
  const shrinking = tracks.tracks.filter((t) => t.changePct != null && t.changePct < 0);
  const growing = tracks.tracks.filter((t) => t.changePct != null && t.changePct > 0);
  const newSpots = tracks.tracks.filter((t) => t.changePct == null && t.points.findIndex(Boolean) > 0);
  const twoReads = groups.filter((g) => g.length > 1);
  const questions = [...(out?.questions || []), ...scans.flatMap((s) => s.opinion?.questions || [])].filter((q, k, a) => a.indexOf(q) === k);

  const short = [
    `Walking, balance, and hand function: changed ${r0(step.mean)} out of 100 since cycle ${first.cycle} (likely ${r0(step.low)} to ${r0(step.high)}).${worse.length ? ` Cycle ${worse.join(' and ')} came in worse than expected.` : ''}`,
    checkins.length < 2 ? 'This is the first check-in, so there is nothing to compare yet.'
      : flags.length ? `${large ? `${large} large change${large > 1 ? 's' : ''}` : ''}${large && some ? ' and ' : ''}${some ? `${some} smaller change${some > 1 ? 's' : ''}` : ''} since the first check-in${changedLabels.length ? `, including ${changedLabels.length > 3 ? changedLabels.slice(0, 3).join(', ') + ', and more' : changedLabels.slice(0, -1).join(', ') + (changedLabels.length > 1 ? ' and ' : '') + changedLabels[changedLabels.length - 1]}` : ''}.`
        : 'No changes beyond normal day-to-day variation since the first check-in.',
    ...(groups.length ? [[
      `${groups.length} scan${groups.length > 1 ? 's' : ''} on file.`,
      shrinking.length ? `${shrinking.length} measured spot${shrinking.length > 1 ? 's' : ''} smaller than on the first scan` : '',
      growing.length ? `${growing.length} larger` : '',
      newSpots.length ? `${newSpots.length} new spot${newSpots.length > 1 ? 's' : ''} first measured ${fmtDate(tracks.dates[newSpots[0].points.findIndex(Boolean)])}` : '',
    ].filter(Boolean).join(' ').replace(/ (\d+ larger)/, ', $1').replace(/ (\d+ new spot)/, ', $1') + (shrinking.length || growing.length || newSpots.length ? '.' : '') + (twoReads.length ? ` ${twoReads.length === 1 ? `The ${twoReads[0][0].kind} on ${fmtDate(twoReads[0][0].date)} was` : `${twoReads.length} scans were`} read by two radiologists.` : '')] : []),
  ];

  const asText = () => [
    `Visit summary for ${user.name}, before cycle ${last.cycle + 1}`,
    `${checkins.length} check-ins, ${fmtDate(first.date)} to ${fmtDate(last.date)}.`, '',
    'The short version', ...short.map((s) => `- ${s}`), '',
    ...(out?.patient ? ['In plain words', out.patient, ''] : []),
    'What changed since the first check-in',
    ...GROUPS.flatMap((g) => g.rows.map((r) => `- ${r.label}: ${show(r.get(first), r.unit)} -> ${show(r.get(last), r.unit)}${flagById[r.id] ? ` (${STATUS[flagById[r.id].level].toLowerCase()})` : ''}`)), '',
    ...(groups.length ? ['Scans', ...groups.flatMap((g) => g.map((s) => `- ${s.kind}, ${fmtDate(s.date)}, ${s.reader}: ${s.extracted.impression}`)), ''] : []),
    ...(questions.length ? ['Questions for the next visit', ...questions.map((q) => `- ${q}`), ''] : []),
    'Phone measurements are approximate and measure function, not nerves directly. Not a diagnosis.',
  ].join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(asText()); setCopied('Copied. Paste it into a patient-portal message or email.'); }
    catch (_) { setCopied('Your browser blocked copying. Select the report text and copy it.'); }
  }

  return (
    <div className="wrap wide">
      <div className="no-print rep-top">
        <div>
          <h1>Report for your care team</h1>
          <p className="lede">One page to bring to your next infusion or send through your patient portal.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={copy}><Icon name="copy" size={18} /> Copy report text</button>
          {!HOSTED_PREVIEW && <button type="button" className="btn" onClick={() => window.print()}><Icon name="printer" size={18} /> Print or save as PDF</button>}
        </div>
        {copied && <p className="notice" role="status">{copied}</p>}
      </div>

      <article className="card report">
        <header className="rep-head">
          <h2>Visit summary for {user.name}</h2>
          <p className="muted">Before cycle {last.cycle + 1}. {checkins.length} check-in{checkins.length > 1 ? 's' : ''} from {fmtDate(first.date)} to {fmtDate(last.date)}.{user.mode === 'demo' ? ' Demo patient with simulated data.' : ''}</p>
        </header>

        <div className="rep-pair">
        <section className="rep-sec">
          <h3>The short version</h3>
          <ul className="short">{short.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>

        <section className="rep-sec">
          <h3>In plain words</h3>
          {busy && !out ? <p className="muted">Writing…</p> : out ? <>
            <p>{out.patient}</p>
            <p className="fine">{out.source === 'gemma' ? `Written by Gemma 4 (${out.model}) from the numbers below.` : 'Template text. Gemma isn’t connected here.'} <button type="button" className="linkish no-print" disabled={busy} onClick={write}>{busy ? 'Rewriting…' : 'Rewrite'}</button></p>
          </> : null}
        </section>
        </div>

        {checkins.length > 1 && <section className="rep-sec">
          <h3>What changed since the first check-in</h3>
          <div className="table-wrap"><table className="changes-table">
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">Cycle {first.cycle}</th><th scope="col">Cycle {last.cycle}</th><th scope="col"><span className="sr-only">Change</span></th></tr></thead>
            {GROUPS.map((g) => (
              <tbody key={g.name}>
                <tr className="grp"><th scope="rowgroup" colSpan={4}>{g.name}</th></tr>
                {g.rows.map((r) => {
                  const f = flagById[r.id];
                  return <tr key={r.id} className={f ? f.level : ''}><th scope="row">{r.label}</th><td>{show(r.get(first), r.unit)}</td><td><b>{show(r.get(last), r.unit)}</b></td><td className="st">{f ? STATUS[f.level] : ''}</td></tr>;
                })}
              </tbody>
            ))}
          </table></div>
        </section>}

        {groups.length > 0 && <section className="rep-sec">
          <h3>Scans</h3>
          {tracks.tracks.length > 0 && <div className="table-wrap"><table className="changes-table">
            <thead><tr><th scope="col">Spot</th>{tracks.dates.map((d) => <th key={d} scope="col">{fmtDate(d)}</th>)}</tr></thead>
            <tbody>{tracks.tracks.map((t) => <tr key={t.location}><th scope="row">{t.location}</th>{t.points.map((p, k) => <td key={k}>{p ? (p.max > p.min ? `${p.min}–${p.max} mm` : `${p.mm} mm`) : '–'}</td>)}</tr>)}</tbody>
          </table></div>}
          <p className="fine">Sizes as written in the reports. A range means two radiologists measured it differently.</p>
          <ul className="reads">{groups.flatMap((g) => g.map((s) => <li key={s.id}><b>{s.kind}, {fmtDate(s.date)}</b> <span className="muted">read by {s.reader}</span><br />“{s.extracted.impression}”</li>))}</ul>
        </section>}

        {questions.length > 0 && <section className="rep-sec">
          <h3>Questions for the next visit</h3>
          <ul className="checks">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </section>}

        <section className="rep-sec tech">
          <h3>For the oncology team</h3>
          <p className="fine">Function twin: an uncalibrated Kalman filter over phone measures and symptom ratings, not nerve-specific. Estimate per cycle, with likely range: {twin.map((t) => `C${t.cycle} ${r0(t.mean)} (${r0(t.low)}–${r0(t.high)})`).join(', ')}.{worse.length ? ` Worse than the model expected at cycle ${worse.join(', ')}.` : ''} Change labels come from fixed thresholds against the patient’s own first check-in. Unvalidated smartphone measures; interpret against the patient’s own trend only.</p>
          <div className="table-wrap"><table className="changes-table all">
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{checkins.map((c) => <th key={c.id} scope="col">C{c.cycle}</th>)}</tr></thead>
            <tbody>{GROUPS.flatMap((g) => g.rows).map((r) => <tr key={r.id}><th scope="row">{r.label}{r.unit ? <span className="u"> {r.unit}</span> : null}</th>{checkins.map((c) => <td key={c.id}>{r.get(c) ?? '–'}</td>)}</tr>)}</tbody>
          </table></div>
        </section>

        <p className="fine">Phone measurements are approximate and measure function, not nerves directly. This is not a diagnosis.</p>
      </article>
    </div>
  );
}
