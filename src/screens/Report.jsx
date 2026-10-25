import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { checkinsForTwin, hasExcludedPhysicalMeasurements, isDemoCheckins, personalMeasurementInputs } from '../core/checkinSource.js';
import { useStore, HOSTED_PREVIEW } from '../store.jsx';
import { writeReport } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { formatReportValue, isMissingReportValue } from '../core/reportFormat.js';
import { reportInputDescription } from '../core/reportWording.js';

/*
 * Report: a header with the overall twin score, then an explorer. Pick any measure (or a scan
 * spot) on the left and see it as one line across every check-in, with a plain sentence above.
 * Numbers come from fixed rules and the twin; Gemma writes only the optional summary.
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
const plain = (t) => t.replace(/than at baseline/g, 'than at your first check-in').replace(/\(baseline:? /g, '(first check-in: ').replace(/× baseline/g, '× your first check-in').replace(/ since the last check-in/g, '');
const show = formatReportValue;

function TwinSpark({ twin }) {
  if (twin.length < 2) return null;
  const W = 260, H = 64, P = 6, bottom = Math.min(60, ...twin.map((t) => t.scoreLow));
  const x = (i) => P + (i / (twin.length - 1)) * (W - 2 * P), y = (v) => P + ((100 - v) / (100 - bottom)) * (H - 2 * P);
  const band = twin.map((t, i) => `${x(i)},${y(t.scoreHigh)}`).concat(twin.map((t, i) => `${x(i)},${y(t.scoreLow)}`).reverse()).join(' ');
  return (
    <svg className="twin-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polygon points={band} fill="var(--navy-wash)" />
      <polyline points={twin.map((t, i) => `${x(i)},${y(t.score)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      {twin.map((t, i) => <circle key={i} cx={x(i)} cy={y(t.score)} r={i === twin.length - 1 ? 4 : 2.6} fill="var(--ink)" />)}
    </svg>
  );
}


/* ---------- Overview: rings per ability, and a cycle-by-cycle story ---------- */
// Which twin signals belong to which ability. Each signal is 0 (same as the first check-in) to 100.
const AREAS = [
  { id: 'walking', name: 'Walking', signals: ['pace', 'timing', 'evenness', 'feet'] },
  { id: 'balance', name: 'Balance', signals: ['sway', 'romberg'] },
  { id: 'hands', name: 'Hands', signals: ['tapping', 'hands-fine', 'hands'] },
];
const ringWord = (f) => (f >= 80 ? 'Close to where you started' : f >= 50 ? 'Some change' : f >= 25 ? 'More change' : 'The most change');
function Rings({ step }) {
  return (
    <div className="arings" role="list">
      {AREAS.map((a) => {
        const vals = step.signals.filter((g) => a.signals.includes(g.id) && g.value != null).map((g) => g.value);
        const fill = vals.length ? Math.max(0, Math.min(100, 100 - vals.reduce((x, y) => x + y, 0) / vals.length)) : 100;
        const C = 2 * Math.PI * 40;
        return (
          <div key={a.id} className="aring" role="listitem" aria-label={`${a.name}: ${ringWord(fill)}`}>
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--tint)" strokeWidth="11" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--navy)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fill / 100)} transform="rotate(-90 50 50)" className="ring-fill" style={{ '--from': C, '--to': C * (1 - fill / 100) }} />
            </svg>
            <b>{a.name}</b>
            <small>{ringWord(fill)}</small>
          </div>
        );
      })}
    </div>
  );
}

const NOTE = {
  cadence: 'walking slower', variability: 'steps less steady', regularity: 'steps less even', hesitations: 'pauses while walking',
  sway: 'more sway standing still', romberg: 'more sway with eyes closed', 'tap-right': 'right-hand tapping slower', 'tap-left': 'left-hand tapping slower',
  feetNumb: 'more numbness in the feet', handsNumb: 'more numbness in the hands', feetPain: 'more foot pain', buttons: 'trouble with buttons or zips',
};
const sentence = (parts) => { const p = parts.slice(0, 4); const t = p.length > 1 ? `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}` : p[0]; return t[0].toUpperCase() + t.slice(1) + '.'; };
function Journey({ checkins }) {
  const notes = checkins.map((c, k) => {
    if (k === 0) return { c, text: 'Your starting point.', n: 0 };
    const prev = checkins[k - 1];
    const flags = Trends.compare(prev, c);
    const parts = flags.map((f) => (f.id === 'falls' ? (c.falls === 'fall' ? 'a fall' : 'a near-fall') : NOTE[f.id])).filter(Boolean);
    if (!parts.length) {
      const small = [];
      if ((c.symptoms?.feetNumb || 0) > (prev.symptoms?.feetNumb || 0)) small.push(`a little more tingling in the feet (${c.symptoms.feetNumb} out of 10)`);
      if ((c.symptoms?.handsNumb || 0) > (prev.symptoms?.handsNumb || 0)) small.push(`a little tingling in the hands (${c.symptoms.handsNumb} out of 10)`);
      return { c, text: small.length ? `About the same as last time, with ${small.join(' and ')}.` : 'About the same as last time.', n: 0 };
    }
    return { c, text: sentence(parts), n: parts.length };
  });
  const most = notes.reduce((m, x, k) => (x.n > (notes[m]?.n || 0) ? k : m), -1);
  return (
    <ol className="journey">
      {notes.map((x, k) => (
        <li key={x.c.id} className={k === most && x.n >= 3 ? 'big' : ''}>
          <b>Cycle {x.c.cycle}, {fmtDate(x.c.date)}</b>
          <span>{k === most && x.n >= 3 ? 'Biggest change from the check-in before. ' : ''}{x.text}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Explore: pick a measure, see it as a line across every check-in ---------- */
const CATS = { buttons: ['No', 'Yes'], falls: ['None', 'Near-fall', 'Fall'] };
const num = (id, v) => {
  if (isMissingReportValue(v)) return null;
  return CATS[id] ? CATS[id].indexOf(v) : v;
};
const times = (b, a) => (a ? Math.round((b / a) * 10) / 10 : null);
const sAgo = (a, c) => `at cycle ${c}`;

/** One plain sentence for a measure: latest value next to cycle 1, in everyday words. */
function describe(id, a, b, c1) {
  const at1 = sAgo(a, c1);
  switch (id) {
    case 'twin': return `Your function score is ${b} out of 100. 100 is how you were at cycle ${c1}; the lower it goes, the more your walking, balance, and hands have changed.`;
    case 'cadence': return `You walked ${b} steps a minute, ${b < a ? `down from ${a}` : b > a ? `up from ${a}` : 'the same as'} ${at1}.`;
    case 'variability': return `The time between your steps varied by ${b}%, compared with ${a}% ${at1}. Lower means steadier steps.`;
    case 'regularity': return `Your steps scored ${b} for evenness, compared with ${a} ${at1}. 1 would mean every step is exactly alike.`;
    case 'hesitations': return `You paused ${b === 0 ? 'no times' : b === 1 ? 'once' : `${b} times`} during the 30-second walk, compared with ${a === 0 ? 'none' : a} ${at1}.`;
    case 'sway': { const x = times(b, a); return x && x !== 1 ? `Standing still, you swayed ${x} times as much as ${at1}.` : `Standing still, you swayed about the same as ${at1}.`; }
    case 'romberg': return `With your eyes closed you swayed ${b} times as much as with them open. ${at1[0].toUpperCase() + at1.slice(1)} it was ${a} times.`;
    case 'tap-right': return `Your right hand tapped ${b} times a second, compared with ${a} ${at1}.`;
    case 'tap-left': return `Your left hand tapped ${b} times a second, compared with ${a} ${at1}.`;
    case 'buttons': return b === 'Yes' ? `You've had trouble with buttons or zips${a === 'Yes' ? ', as you did' : `, which you didn't`} ${at1}.` : `No trouble with buttons or zips.`;
    case 'feetNumb': return `You rated numbness or tingling in your feet ${b} out of 10, compared with ${a} ${at1}.`;
    case 'handsNumb': return `You rated numbness or tingling in your hands ${b} out of 10, compared with ${a} ${at1}.`;
    case 'feetPain': return `You rated burning or pain in your feet ${b} out of 10, compared with ${a} ${at1}.`;
    case 'falls': return b === 'None' ? 'No falls or near-falls since the last check-in.' : `You had a ${b.toLowerCase()} since the last check-in.`;
    default: return '';
  }
}

function LineChart({ values, xLabels, band, cats, fmt, axisFmt, unitLabel, bounds, sel, onSel, label }) {
  const box = useRef(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(box.current); return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 220 : 260, L = cats ? 76 : 44, R = 18, T = 30, B = 34;
  const nums = values.map((v) => (isMissingReportValue(v) ? null : v));
  const all = nums.concat(band ? band.flatMap((b) => [b.low, b.high]) : []).filter(Number.isFinite);
  let lo = cats ? 0 : all.length ? Math.min(...all) : 0, hi = cats ? cats.length - 1 : all.length ? Math.max(...all) : 1;
  if (!cats) { const pad = (hi - lo || Math.abs(hi) || 1) * 0.15; lo = Math.max(0, lo - pad); hi += pad; }
  if (bounds) { lo = Math.max(bounds[0], lo); hi = Math.min(bounds[1], hi); }
  if (hi - lo < 1e-6) hi = lo + 1;
  const n = values.length;
  const x = (k) => (n === 1 ? (L + W - R) / 2 : L + (k / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let ticks;
  if (cats) ticks = cats.map((_, i) => i);
  else {
    const raw = (hi - lo) / 3, mag = 10 ** Math.floor(Math.log10(raw)), stepN = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) || raw;
    lo = Math.floor(lo / stepN) * stepN; hi = Math.ceil(hi / stepN) * stepN;
    if (bounds) { lo = Math.max(bounds[0], lo); hi = Math.min(bounds[1], hi); }
    ticks = []; for (let t = lo; t <= hi + 1e-9; t += stepN) ticks.push(+t.toFixed(4));
  }
  const pts = nums.map((v, k) => (v == null ? null : [x(k), y(v)]));
  const path = pts.filter(Boolean).map((p) => p.join(',')).join(' ');
  const pick = (e) => {
    const r = box.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, d = Infinity;
    nums.forEach((_, k) => { if (Math.abs(x(k) - px) < d) { d = Math.abs(x(k) - px); best = k; } });
    onSel(best);
  };
  const s = pts[sel];
  return (
    <div className="lc">
      <div className="lc-plot" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} onPointerMove={pick} onPointerDown={pick}>
        {ticks.map((t, i) => <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">{cats ? cats[t] : axisFmt(t)}</text>
        </g>)}
        {unitLabel && <text x={2} y={12} fontSize="12" fill="var(--ink-2)">{unitLabel}</text>}
        {band && <polygon points={band.map((b, k) => `${x(k)},${y(b.high)}`).concat(band.map((b, k) => `${x(k)},${y(b.low)}`).reverse()).join(' ')} fill="var(--navy-wash)" />}
        {s && <line x1={s[0]} x2={s[0]} y1={T - 10} y2={H - B} stroke="var(--ink)" strokeOpacity="0.25" />}
        <polyline key={label} points={path} fill="none" stroke="var(--navy)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" pathLength="1" className="draw" />
        {pts.map((p, k) => p && <circle key={k} cx={p[0]} cy={p[1]} r={k === sel ? 7 : 4.5} fill={k === sel ? 'var(--navy)' : 'var(--surface)'} stroke="var(--navy)" strokeWidth="2.5" />)}
        {xLabels.map((t, k) => <text key={k} x={x(k)} y={H - 10} textAnchor="middle" fontSize="12.5" fontWeight={k === sel ? 700 : 400} fill={k === sel ? 'var(--ink)' : 'var(--ink-2)'}>{t}</text>)}
      </svg>
      {sel >= 0 && <div className="lc-tip" style={{ left: `${Math.min(92, Math.max(8, (x(sel) / W) * 100))}%`, top: `${s ? (s[1] / H) * 100 : 50}%` }}>{xLabels[sel]}: {cats ? (nums[sel] == null ? 'Not measured' : cats[nums[sel]]) : fmt(nums[sel])}</div>}
      </div>
      <div className="lc-steps" role="group" aria-label="Choose a point">
        {xLabels.map((t, k) => <button key={k} type="button" aria-pressed={k === sel} onClick={() => onSel(k)}>{t}</button>)}
      </div>
    </div>
  );
}


/* At a glance: every measure sorted into Better / About the same / Worse versus the first check-in.
   "Worse" is exactly what the fixed change rules flag; "Better" uses the same size of change in the
   other direction. */
const SOME = { cadence: [-1, 8, 'pct'], variability: [1, 1.5, 'abs'], regularity: [-1, 0.1, 'abs'], hesitations: [1, 1, 'abs'], sway: [1, 50, 'pct'], romberg: [1, 30, 'pct'], 'tap-right': [-1, 15, 'pct'], 'tap-left': [-1, 15, 'pct'], feetNumb: [1, 2, 'abs'], handsNumb: [1, 2, 'abs'], feetPain: [1, 2, 'abs'] };
function sortOf(id, a, b, flagged) {
  if (flagged) return 'worse';
  if (id === 'buttons') return a === 'Yes' && b === 'No' ? 'better' : 'same';
  if (id === 'falls') return a !== 'None' && b === 'None' ? 'better' : 'same';
  const t = SOME[id]; if (!t || a == null || b == null) return 'same';
  const raw = t[2] === 'pct' ? (a ? ((b - a) / a) * 100 : 0) : b - a;
  return raw * t[0] <= -t[1] ? 'better' : 'same';
}
function Glance({ items, first, last, onPick }) {
  const flags = new Set(Trends.compare(first, last).map((f) => f.id));
  const rows = items.filter((x) => x.raw).map((x) => ({ x, a: x.raw[0], b: x.raw[x.raw.length - 1], k: sortOf(x.id, x.raw[0], x.raw[x.raw.length - 1], flags.has(x.id)) }));
  const count = (k) => rows.filter((r) => r.k === k).length;
  const WORD = { better: 'Better', same: 'Same', worse: 'Worse' };
  const groups = [...new Set(rows.map((r) => r.x.group))];
  return (
    <div className="glance" aria-label={`Every measure, cycle ${first.cycle} and cycle ${last.cycle}`}>
      <p className="glance-lead">Every measure, cycle {first.cycle} next to cycle {last.cycle}. <span className="muted">{count('worse')} worse, {count('same')} about the same, {count('better')} better.</span></p>
      {groups.map((g) => (
        <div key={g} className="gl-group">
          <h3>{g}</h3>
          {rows.filter((r) => r.x.group === g).map(({ x, a, b, k }) => {
            const numeric = typeof a === 'number' && typeof b === 'number';
            const max = Math.max(a || 0, b || 0, x.unit === '/10' ? 10 : x.unit === 'of 1' ? 1 : 0) || 1;
            return (
              <button key={x.id} type="button" className="gl-row" onClick={() => onPick(x.id)}>
                <span className="gl-name">{x.label}</span>
                <span className="gl-bars">
                  {[[`C${first.cycle}`, a, 'then'], [`C${last.cycle}`, b, 'now']].map(([lab, v, cls]) => (
                    <span key={lab} className={`gl-bar ${cls}`}>
                      <span className="gl-lab">{lab}</span>
                      <span className="gl-track" aria-hidden="true">{numeric && <i style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />}</span>
                      <span className="gl-v">{show(v, x.unit)}</span>
                    </span>
                  ))}
                </span>
                <span className={`gl-k ${k}`}>{WORD[k]}</span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="fine">Tap a measure to see every check-in. “Worse” follows the app’s fixed change rules; “Better” is the same size of change the other way.</p>
    </div>
  );
}

function Explorer({ checkins, twin, tracks }) {
  const first = checkins[0];
  const cyc = checkins.map((c) => `C${c.cycle}`);
  const items = [
    { group: 'Overall', id: 'twin', label: 'Overall function', values: twin.map((t) => r0(t.score)), band: twin.map((t) => ({ low: t.scoreLow, high: t.scoreHigh })), xLabels: cyc, unit: 'of 100' },
    ...GROUPS.flatMap((g) => g.rows.map((r) => ({ group: g.name, id: r.id, label: r.label, unit: r.unit, raw: checkins.map(r.get), values: checkins.map((c) => num(r.id, r.get(c))), xLabels: cyc, cats: CATS[r.id] }))),
    ...tracks.tracks.map((t, k) => ({ group: 'Scans', id: `spot-${k}`, label: t.location, unit: 'mm', values: t.points.map((p) => (p ? p.mm : null)), xLabels: tracks.dates.map(fmtDate), spot: t })),
  ];
  const [id, setId] = useState('twin');
  const it = items.find((x) => x.id === id) || items[0];
  const lastK = Math.max(0, it.values.length - 1);
  const [sel, setSel] = useState(lastK);
  useEffect(() => { setSel(lastK); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (v) => formatReportValue(isMissingReportValue(v) ? v : Math.round(v * 100) / 100, it.unit);
  const sentence = it.spot
    ? (it.spot.changePct == null ? `First measured ${fmtDate(tracks.dates[it.spot.points.findIndex(Boolean)])} at ${it.spot.last} mm.` : `Measured ${it.spot.first} mm on ${fmtDate(tracks.dates[0])} and ${it.spot.last} mm on ${fmtDate(tracks.dates[tracks.dates.length - 1])}, as written in the radiology reports.`)
    : it.id === 'twin'
      ? `${describe(it.id, it.values[0], it.values[it.values.length - 1], first.cycle)} ${reportInputDescription(checkins, isDemoCheckins(checkins))}`
      : (it.raw ? [it.raw[0], it.raw[it.raw.length - 1]].some(isMissingReportValue) : false)
        ? 'Not measured for one or more selected check-ins.'
        : describe(it.id, it.raw ? it.raw[0] : it.values[0], it.raw ? it.raw[it.raw.length - 1] : it.values[it.values.length - 1], first.cycle);
  const latest = (x) => {
    const v = x.raw ? x.raw[x.raw.length - 1] : x.values[x.values.length - 1];
    return x.cats
      ? formatReportValue(isMissingReportValue(v) ? v : x.cats[v])
      : formatReportValue(v, x.unit);
  };
  const groupNames = [...new Set(items.map((x) => x.group))];
  return (
    <section className="explore" aria-label="Explore your check-ins">
      <nav className="ex-list" aria-label="Measures">
        {groupNames.map((g) => (
          <div key={g} className="ex-group">
            <h3>{g}</h3>
            {items.filter((x) => x.group === g).map((x) => (
              <button key={x.id} type="button" aria-pressed={x.id === it.id} onClick={() => setId(x.id)}>
                <span>{x.label}</span><small>{latest(x)}</small>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="ex-main" aria-live="polite">
        <p className="ex-group-name">{it.group}</p>
        <h2>{it.label}</h2>
        <p className="ex-sentence">{sentence}</p>
        <LineChart key={it.id} values={it.values} xLabels={it.xLabels} band={it.band} cats={it.cats} fmt={fmt} sel={sel} onSel={setSel} bounds={it.id === 'twin' ? [0, 100] : null}
          axisFmt={(v) => { const r = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10; return String(r); }} unitLabel={it.cats ? '' : it.id === 'twin' ? 'of 100' : it.unit === '×' ? 'times' : it.unit}
          label={`${it.label}: ${it.values.map((v, k) => `${it.xLabels[k]} ${isMissingReportValue(v) ? 'Not measured' : it.cats ? it.cats[v] : fmt(v)}`).join(', ')}`} />
        <p className="fine">{it.id === 'twin' ? 'The shaded area is model uncertainty. ' : ''}Hover or tap the graph to see each {it.spot ? 'scan' : 'check-in'}.</p>
        {it.id === 'twin' && <Glance items={items} first={checkins[0]} last={checkins[checkins.length - 1]} onPick={(k) => { setId(k); window.scrollTo({ top: document.querySelector('.explore').getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); }} />}
      </div>
    </section>
  );
}

export default function Report({ go }) {
  const { user, checkins: allCheckins, scans: allScans } = useStore();
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [showRingHelp, setShowRingHelp] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const storyRef = useRef(null);
  useEffect(() => { const d = storyRef.current; if (!d) return; if (storyOpen && !d.open) d.showModal(); if (!storyOpen && d.open) d.close(); }, [storyOpen]);
  // Date range: the report covers check-ins from..to (indexes into the full list).
  const [range, setRange] = useState([0, Math.max(0, allCheckins.length - 1)]);
  useEffect(() => { setRange([0, Math.max(0, allCheckins.length - 1)]); }, [allCheckins.length]);
  const from = Math.min(range[0], allCheckins.length - 1), to = Math.min(Math.max(range[1], from), allCheckins.length - 1);
  const checkins = useMemo(() => allCheckins.slice(from, to + 1), [allCheckins, from, to]);
  const demoMode = user?.mode === 'demo' || isDemoCheckins(checkins);
  const measurementInputs = useMemo(
    () => demoMode ? checkins : personalMeasurementInputs(checkins),
    [checkins, demoMode],
  );
  const twinInputs = useMemo(() => checkinsForTwin(checkins, demoMode), [checkins, demoMode]);
  const displayCheckins = useMemo(() => checkins.map((c, i) => ({
    ...c,
    gait: measurementInputs[i].gait,
    balance: measurementInputs[i].balance,
    balanceClosed: measurementInputs[i].balanceClosed,
    tapping: measurementInputs[i].tapping,
  })), [checkins, measurementInputs]);
  const fullRange = from === 0 && to === allCheckins.length - 1;
  // Scans from two weeks before the first check-in in the range through the last one.
  const scans = useMemo(() => {
    if (!checkins.length) return allScans;
    const start = new Date(checkins[0].date + 'T12:00:00'); start.setDate(start.getDate() - 14);
    const s0 = start.toISOString().slice(0, 10), s1 = checkins[checkins.length - 1].date;
    return fullRange ? allScans : allScans.filter((x) => x.date >= s0 && x.date <= s1);
  }, [allScans, checkins, fullRange]);
  const twin = useMemo(() => FunctionTwin.run(twinInputs), [twinInputs]);
  const tracks = useMemo(() => Scans.lesionTracks(scans), [scans]);
  const groups = useMemo(() => Scans.groupOpinions(scans), [scans]);

  async function write() { setBusy(true); setOut(await writeReport(checkins, scans)); setBusy(false); }
  useEffect(() => { if (checkins.length) write(); }, [from, to, allCheckins.length, allScans.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checkins.length) return (
    <div className="wrap"><h1>Report for your care team</h1>
      <div className="card"><p>Do a check-in first, and your report will be ready.</p>
        <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn primary" onClick={() => go('checkin')}>Start a check-in</button></div></div></div>
  );

  const first = checkins[0], last = checkins[checkins.length - 1], step = twin[twin.length - 1];
  const personalFirst = twinInputs[0], personalLast = twinInputs[twinInputs.length - 1];
  const displayFirst = displayCheckins[0], displayLast = displayCheckins[displayCheckins.length - 1];
  const flags = Trends.compare(personalFirst, personalLast);
  const changed = new Set(flags.map((f) => f.id));
  const questions = [...(out?.questions || []), ...scans.flatMap((s) => s.opinion?.questions || [])].filter((q, k, a) => a.indexOf(q) === k);
  const twoReads = groups.filter((g) => g.length > 1);
  const scoreInputNote = reportInputDescription(twinInputs, demoMode);
  const headline = `${demoMode ? 'Fictional demo' : 'Experimental'} function score ${r0(step.score)} out of 100; 100 is the first check-in, and lower scores indicate more model-estimated change. ${scoreInputNote}`;
  const summarySourceLabel = out?.source === 'gemma'
    ? `Source: Gemma 4 (${out.model}).`
    : out?.source === 'template'
      ? 'Source: built-in template.'
      : 'Summary not generated yet.';

  const asText = () => [
    `Report for ${user.name}, ${fullRange ? `before cycle ${last.cycle + 1}` : `cycles ${first.cycle} to ${last.cycle}`} (${fmtDate(first.date)} to ${fmtDate(last.date)})`, '',
    `${headline} Model uncertainty range ${r0(step.scoreLow)} to ${r0(step.scoreHigh)}.`, '',
    ...(checkins.length === 1 ? ['Baseline recorded. Add another check-in to compare changes.', ''] : []),
    ...(demoMode
      ? ['Fictional demo data; simulated measurements are used only for the demo estimate.', '']
      : hasExcludedPhysicalMeasurements(checkins)
        ? ['Sample, simulated, and unverified physical measurements are excluded from personal estimates and change flags; symptom answers are retained.', '']
        : []),
    ...(out?.patient ? ['Summary', plain(out.patient), ''] : []),
    `Changes since cycle ${first.cycle} (cycle ${first.cycle} → cycle ${last.cycle})`, '',
    ...GROUPS.flatMap((g) => [g.name, ...g.rows.map((r) => `- ${r.label}: ${show(r.get(displayFirst), r.unit)} → ${show(r.get(displayLast), r.unit)}${changed.has(r.id) ? '  (changed)' : ''}`), '']),
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
        <section className="rep-panel rep-top" aria-label="Report summary">
        <header className="sheet-head">
          <div className="who">
            <p className="kicker-line">Report for your care team</p>
            <h1>{user.name}</h1>
            <p className="muted">{fullRange ? `Before cycle ${last.cycle + 1}. ` : ''}Check-ins {fmtDate(first.date)} to {fmtDate(last.date)}{fullRange ? '' : ` (cycles ${first.cycle} to ${last.cycle})`}{user.mode === 'demo' ? ', demo patient' : ''}.</p>
            <p className="fine">Experimental, unvalidated function estimate. The displayed range is model uncertainty, not a clinical confidence interval or a measured physical decline.</p>
            <p className="for-team">This is made for your oncologist. It shows your check-in symptoms, eligible recorded measurements, and scan findings. Sample or simulated measurements are identified separately. <b>You don’t need to read it yourself.</b> Copy it or show it at your next appointment.</p>
            {checkins.length === 1 && <p className="fine">Baseline recorded. Add another check-in to compare changes.</p>}
            {allCheckins.length > 1 && <div className="range no-print" role="group" aria-label="Date range">
              <label>From<select value={from} onChange={(e) => setRange([+e.target.value, Math.max(+e.target.value, to)])}>{allCheckins.map((c, k) => <option key={c.id} value={k}>C{c.cycle}, {fmtDate(c.date)}</option>)}</select></label>
              <label>To<select value={to} onChange={(e) => setRange([Math.min(from, +e.target.value), +e.target.value])}>{allCheckins.map((c, k) => <option key={c.id} value={k} disabled={k < from}>C{c.cycle}, {fmtDate(c.date)}</option>)}</select></label>
              {!fullRange && <button type="button" className="linkish" onClick={() => setRange([0, allCheckins.length - 1])}>Show everything</button>}
            </div>}
            <div className="sheet-actions no-print">
              <button type="button" className="btn primary small" onClick={copy}><Icon name="copy" size={16} /> Copy report text</button>
              {checkins.length > 1 && <button type="button" className="btn small" onClick={() => setStoryOpen(true)}><Icon name="timeline" size={16} /> Cycle by cycle</button>}
              {!HOSTED_PREVIEW && <button type="button" className="btn small" onClick={() => window.print()}><Icon name="printer" size={16} /> Print</button>}
            </div>
            {copied && <p className="fine" role="status">{copied}</p>}
          </div>
          <div className="ring-block">
            <Rings step={step} />
            <button type="button" className="linkish ring-help no-print" aria-expanded={showRingHelp} aria-controls="ring-help" onClick={() => setShowRingHelp(!showRingHelp)}>{showRingHelp ? 'Hide' : 'What do the rings mean?'}</button>
          </div>
        </header>

        {showRingHelp && <section className="score-explain" id="ring-help" aria-labelledby="se-h">
          <h2 id="se-h">How to read the rings</h2>
          <ul>
            <li><b>A full ring is your starting point.</b> It’s how your walking, balance, and hands were at cycle {first.cycle}, your first check-in.</li>
            <li><b>The ring opens up as things change.</b> Walking uses your pace, steadiness, and foot symptoms; balance uses standing still with eyes open and closed; hands use tapping, buttons, and hand symptoms.</li>
            <li><b>It isn’t a grade.</b> Some change during chemo is common. The rings help you see where it’s happening, so you know what to mention.</li>
            <li><b>It isn’t a diagnosis.</b> It doesn’t measure nerves directly or say why something changed. That’s for you and your care team.</li>
          </ul>
        </section>}
        </section>

        <section className="rep-panel rep-detail" aria-labelledby="detail-h">
        <div className="detail-head">
          <p className="opt-tag">Only if you want to</p>
          <h2 id="detail-h">Look through it yourself</h2>
          <p>This part is the detail your care team uses. Pick anything on the left to see it at every check-in. It’s fine to skip it.</p>
        </div>
        {demoMode
          ? <p className="notice rose" role="note">Fictional demo report. Simulated measurements are used only for the demo estimate.</p>
          : hasExcludedPhysicalMeasurements(checkins)
            ? <p className="notice rose" role="note">Sample, simulated, and unverified physical measurements are excluded from your personal estimate and change flags. Symptom answers are retained; excluded physical values appear as not measured in charts.</p>
            : null}
        {checkins.length > 1 ? <Explorer key={`${from}-${to}`} checkins={displayCheckins} twin={twin} tracks={tracks} /> : <p className="headline">Pick at least two check-ins to see how things changed.</p>}

        {questions.length > 0 && <section className="mgroup" aria-label="Questions">
          <h2>Questions for the next visit</h2>
          <ul className="checks">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </section>}

        <section className="print-summaries" aria-label="Generated report summaries">
          <h2>Report summaries</h2>
          {out ? <>
            <p className="fine">{summarySourceLabel}</p>
            <h3>Patient summary</h3>
            <p>{plain(out.patient)}</p>
            <h3>Function twin summary</h3>
            <p>{plain(out.twin)}</p>
            {out.scans && <><h3>Scan summary</h3><p>{plain(out.scans)}</p></>}
            <h3>Care-team summary</h3>
            <p className="print-pre">{plain(out.clinician)}</p>
          </> : <p>Summaries are not available yet. Printing does not generate AI content.</p>}
        </section>

        <details className="quiet summary-plain">
          <summary>Summary in plain words</summary>
          {busy && !out ? <p className="muted">Writing…</p> : out && <>
            <p>{plain(out.patient)}</p>
            <p className="fine">{summarySourceLabel} <button type="button" className="linkish no-print" disabled={busy} onClick={write}>{busy ? 'Rewriting…' : 'Rewrite'}</button></p>
          </>}
        </details>

        <details className="quiet summary-technical">
          <summary>Every number, for the oncology team</summary>
          <p className="fine">Function twin: an uncalibrated Kalman filter over phone measures and symptom ratings, not nerve-specific. Experimental function score per cycle (100 = first check-in; lower = more model-estimated change), with model uncertainty range: {twin.map((t) => `C${t.cycle} ${r0(t.score)} (${r0(t.scoreLow)}–${r0(t.scoreHigh)})`).join(', ')}. Changes are marked by fixed thresholds against the patient’s own first check-in. Unvalidated smartphone measures.</p>
          <div className="table-wrap"><table className="changes-table all">
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{checkins.map((c) => <th key={c.id} scope="col">C{c.cycle}</th>)}</tr></thead>
            <tbody>{GROUPS.flatMap((g) => g.rows).map((r) => <tr key={r.id}><th scope="row">{r.label}{r.unit ? <span className="u"> {r.unit}</span> : null}</th>{displayCheckins.map((c) => <td key={c.id}>{formatReportValue(r.get(c), r.unit)}</td>)}</tr>)}</tbody>
          </table></div>
        </details>
        <p className="fine foot">Phone measurements are approximate and measure function, not nerves directly. This is not a diagnosis.</p>
        </section>

        <dialog ref={storyRef} className="sheet story-sheet" aria-labelledby="st-h" onClose={() => setStoryOpen(false)} onClick={(e) => { if (e.target === storyRef.current) setStoryOpen(false); }}>
          {storyOpen && <>
            <div className="sheet-top"><h2 id="st-h">Your treatment, cycle by cycle</h2><button type="button" className="btn ghost small" onClick={() => setStoryOpen(false)}>Close</button></div>
            <p className="muted">What changed at each check-in compared with the one before it.</p>
            <Journey checkins={displayCheckins} />
          </>}
        </dialog>
      </article>
    </div>
  );
}
