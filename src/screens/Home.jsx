import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import { BandChart } from '../components/Viz.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { checkinsForTwin, hasExcludedPhysicalMeasurements } from '../core/checkinSource.js';
import { useStore } from '../store.jsx';
import { fmtDate, greeting, today } from '../lib/format.js';

export default function Home({ go }) {
  const { user, checkins, scans } = useStore();
  const twinInputs = useMemo(
    () => checkinsForTwin(checkins, user?.mode === 'demo'),
    [checkins, user?.mode],
  );
  const twin = useMemo(() => FunctionTwin.run(twinInputs), [twinInputs]);
  const last = checkins[checkins.length - 1];
  const step = twin[twin.length - 1];
  const flags = checkins.length > 1 ? Trends.compare(twinInputs[0], twinInputs[twinInputs.length - 1]) : [];
  const level = flags.length ? Trends.overall(flags) : null;
  const lastScan = scans[scans.length - 1];
  const doneToday = last?.date === today() && !last.demo;
  const groups = Scans.groupOpinions(scans);
  const opinionGroups = groups.filter((g) => g.length > 1).length;

  const sinceLast = twinInputs.length > 1 ? Trends.compare(twinInputs[twinInputs.length - 2], twinInputs[twinInputs.length - 1]) : [];
  const stats = [
    { n: checkins.length, k: checkins.length === 1 ? 'check-in so far' : 'check-ins so far' },
    { n: last ? `C${last.cycle + (doneToday ? 1 : 1)}` : 'C1', k: doneToday ? 'next check-in' : 'check-in due before this infusion' },
    { n: scans.length, k: scans.length === 1 ? 'scan report added' : 'scan reports added' },
    { n: opinionGroups, k: opinionGroups === 1 ? 'scan with a second opinion' : 'scans with a second opinion' },
  ];
  const LINKS = [
    { to: 'checkin', t: 'Check in', d: 'Three questions, a walk, standing still, and a tap test.' },
    { to: 'twin', t: 'My twin', d: checkins.length ? `Every check-in through cycle ${last.cycle}.` : 'Starts after your first check-in.' },
    { to: 'scans', t: 'Scans', d: scans.length ? 'Every measured spot, scan after scan.' : 'Add a radiology report.' },
    { to: 'report', t: 'Report', d: 'One page for your oncologist.' },
  ];

  return (
    <div className="wrap wide home-ed">
      <section className="ed-hero" aria-labelledby="greet-h">
        <div>
          <p className="mono ed-kicker">{fmtDate(today())}{last ? ` · cycle ${last.cycle} done` : ''}</p>
          <h1 id="greet-h">{greeting()},<br />{user.name}.</h1>
        </div>
        <div className="ed-next">
          <p className="mono ed-kicker">{doneToday ? 'Today' : 'Before your next infusion'}</p>
          <p className="ed-next-t">{doneToday ? 'You’ve checked in today. Your twin and report are up to date.' : checkins.length ? 'A two-minute check-in: three questions, a short walk, standing still, and a tap test.' : 'Set your starting point with a first two-minute check-in.'}</p>
          <button type="button" className="btn primary" onClick={() => go(doneToday ? 'twin' : 'checkin')}>
            {doneToday ? 'See my twin' : checkins.length ? 'Start check-in' : 'Do your first check-in'} <Icon name="arrowRight" size={18} />
          </button>
        </div>
      </section>

      <ul className="ed-stats" aria-label="At a glance">
        {stats.map((x, i) => <li key={i}><span className="mono">[0{i + 1}]</span><b>{x.n}</b><small>{x.k}</small></li>)}
      </ul>

      {checkins.length > 0 && (
        <section className="ed-twin" aria-labelledby="twin-sum">
          <div className="ed-twin-chart">
            <div className="ed-twin-head">
              <div>
                <p className="mono ed-kicker">Your function twin</p>
                <h2 id="twin-sum">{checkins.length === 1 ? 'Your starting point is set.' : `${Math.round(step.score)} of 100 at cycle ${last.cycle}`}</h2>
              </div>
              {level && <Chip level={level} />}
            </div>
            <p className="muted">{checkins.length === 1 ? 'Your twin starts learning at your next check-in.' : `100 is how you were at your first check-in. Likely between ${Math.round(step.scoreLow)} and ${Math.round(step.scoreHigh)}.`}</p>
            {checkins.length > 1 && <BandChart steps={twin} selected={twin.length - 1} />}
          </div>
          <aside className="ed-side">
            <p className="mono ed-kicker">Since last time</p>
            {checkins.length < 2 ? <p className="muted">Changes appear after your second check-in.</p>
              : sinceLast.length ? <ul className="ed-notes">{sinceLast.slice(0, 4).map((f) => <li key={f.id}>{f.text.replace(/ than at baseline/, ' than last time').replace(/\(baseline:? /, '(last time ')}</li>)}</ul>
              : <p>No reported symptom or eligible recorded measurement change crossed the comparison thresholds.</p>}
            {step.surprise !== 'none' && <p className="fine">{FunctionTwin.interpretation(step, flags.length > 0)}</p>}
            <p className="fine">Experimental, unvalidated estimate; its range is model uncertainty, not a clinical confidence interval.</p>
            {user?.mode === 'demo'
              ? <p className="fine">This is a fictional demo estimate using simulated measurements.</p>
              : hasExcludedPhysicalMeasurements(checkins)
                ? <p className="fine">Sample or unverified physical measurements are excluded from this personal estimate.</p>
                : null}
            <p className="mono ed-kicker" style={{ marginTop: 22 }}>Latest scan</p>
            {lastScan ? <>
              <p className="ed-scan"><b>{lastScan.kind}, {fmtDate(lastScan.date)}</b><span>{lastScan.extracted.plain || lastScan.extracted.impression}</span></p>
              {opinionGroups > 0 && <p className="fine">Second opinion on file.</p>}
            </> : <p className="muted">Add a radiology report to see measurements next to your check-ins.</p>}
            <button type="button" className="linkish" onClick={() => go('twin')}>Open my twin</button>
          </aside>
        </section>
      )}

      <nav className="ed-links" aria-label="Go to">
        {LINKS.map((l, i) => (
          <button key={l.to} type="button" onClick={() => go(l.to)}>
            <span className="mono">0{i + 1}</span>
            <b>{l.t} <Icon name="arrowRight" size={18} /></b>
            <small>{l.d}</small>
          </button>
        ))}
      </nav>

    </div>
  );
}
