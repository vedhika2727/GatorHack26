import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { BandChart } from '../components/Viz.jsx';
import Chip from '../components/Chip.jsx';
import FeatureArt from '../components/FeatureArt.jsx';
import { buildDemoCheckins } from '../core/demo.js';
import FunctionTwin from '../core/twin.js';
import { useStore } from '../store.jsx';

const FEATURES = [
  { art: 'twin', title: 'Function twin', text: 'Walking, balance, tapping, and your own symptom ratings, combined into one number with a range around it.' },
  { art: 'walk', title: 'Your walk, replayed', text: 'Footprints in the real timing of your steps. Cycle 1 on top, today underneath.' },
  { art: 'spots', title: 'Scan reports, spot by spot', text: 'Paste or photograph a radiology report. A size only appears if it’s written in the report.' },
  { art: 'opinions', title: 'Second opinions, lined up', text: 'Two radiologists read the same CT? See each spot side by side and where they disagree.' },
  { art: 'page', title: 'One page for your oncologist', text: 'What changed, your scans, and the questions you want to ask, ready to print or send.' },
  { art: 'limits', title: 'No diagnosis, no treatment advice', text: 'It shows what changed. What it means is for you and your care team to decide.' },
];

const CLOCK = [
  { at: '0:00', s: 20, title: 'Three questions', text: 'Numbness, tingling, and pain in your feet and hands, 0 to 10. Any falls.' },
  { at: '0:20', s: 30, title: 'Walk', text: 'Phone in your pocket. Walk the way you normally do.' },
  { at: '0:50', s: 40, title: 'Stand still', text: '20 seconds with eyes open, then 20 with eyes closed.' },
  { at: '1:30', s: 20, title: 'Tap, each hand', text: 'Two circles, back and forth, 10 seconds a hand.' },
];

export default function Landing({ go }) {
  const { startDemo } = useStore();
  const demo = useMemo(() => buildDemoCheckins(), []);
  const twin = useMemo(() => FunctionTwin.run(demo), [demo]);
  const last = twin[twin.length - 1];
  return (
    <>
      <section className="sky-hero" aria-labelledby="sky-h">
        <div className="sky" aria-hidden="true">
          <span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" /><span className="cloud c4" />
          <span className="meadow" />
        </div>
        <div className="wrap wide sky-inner">
          <p className="mono sky-tr">Know what’s changing.<br />Understand what it means.</p>
          <div className="sky-grid">
            <div>
              <p className="mono sky-ml">Steadi, for people<br />on chemotherapy</p>
              <h1 id="sky-h">Two minutes on your phone before every infusion.</h1>
              <p className="sky-lede">Some chemo drugs change how you walk, balance, and use your hands. A short check-in each cycle shows what’s shifting, next to what your scans say, so you have something concrete to bring to your oncologist.</p>
              <div className="actions">
                <button type="button" className="btn sky-btn" onClick={() => go('signup')}>Create an account</button>
                <button type="button" className="btn sky-ghost" onClick={() => { startDemo(); go('home'); }}><Icon name="play" size={16} /> Try the demo patient</button>
              </div>
            </div>
            <figure className="hero-visual sky-card" style={{ margin: 0 }}>
              <div className="score-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="fine">Demo patient, cycle 6</div>
                  <div className="score-row"><span className="score">{Math.round(last.score)}</span><span className="muted">of 100, function score</span></div>
                </div>
                <Chip level="notable" />
              </div>
              <BandChart steps={twin} selected={twin.length - 1} />
              <figcaption className="fine">Six cycles of a demo patient. 100 is how they were at their first check-in.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <div className="wrap wide land-ed">
        <ul className="ed-stats" aria-label="At a glance">
          <li><span className="mono">[01]</span><b>2 min</b><small>per check-in, before each infusion</small></li>
          <li><span className="mono">[02]</span><b>4</b><small>quick tests: questions, walk, balance, tapping</small></li>
          <li><span className="mono">[03]</span><b>100%</b><small>of scan sizes checked against the report’s own words</small></li>
          <li><span className="mono">[04]</span><b>1 page</b><small>for your oncologist, ready to share</small></li>
        </ul>

        <section className="land-sec" aria-labelledby="ls1">
          <div className="land-head"><div><p className="mono">01 / Under two minutes</p><h2 id="ls1">A check-in, start to finish</h2></div><p>Your phone guides you through each part out loud. Skip anything that doesn’t feel safe.</p></div>
          <ol className="land-route">
            {CLOCK.map((st) => (
              <li key={st.title} style={{ flexGrow: st.s }}>
                <p className="mono">{st.at} · {st.s} s</p>
                <span className="bar" aria-hidden="true" />
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="land-sec" aria-labelledby="ls2">
          <div className="land-head"><div><p className="mono">02 / Six tools, one app</p><h2 id="ls2">What’s inside</h2></div><p>Everything is measured against your own first check-in, not against other people.</p></div>
          <div className="land-grid">
            {FEATURES.map((f, i) => (
              <div className="land-cell" key={f.title}>
                <p className="mono">0{i + 1}</p>
                <FeatureArt kind={f.art} twin={twin} checkins={demo} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="land-sec" aria-labelledby="ls3">
          <div className="land-head"><div><p className="mono">03 / Honest about limits</p><h2 id="ls3">Where it stops</h2></div><p /></div>
          <div className="land-limits">
            <p>The phone measures how you walk, balance, and tap. Those can change from chemo side effects, and also from tiredness, anemia, pain, and plenty else. Only your care team can say why.</p>
            <p className="fine">This is a hackathon prototype, not a medical device, and it hasn’t been clinically validated. The tests follow a published smartphone study in people on chemotherapy (NeuroDetect, JMIR 2025). Explanations are written by Gemma 4, Google’s open AI model.</p>
          </div>
        </section>
      </div>
      <section className="sky-hero sky-end" aria-labelledby="end-h">
        <div className="sky" aria-hidden="true">
          <span className="cloud c1" /><span className="cloud c3" />
          <span className="meadow" />
        </div>
        <div className="wrap wide sky-inner">
          <p className="mono sky-ml">Know what’s changing. Understand what it means.</p>
          <h2 id="end-h">Bring something concrete to your next appointment.</h2>
          <div className="actions">
            <button type="button" className="btn sky-btn" onClick={() => go('signup')}>Create an account</button>
            <button type="button" className="btn sky-ghost" onClick={() => { startDemo(); go('home'); }}><Icon name="play" size={16} /> Try the demo patient</button>
          </div>
        </div>
      </section>
    </>
  );
}
