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
      <section className="night-hero">
      <div className="wrap wide hero">
        <div>
          <h1>Two minutes on your phone before every infusion.</h1>
          <p className="lede">Some chemo drugs change how you walk, balance, and use your hands. A short check-in each cycle shows what’s shifting, next to what your scans say, so you have something concrete to bring to your oncologist.</p>
          <div className="actions">
            <button type="button" className="btn light" onClick={() => go('signup')}>Create an account</button>
            <button type="button" className="btn on-night" onClick={() => { startDemo(); go('home'); }}><Icon name="play" size={16} /> Try the demo patient</button>
          </div>
        </div>
        <figure className="hero-visual" style={{ margin: 0 }}>
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
      </section>

      <section className="wrap wide">
        <h2>A check-in, start to finish</h2>
        <p className="muted" style={{ marginTop: 0 }}>Under two minutes from start to finish.</p>
        <ol className="route">
          {CLOCK.map((st) => (
            <li key={st.title} style={{ flexGrow: st.s }}>
              <span className="stop" aria-hidden="true" />
              <span className="t">{st.at}</span>
              <h3>{st.title} <small>{st.s} s</small></h3>
              <p className="muted">{st.text}</p>
            </li>
          ))}
          <li className="done">
            <span className="stop" aria-hidden="true" />
            <span className="t">1:50</span>
            <h3>Done</h3>
            <p className="muted">Your twin updates and the report is ready to share.</p>
          </li>
        </ol>
      </section>

      <section className="wrap wide">
        <h2>What’s inside</h2>
        <div className="feature-list">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <FeatureArt kind={f.art} twin={twin} checkins={demo} />
              <div><h3>{f.title}</h3><p className="muted">{f.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap wide">
        <h2>Where it stops</h2>
        <div className="safety">
          <p>The phone measures how you walk, balance, and tap. Those can change from chemo side effects, and also from tiredness, anemia, pain, and plenty else. Only your care team can say why. This is a hackathon prototype, not a medical device, and it hasn’t been clinically validated.</p>
          <p className="fine">The tests follow a published smartphone study in people on chemotherapy (NeuroDetect, JMIR 2025). Explanations are written by Gemma 4, Google’s open AI model.</p>
        </div>
        <div className="actions"><button type="button" className="btn primary" onClick={() => go('signup')}>Create an account</button><button type="button" className="btn ghost" onClick={() => go('signin')}>I already have one</button></div>
      </section>
    </>
  );
}
