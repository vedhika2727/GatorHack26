import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import { BandChart } from '../components/Viz.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { useStore } from '../store.jsx';
import { fmtDate, greeting, today } from '../lib/format.js';

export default function Home({ go }) {
  const { user, checkins, scans } = useStore();
  const twin = useMemo(() => FunctionTwin.run(checkins), [checkins]);
  const last = checkins[checkins.length - 1];
  const step = twin[twin.length - 1];
  const flags = checkins.length > 1 ? Trends.compare(checkins[0], last) : [];
  const level = checkins.length > 1 ? (step.surprise === 'worse' ? 'notable' : Trends.overall(flags)) : null;
  const lastScan = scans[scans.length - 1];
  const doneToday = last?.date === today() && !last.demo;
  const groups = Scans.groupOpinions(scans);
  const opinionGroups = groups.filter((g) => g.length > 1).length;

  return (
    <div className="wrap">
      <div className="greet">
        <h1>{greeting()}, {user.name}</h1>
        <p className="muted">{checkins.length ? `${checkins.length} check-in${checkins.length > 1 ? 's' : ''} so far.` : 'Let’s set your baseline with a first check-in.'}</p>
      </div>

      <section className="next-card" aria-labelledby="next-title" style={{ marginTop: 18 }}>
        <div>
          <h2 id="next-title">{doneToday ? 'You’ve checked in today' : checkins.length ? 'Check in before your next infusion' : 'Do your first check-in'}</h2>
          <p>{doneToday ? 'Nice work. Your twin and report are up to date.' : 'About two minutes: three questions, a short walk, standing still, and a tap test.'}</p>
        </div>
        <button type="button" className="btn" onClick={() => go(doneToday ? 'twin' : 'checkin')}>
          {doneToday ? <>See my twin <Icon name="arrowRight" size={18} /></> : <>Start check-in <Icon name="arrowRight" size={18} /></>}
        </button>
      </section>

      {checkins.length > 0 && (
        <section className="card" style={{ marginTop: 14 }} aria-labelledby="twin-sum">
          <div className="score-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2 id="twin-sum" style={{ margin: 0, fontSize: '1.2rem' }}>Your function twin</h2>
              <div className="score-row"><span className="score">{Math.round(step.mean)}</span><span className="muted">/100 change since your first check-in</span></div>
            </div>
            {level && <Chip level={level} />}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            {checkins.length === 1 ? 'Your baseline is set. Your twin starts learning at your next check-in.'
              : `Likely between ${Math.round(step.low)} and ${Math.round(step.high)} at cycle ${last.cycle}.${step.surprise === 'worse' ? ' This check-in was worse than your twin expected.' : ''}`}
          </p>
          {checkins.length > 1 && <BandChart steps={twin} selected={twin.length - 1} />}
          <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn" onClick={() => go('twin')}>Open my twin <Icon name="arrowRight" size={18} /></button></div>
        </section>
      )}

      <h2>Quick actions</h2>
      <div className="quick">
        <button type="button" onClick={() => go('checkin')}><span className="ic navy" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name="pulse" /></span><b>New check-in</b><small>Two minutes</small></button>
        <button type="button" onClick={() => go('twin')}><span className="ic forest" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name="timeline" /></span><b>My twin</b><small>{checkins.length ? `Cycle ${last.cycle}` : 'No check-ins yet'}</small></button>
        <button type="button" onClick={() => go('scans')}><span className="ic rose" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name="scan" /></span><b>Scan reports</b><small>{scans.length ? `${scans.length} saved` : 'Add your first'}</small></button>
        <button type="button" onClick={() => go('report')}><span className="ic navy" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name="report" /></span><b>Care-team report</b><small>Share before a visit</small></button>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <section className="card">
          <h3>What changed</h3>
          {checkins.length < 2 ? <p className="muted">Changes appear after your second check-in.</p>
            : flags.length ? <><p className="muted">{flags.length} change{flags.length > 1 ? 's' : ''} since your first check-in, including:</p><p>{flags[0].text}</p></>
            : <p className="muted">Nothing has changed beyond normal day-to-day variation.</p>}
          {checkins.length > 1 && <button type="button" className="linkish" onClick={() => go('twin')}>See every change</button>}
        </section>
        <section className="card">
          <h3>Latest scan</h3>
          {lastScan ? <>
            <p className="muted">{lastScan.kind}, {fmtDate(lastScan.date)}, read by {lastScan.reader}</p>
            <p>{lastScan.extracted.plain || lastScan.extracted.impression}</p>
            {opinionGroups > 0 && <p><Chip level="watch">Second opinion on file</Chip></p>}
          </> : <p className="muted">Add a radiology report to see your tumor measurements next to your check-ins.</p>}
          <button type="button" className="linkish" onClick={() => go('scans')}>{lastScan ? 'View scan reports' : 'Add a scan report'}</button>
        </section>
      </div>
    </div>
  );
}
