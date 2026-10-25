import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { BandChart } from '../components/Viz.jsx';
import Chip from '../components/Chip.jsx';
import { buildDemoCheckins } from '../core/demo.js';
import FunctionTwin from '../core/twin.js';
import { useStore } from '../store.jsx';

const FEATURES = [
  { icon: 'pulse', tone: 'navy', title: 'Function twin', text: 'Walking, balance, tapping, and your own symptom ratings, combined into one number with a range around it.' },
  { icon: 'walk', tone: 'forest', title: 'Your walk, replayed', text: 'Footprints in the real timing of your steps. Cycle 1 on top, today underneath.' },
  { icon: 'scan', tone: 'rose', title: 'Scan reports, spot by spot', text: 'Paste or photograph a radiology report. A size only appears if it’s written in the report.' },
  { icon: 'doctors', tone: 'rose', title: 'Second opinions, lined up', text: 'Two radiologists read the same CT? See each spot side by side and where they disagree.' },
  { icon: 'report', tone: 'navy', title: 'One page for your oncologist', text: 'What changed, your scans, and the questions you want to ask, ready to print or send.' },
  { icon: 'shield', tone: 'forest', title: 'No diagnosis, no treatment advice', text: 'It shows what changed. What it means is for you and your care team to decide.' },
];

export default function Landing({ go }) {
  const { startDemo } = useStore();
  const twin = useMemo(() => FunctionTwin.run(buildDemoCheckins()), []);
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
              <div className="score-row"><span className="score">{Math.round(last.mean)}</span><span className="muted">of 100, change in function</span></div>
            </div>
            <Chip level="notable" />
          </div>
          <BandChart steps={twin} selected={twin.length - 1} />
          <figcaption className="fine">Six cycles of a demo patient. At the red point, the check-in came in worse than the twin expected.</figcaption>
        </figure>
      </div>
      </section>

      <section className="wrap wide">
        <h2>A check-in, start to finish</h2>
        <div className="steps">
          <div className="step-card"><div className="n">1</div><h3>Answer three questions</h3><p className="muted">Numbness, tingling, and pain in your feet and hands, rated 0 to 10. Plus any falls or near-falls.</p></div>
          <div className="step-card"><div className="n">2</div><h3>Walk and stand still</h3><p className="muted">30 seconds of walking with the phone in your pocket, then standing still with eyes open and closed.</p></div>
          <div className="step-card"><div className="n">3</div><h3>Tap with each hand</h3><p className="muted">Ten seconds per hand, tapping two circles back and forth as fast as you can.</p></div>
        </div>
      </section>

      <section className="wrap wide">
        <h2>What’s inside</h2>
        <div className="feature-list">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <span className={`ic ${f.tone}`}><Icon name={f.icon} /></span>
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
