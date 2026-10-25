import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import { BandChart, BodyMap, Walker, Sparkline, DualTimeline } from '../components/Viz.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { checkinsForTwin } from '../core/checkinSource.js';
import { useStore } from '../store.jsx';
import { fmtDate } from '../lib/format.js';

function tapRate(c) {
  const t = c.tapping; if (!t) return null;
  const v = [t.right, t.left].filter((x) => x?.ok).map((x) => x.rate);
  return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
}

// "What changed" grouped by area, one tidy row per change: what it is, how it changed, before → now.
const AREA_OF = { cadence: 'Walking', regularity: 'Walking', variability: 'Walking', hesitations: 'Walking', sway: 'Balance', romberg: 'Balance', falls: 'Balance', 'tap-right': 'Hands', 'tap-left': 'Hands', buttons: 'Hands' };
const LABEL = { cadence: 'Walking pace', regularity: 'Step evenness', variability: 'Step timing', hesitations: 'Pauses while walking', sway: 'Sway, standing still', romberg: 'Sway with eyes closed', falls: 'Trips and falls', 'tap-right': 'Right-hand tapping', 'tap-left': 'Left-hand tapping', buttons: 'Buttons and zips' };
function changeRow(f) {
  const t = f.text;
  let m;
  if ((m = t.match(/Reports (.+) at (\d+)\/10 \(baseline (\d+)\/10\)/))) return { area: 'Symptoms', label: (m[1][0].toUpperCase() + m[1].slice(1)).replace(/ in the (feet|hands)$/, ', $1'), how: '', was: `${m[3]} of 10`, now: `${m[2]} of 10` };
  const paren = t.match(/\(([^)]*)\)\.?$/);
  const range = paren && paren[1].match(/^(?:regularity )?(.+?) → (.+)$/);
  const base = paren?.[1].match(/^baseline: (.+)$/);
  let how = t.replace(/\s*\([^)]*\)\.?$/, '').replace(/\.$/, '');
  if ((m = how.match(/is (\d+%) (slower|higher)/))) how = `${m[1]} ${m[2]}`;
  else if ((m = how.match(/is ([\d.]+×) baseline/))) how = `${m[1]} as much`;
  else if (/much more/.test(how)) how = 'Much more than before';
  else if (/varies more|rises more/.test(how)) how = 'More than before';
  else if (/much less even/.test(how)) how = 'Much less even';
  else if (/less even/.test(how)) how = 'Less even';
  else if (f.id === 'hesitations') how = '';
  else if (f.id === 'buttons') how = 'New since your first check-in';
  else if (f.id === 'falls') how = /near-fall/.test(t) ? 'A near-fall since last time' : 'A fall since last time';
  return { area: AREA_OF[f.id] || 'Other', label: LABEL[f.id] || how, how, was: range ? range[1] : base ? base[1] : null, now: range ? range[2].replace(/ eyes-open sway$/, '') : f.id === 'hesitations' ? t.match(/^(\d+)/)[1] : null };
}
const AREAS_ORDER = ['Walking', 'Balance', 'Hands', 'Symptoms', 'Other'];
function ChangeList({ flags }) {
  const rows = flags.map((f) => ({ ...changeRow(f), id: f.id, notable: f.level === 'notable' }));
  return (
    <div className="changes">
      {AREAS_ORDER.map((a) => {
        const rs = rows.filter((r) => r.area === a);
        if (!rs.length) return null;
        return (
          <section key={a} className="chg-group" aria-label={a}>
            <h3>{a}<span>{rs.length} change{rs.length > 1 ? 's' : ''}</span></h3>
            <ul>
              {rs.map((r) => (
                <li key={r.id}>
                  <div><b>{r.label}</b>{r.how && <span>{r.how}</span>}</div>
                  {r.was != null && <p className="chg-vals"><span>{r.was}</span><i aria-label="to">→</i><b>{r.now}</b></p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const METRICS = [
  { name: 'Walking pace', unit: 'steps/min', get: (c) => (c.gait?.ok ? c.gait.cadence : null), hint: 'Steps per minute' },
  { name: 'Step evenness', unit: 'of 1', get: (c) => (c.gait?.ok ? c.gait.stepRegularity : null), hint: 'Closer to 1 is more even', min: 0, max: 1 },
  { name: 'Step timing variation', unit: '%', get: (c) => (c.gait?.ok ? c.gait.stepTimeCV : null), hint: 'Higher means less steady timing' },
  { name: 'Standing sway', unit: 'index', get: (c) => (c.balance?.ok ? +(c.balance.swayRms * 100).toFixed(1) : null), hint: 'Higher means more wobble' },
  { name: 'Eyes-closed sway', unit: '× eyes open', get: (c) => (c.balance?.ok && c.balanceClosed?.ok ? +(c.balanceClosed.swayRms / c.balance.swayRms).toFixed(2) : null), hint: 'Higher means you rely more on your eyes' },
  { name: 'Tapping speed', unit: 'taps/s', get: tapRate, hint: 'Average of both hands' },
  { name: 'Feet symptoms', unit: '/10', get: (c) => Math.max(c.symptoms?.feetNumb || 0, c.symptoms?.feetPain || 0), hint: 'Your own rating', min: 0, max: 10 },
  { name: 'Hand symptoms', unit: '/10', get: (c) => c.symptoms?.handsNumb || 0, hint: 'Your own rating', min: 0, max: 10 },
];

function sourceKind(checkin) {
  const taskSources = Object.values(checkin.measurementSources || {});
  const hasSample = taskSources.includes('sample');
  const hasSensor = taskSources.includes('sensor');
  if (hasSample && (hasSensor || checkin.source === 'sensor')) return 'mixed';
  if (hasSample) return 'sample';
  if (hasSensor && checkin.source === 'sample') return 'mixed';
  return checkin.source || (checkin.demo ? 'simulated' : 'unknown');
}

function sourceDescription(checkin) {
  switch (sourceKind(checkin)) {
    case 'sensor': return 'Phone sensor measurements.';
    case 'sample': return 'Sample measurements; not captured from the phone.';
    case 'mixed': return 'A mix of sample data and phone sensor measurements.';
    case 'simulated': return 'Simulated demo data.';
    default: return 'Measurement source was not recorded.';
  }
}

function walkingDescription(checkin) {
  if (!checkin.gait?.ok) return 'Walking was not measured.';
  switch (sourceKind(checkin)) {
    case 'sample': return 'Sample footsteps are simulated, not real recorded steps.';
    case 'sensor': return 'Illustration of detected step timing, not a reconstruction of actual movement.';
    case 'mixed': return 'Illustration of step timing for mixed data; it may include sample timing and does not reconstruct actual movement.';
    case 'simulated': return 'Demo footsteps are simulated, not real recorded steps.';
    default: return 'Illustrative step timing; the source was not recorded, and this is not a reconstruction of actual movement.';
  }
}

export default function Twin({ go }) {
  const { checkins, scans, user } = useStore();
  const demoMode = user?.mode === 'demo';
  const [sel, setSel] = useState(checkins.length - 1);
  useEffect(() => { setSel(checkins.length - 1); }, [checkins.length]);
  const twinInputs = useMemo(
    () => checkinsForTwin(checkins, demoMode),
    [checkins, demoMode],
  );
  const twin = useMemo(() => FunctionTwin.run(twinInputs), [twinInputs]);
  const tumor = useMemo(() => Scans.tumorSeries(scans), [scans]);

  if (!checkins.length) {
    return (
      <div className="wrap">
        <h1>Your function twin</h1>
        <div className="card"><p>Your twin appears after your first check-in. It takes about two minutes.</p>
          <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn primary" onClick={() => go('checkin')}>Start my first check-in <Icon name="arrowRight" size={18} /></button></div></div>
      </div>
    );
  }
  const i = Math.min(sel, checkins.length - 1);
  const base = checkins[0], cur = checkins[i], step = twin[i];
  const personalBase = twinInputs[0] || base;
  const personalCur = twinInputs[i] || cur;
  const flags = Trends.compare(personalBase, personalCur);
  const level = i === 0 || !flags.length ? null : Trends.overall(flags);
  const gnum = (g) => (g?.ok ? `${Math.round(g.cadence)} steps/min` : 'no walk');
  const sourceNotes = checkins
    .map((c) => ({ cycle: c.cycle, source: sourceKind(c), description: sourceDescription(c) }))
    .filter((c, index) => c.source !== 'sensor'
      || Object.values(checkins[index].measurementSources || {}).includes('sample'));
  const sourceNotice = sourceNotes.length
    ? `${sourceNotes.map((c) => `Cycle ${c.cycle}: ${c.description}`).join(' ')} ${demoMode
      ? 'This is a fictional demo estimate.'
      : 'Sample and simulated physical measurements are excluded from this personal estimate. For older mixed or unknown-source entries without task details, all physical measurements are excluded; saved values and symptom answers are retained.'}`
    : '';
  const baselineMessage = checkins.length === 1
    ? 'Baseline recorded. Add another check-in to compare changes.'
    : `Cycle ${base.cycle} is your baseline, so the function score starts at 100.`;
  const symptomsOnly = !personalCur.gait?.ok && !personalCur.balance?.ok && !personalCur.balanceClosed?.ok
    && !personalCur.tapping?.right?.ok && !personalCur.tapping?.left?.ok;
  const sampleOnlyPhysical = symptomsOnly && (cur.gait?.ok || cur.balance?.ok || cur.balanceClosed?.ok
    || cur.tapping?.right?.ok || cur.tapping?.left?.ok);

  return (
    <div className="wrap wide page-ed tw-page">
      <section className="tw-hero" aria-labelledby="twin-h">
        <p className="mono tw-k">Function twin · cycle {cur.cycle} · {fmtDate(cur.date)}</p>
        <h1 id="twin-h">Your function twin</h1>
        <div className="tw-score">
          <b>{Math.round(step.score)}</b>
          <span>of 100<em>{i === 0 ? 'your starting point' : `likely ${Math.round(step.scoreLow)}–${Math.round(step.scoreHigh)}`}</em></span>
        </div>
        <p className="tw-sub">Each test on its own is noisy. Your twin combines them, trusts the reliable ones more, and gives one score. 100 is how you were at your first check-in.</p>
        <p className="fine">{i === 0 ? baselineMessage : `Experimental model uncertainty range: ${Math.round(step.scoreLow)}–${Math.round(step.scoreHigh)} on ${fmtDate(cur.date)}.`} The estimate is unvalidated; its range is model uncertainty, not a clinical confidence interval or measured decline.</p>
      </section>
      {demoMode && <p className="notice rose" role="note">Demo estimate. This fictional timeline uses simulated measurements and does not describe a real person.</p>}
      {sourceNotice && <p className="notice rose" role="note">{sourceNotice} Chart values include these sample or simulated measurements.</p>}
      {symptomsOnly && !sampleOnlyPhysical && <p className="notice rose" role="note">Symptoms-only check-in. Walking, balance, and hand performance were not measured.</p>}
      {sampleOnlyPhysical && <p className="notice rose" role="note">No personal physical measurements are available for this check-in. Sample or unverified physical results are excluded from your personal estimate.</p>}
      {step.surprise !== 'none' && <p className="fine">{FunctionTwin.interpretation(step, flags.length > 0)}</p>}
      <section className="tw-chart" aria-label="Twin estimate over time">
        <div className="tw-chart-top"><p className="mono">Cycle {base.cycle} → {checkins[checkins.length - 1].cycle}</p>{level && <Chip level={level} />}</div>
        <BandChart steps={twin} selected={i} />
        <ul className="legend" aria-label="Chart key">
          <li><span className="k k-line" />Twin’s estimate</li>
          <li><span className="k k-band" />Model uncertainty range</li>
          <li><span className="k k-model" />Model discrepancy</li>
          <li><span className="k k-dot" />Individual signals</li>
        </ul>
      </section>
      <div className="page-ed-body">

      <h2>Your infusions</h2>
      <div className="beads" role="tablist" aria-label="Choose a check-in">
        {checkins.map((c, k) => {
          const checkinFlags = Trends.compare(personalBase, twinInputs[k]);
          const lv = k === 0 ? 'steady' : checkinFlags.length ? Trends.overall(checkinFlags) : 'steady';
          return <button key={c.id} type="button" role="tab" aria-selected={k === i} className={`bead ${lv}`} onClick={() => setSel(k)} aria-label={`Cycle ${c.cycle}, ${fmtDate(c.date)}`}>C{c.cycle}<small>{fmtDate(c.date)}</small></button>;
        })}
      </div>

      {i > 0 && <>
        <h2>What changed since your first check-in</h2>
        {flags.length ? <><p className="muted chg-intro">Grouped by area. Each row shows your first check-in, then this one.</p><ChangeList flags={flags} /></>
          : <p className="muted">No recorded symptom or sensor change crossed the comparison thresholds.</p>}

        <h2>What the twin is listening to</h2>
        <p className="muted">{FunctionTwin.disagreements(step)} The bar shows each signal; the pink tick is the twin’s combined estimate. “Counts” is how much each signal contributes, based on how noisy it tends to be.</p>
        <div className="card drivers">
          {step.signals.map((g) => {
            const v = g.score == null ? null : Math.max(0, Math.min(100, g.score));
            return (
              <div key={g.id} className={`driver${v == null ? ' missing' : ''}`}>
                <span>{g.label}</span>
                <span className="track" aria-hidden="true">{v != null && <span className="fill" style={{ width: `${v}%` }} />}<span className="est" style={{ left: `${Math.min(99, step.score)}%` }} /></span>
                <span className="v">{v == null ? 'not measured' : `${Math.round(v)}, counts ${Math.round(g.share * 100)}%`}</span>
              </div>
            );
          })}
        </div>
      </>}

      <h2>What you can see</h2>
      <section className="card stage">
        <figure className="body-fig"><BodyMap symptoms={cur.symptoms} /><figcaption className="fine">Glow shows the numbness, tingling, or pain you reported</figcaption></figure>
        <div>
          <div className="walker-label"><span>Baseline (cycle {base.cycle})</span><span className="muted num">{gnum(base.gait)}</span></div>
          {base.gait?.ok
            ? <Walker stepTimes={base.gait.stepTimes} label="Baseline walking step-timing illustration" />
            : <p className="fine">Walking was not measured at baseline.</p>}
          <div className="walker-label" style={{ marginTop: 10 }}><span>Cycle {cur.cycle}</span><span className="muted num">{gnum(cur.gait)}</span></div>
          {cur.gait?.ok
            ? <Walker stepTimes={cur.gait.stepTimes} label={`Cycle ${cur.cycle} walking step-timing illustration`} />
            : <p className="fine">Walking was not measured for this check-in.</p>}
          {(base.gait?.ok || cur.gait?.ok) && <p className="fine">Baseline: {walkingDescription(base)} Cycle {cur.cycle}: {walkingDescription(cur)} Uneven gaps show uneven timing.</p>}
        </div>
      </section>

      <h2>Your tumor and your function, side by side</h2>
      <section className="card">
        <p className="muted" style={{ marginTop: 0 }}>Tumor sizes come from your radiology reports. When two doctors read the same scan, the shaded bar shows the range between them. The app never weighs one against the other: that’s a conversation for you and your oncologist.</p>
        <DualTimeline tumor={tumor} twin={twin} />
        <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn rose" onClick={() => go('scans')}><Icon name="scan" size={18} /> {scans.length ? 'View scan reports' : 'Add a scan report'}</button></div>
      </section>

      {sourceNotice && <p className="notice rose" role="note">{sourceNotice} The selected cycle is highlighted in each chart.</p>}
      <h2>Each measurement over time</h2>
      <div className="trends">
        {METRICS.map((m) => {
          const vals = checkins.map(m.get);
          return (
            <div className="card trend" key={m.name}>
              <h3 style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: '0.98rem' }}>{m.name}</h3>
              <div><span className="val">{vals[i] ?? '—'}</span> <span className="muted">{m.unit}</span></div>
              <p className="fine" style={{ margin: 0 }}>{m.hint}</p>
              <Sparkline values={vals} selected={i} min={m.min} max={m.max} label={`${m.name}: ${vals.map((v) => v ?? 'none').join(', ')}`} />
            </div>
          );
        })}
      </div>

      <details className="more" style={{ marginTop: 18 }}>
        <summary>How the twin works</summary>
        <p>The twin is an experimental state-space model (a Kalman filter), the kind of model engineers use to track things they can’t see directly. It assumes each chemo cycle may bring a little change. At each check-in it compares that expectation with your signals and trusts the less noisy ones more. A model discrepancy is not, by itself, evidence of deterioration.</p>
        <p>It estimates function, not your nerves directly. Changes can come from nerve side effects, tiredness, anemia, pain, or other causes. Its settings are illustrative, not clinically calibrated, and it doesn’t predict your future. The displayed range represents model uncertainty, not a clinical confidence interval.</p>
      </details>

      <div className="actions">
        <button type="button" className="btn primary" onClick={() => go('checkin')}><Icon name="plus" size={18} /> New check-in</button>
        <button type="button" className="btn" onClick={() => go('report')}><Icon name="report" size={18} /> Make a report for my care team</button>
      </div>
      </div>
    </div>
  );
}
