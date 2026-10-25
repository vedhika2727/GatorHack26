import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { BandChart } from '../components/Viz.jsx';
import FunctionTwin from '../core/twin.js';
import Trends from '../core/trends.js';
import Scans from '../core/scans.js';
import { useStore } from '../store.jsx';
import { fmtDate, today } from '../lib/format.js';

/*
 * Layout: a dark band joined to the header holds the twin's number and chart (the one thing that
 * matters on this screen), then a three-column ledger: what changed, scans, the care-team report.
 */
const STATUS = {
  notable: 'Worse than your twin expected. Worth telling your care team before the next infusion.',
  watch: 'Some changes since your first check-in. Worth mentioning at your next visit.',
  steady: 'Holding steady since your first check-in.',
};

export default function Home({ go }) {
  const { user, checkins, scans } = useStore();
  const twin = useMemo(() => FunctionTwin.run(checkins), [checkins]);
  const tracks = useMemo(() => Scans.lesionTracks(scans), [scans]);
  const first = checkins[0], last = checkins[checkins.length - 1], step = twin[twin.length - 1];
  const flags = checkins.length > 1 ? Trends.compare(first, last) : [];
  const level = checkins.length > 1 ? (step.surprise === 'worse' ? 'notable' : Trends.overall(flags)) : null;
  const doneToday = last?.date === today() && !last.demo;
  const groups = Scans.groupOpinions(scans);
  const lastGroup = groups[groups.length - 1];

  return (
    <>
      <section className="home-band" aria-labelledby="home-h">
        <div className="wrap wide">
          <p className="who">{user.name}{checkins.length ? `, ${checkins.length} check-in${checkins.length > 1 ? 's' : ''} since ${fmtDate(first.date)}` : ''}</p>
          {!checkins.length ? (
            <div className="home-empty">
              <h1 id="home-h">Your first check-in sets the baseline.</h1>
              <p>Under two minutes: three questions, a short walk, standing still, and tapping. Every check-in after this is compared with it.</p>
              <button type="button" className="btn light" onClick={() => go('checkin')}>Start my first check-in</button>
            </div>
          ) : (
            <div className="home-grid">
              <div>
                <h1 id="home-h" className="sr-only">Your function twin</h1>
                <div className="big-num"><span className="n">{Math.round(step.mean)}</span><span className="of">of 100</span></div>
                <p className="what">Change in walking, balance, and hand function since cycle {first.cycle}{checkins.length > 1 ? `, likely between ${Math.round(step.low)} and ${Math.round(step.high)}.` : '.'}</p>
                {checkins.length === 1 ? <p className="status">Baseline set. Your twin starts learning at the next check-in.</p>
                  : <p className={`status ${level}`}>{STATUS[level]}</p>}
                <div className="actions">
                  <button type="button" className="btn light" onClick={() => go(doneToday ? 'twin' : 'checkin')}>{doneToday ? 'See today’s result' : `Check in for cycle ${last.cycle + 1}`}</button>
                  <button type="button" className="btn on-night" onClick={() => go('twin')}>Open my twin</button>
                </div>
              </div>
              {checkins.length > 1 && <div className="home-chart"><BandChart steps={twin} selected={twin.length - 1} /></div>}
            </div>
          )}
        </div>
      </section>

      <div className="wrap wide ledger">
        <section aria-labelledby="l-changed">
          <h2 id="l-changed">What changed</h2>
          {checkins.length < 2 ? <p className="muted">Shows up after your second check-in.</p> : flags.length ? <>
            <ul className="changes">{flags.slice(0, 3).map((f) => <li key={f.id} className={f.level}>{f.text}</li>)}</ul>
            {flags.length > 3 && <button type="button" className="linkish" onClick={() => go('twin')}>{flags.length - 3} more on your twin page</button>}
          </> : <p className="muted">Nothing beyond normal day-to-day variation.</p>}
        </section>

        <section aria-labelledby="l-scans">
          <h2 id="l-scans">Scans</h2>
          {lastGroup ? <>
            <p className="muted">{lastGroup[0].kind} on {fmtDate(lastGroup[0].date)}{lastGroup.length > 1 ? `, read by ${lastGroup.length} radiologists` : ''}</p>
            <ul className="mini-spots">{tracks.tracks.slice(0, 3).map((t) => (
              <li key={t.location}><span>{t.location}</span><b>{t.changePct == null ? `${t.last} mm` : `${t.first} → ${t.last} mm`}</b></li>
            ))}</ul>
            <button type="button" className="linkish" onClick={() => go('scans')}>All scans</button>
          </> : <>
            <p className="muted">Add a radiology report to follow each measured spot next to your check-ins.</p>
            <button type="button" className="linkish" onClick={() => go('scans')}>Add a report</button>
          </>}
        </section>

        <section aria-labelledby="l-report">
          <h2 id="l-report">For your oncologist</h2>
          <p className="muted">One page with what changed, your scans, and your questions. Print it or send it before a visit.</p>
          <button type="button" className="btn" onClick={() => go('report')}><Icon name="report" size={18} /> Make the report</button>
        </section>
      </div>
    </>
  );
}
