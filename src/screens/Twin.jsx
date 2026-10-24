import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import { BandChart, BodyMap, Walker, Sparkline, DualTimeline } from '../components/Viz.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { useStore } from '../store.jsx';
import { fmtDate } from '../lib/format.js';

function tapRate(c) {
  const t = c.tapping; if (!t) return null;
  const v = [t.right, t.left].filter((x) => x?.ok).map((x) => x.rate);
  return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
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

export default function Twin({ go }) {
  const { checkins, scans } = useStore();
  const [sel, setSel] = useState(checkins.length - 1);
  useEffect(() => { setSel(checkins.length - 1); }, [checkins.length]);
  const twin = useMemo(() => FunctionTwin.run(checkins), [checkins]);
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
  const flags = Trends.compare(base, cur);
  const level = i === 0 ? null : step.surprise === 'worse' ? 'notable' : Trends.overall(flags);
  const gnum = (g) => (g?.ok ? `${Math.round(g.cadence)} steps/min` : 'no walk');

  return (
    <div className="wrap">
      <h1>Your function twin</h1>
      <p className="lede">Each test on its own is noisy: a tired day or different shoes can change one result. Your twin combines all your signals, trusts the reliable ones more, and estimates how much your walking, balance, and hand function have changed since your first check-in.</p>

      <section className="card twin-hero" aria-label="Twin estimate">
        <div className="score-row" style={{ justifyContent: 'space-between' }}>
          <div className="score-row"><span className="score">{Math.round(step.mean)}</span><span className="muted">/100 change in function at cycle {cur.cycle}</span></div>
          {level && <Chip level={level} />}
        </div>
        <p>{i === 0 ? (checkins.length === 1 ? 'This is your baseline. The twin starts learning at your next check-in.' : `Cycle ${base.cycle} is your baseline, so the twin starts at 0.`)
          : `Likely between ${Math.round(step.low)} and ${Math.round(step.high)} on ${fmtDate(cur.date)}. Before this check-in, the twin expected about ${Math.round(step.priorMean)}.`}</p>
        {step.surprise === 'worse' && <p className="notice red"><strong>Worse than your twin expected.</strong> This is worth telling your care team before your next infusion.</p>}
        {step.surprise === 'better' && <p className="notice">This check-in was better than your twin expected.</p>}
        <BandChart steps={twin} selected={i} />
        <ul className="legend" aria-label="Chart key">
          <li><span className="k k-line" />Twin’s estimate</li>
          <li><span className="k k-band" />Likely range</li>
          <li><span className="k k-prior" />What it expected</li>
          <li><span className="k k-red" />Worse than expected</li>
          <li><span className="k k-dot" />Individual signals</li>
        </ul>
      </section>

      <h2>Your infusions</h2>
      <div className="beads" role="tablist" aria-label="Choose a check-in">
        {checkins.map((c, k) => {
          const lv = k === 0 ? 'steady' : twin[k].surprise === 'worse' ? 'notable' : Trends.overall(Trends.compare(base, c));
          return <button key={c.id} type="button" role="tab" aria-selected={k === i} className={`bead ${lv}`} onClick={() => setSel(k)} aria-label={`Cycle ${c.cycle}, ${fmtDate(c.date)}`}>C{c.cycle}<small>{fmtDate(c.date)}</small></button>;
        })}
      </div>

      {i > 0 && <>
        <h2>What changed since your first check-in</h2>
        {flags.length ? <ul className="flags">{flags.map((f) => <li key={f.id} className={f.level}>{f.text}</li>)}</ul>
          : <p className="muted">Nothing has changed beyond normal day-to-day variation.</p>}

        <h2>What the twin is listening to</h2>
        <p className="muted">{FunctionTwin.disagreements(step)} The bar shows each signal; the pink tick is the twin’s combined estimate. “Counts” is how much each signal contributes, based on how noisy it tends to be.</p>
        <div className="card drivers">
          {step.signals.map((g) => {
            const v = g.value == null ? null : Math.max(0, Math.min(100, g.value));
            return (
              <div key={g.id} className={`driver${v == null ? ' missing' : ''}`}>
                <span>{g.label}</span>
                <span className="track" aria-hidden="true">{v != null && <span className="fill" style={{ width: `${v}%` }} />}<span className="est" style={{ left: `${Math.min(99, step.mean)}%` }} /></span>
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
          <Walker stepTimes={base.gait?.ok ? base.gait.stepTimes : []} label="Baseline walking rhythm" />
          <div className="walker-label" style={{ marginTop: 10 }}><span>Cycle {cur.cycle}</span><span className="muted num">{gnum(cur.gait)}</span></div>
          <Walker stepTimes={cur.gait?.ok ? cur.gait.stepTimes : []} label={`Cycle ${cur.cycle} walking rhythm`} />
          <p className="fine">Each footprint is one real step from that check-in, replayed in its real timing. Uneven gaps mean uneven steps.</p>
        </div>
      </section>

      <h2>Your tumor and your function, side by side</h2>
      <section className="card">
        <p className="muted" style={{ marginTop: 0 }}>Tumor sizes come from your radiology reports. When two doctors read the same scan, the shaded bar shows the range between them. The app never weighs one against the other: that’s a conversation for you and your oncologist.</p>
        <DualTimeline tumor={tumor} twin={twin} />
        <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn rose" onClick={() => go('scans')}><Icon name="scan" size={18} /> {scans.length ? 'View scan reports' : 'Add a scan report'}</button></div>
      </section>

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
        <p>The twin is a state-space model (a Kalman filter), the kind of model engineers use to track things they can’t see directly. It assumes each chemo cycle may bring a little change. At each check-in it compares that expectation with your signals and trusts the less noisy ones more. When a check-in is much worse than it expected, it flags it.</p>
        <p>It measures function, not your nerves directly. Changes can come from nerve side effects, tiredness, anemia, pain, or other causes, which is why they’re worth showing your care team. Its settings are reasonable starting values for this prototype, not clinically calibrated, and it doesn’t predict your future.</p>
      </details>

      <div className="actions">
        <button type="button" className="btn primary" onClick={() => go('checkin')}><Icon name="plus" size={18} /> New check-in</button>
        <button type="button" className="btn" onClick={() => go('report')}><Icon name="report" size={18} /> Make a report for my care team</button>
      </div>
    </div>
  );
}
