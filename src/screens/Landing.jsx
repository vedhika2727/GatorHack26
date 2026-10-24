import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { BandChart } from '../components/Viz.jsx';
import Chip from '../components/Chip.jsx';
import { buildDemoCheckins } from '../core/demo.js';
import FunctionTwin from '../core/twin.js';
import { useStore } from '../store.jsx';

const FEATURES = [
  { icon: 'pulse', tone: 'navy', title: 'A twin of your function', text: 'Combines your walking, balance, hand, and symptom signals into one estimate of how much things have changed since you started, with an honest range.' },
  { icon: 'walk', tone: 'forest', title: 'Your walk, replayed', text: 'A walking figure replays your real step rhythm, so you can see your first check-in next to today.' },
  { icon: 'scan', tone: 'rose', title: 'Scan reports in plain words', text: 'Paste or photograph a radiology report. Every measurement is checked against the report text before it’s shown.' },
  { icon: 'doctors', tone: 'rose', title: 'Two doctors, one scan', text: 'Got a second opinion? See where the two reports agree and differ, and what to ask about it.' },
  { icon: 'report', tone: 'navy', title: 'A report for your care team', text: 'One page with what changed, your twin’s estimate, your scans, and questions for your next visit.' },
  { icon: 'shield', tone: 'forest', title: 'Careful by design', text: 'It never diagnoses or suggests treatment changes. It helps you and your oncologist have a better-informed conversation.' },
];

export default function Landing({ go }) {
  const { startDemo } = useStore();
  const twin = useMemo(() => FunctionTwin.run(buildDemoCheckins()), []);
  const last = twin[twin.length - 1];
  return (
    <>
      <section className="wrap wide hero">
        <div>
          <span className="kicker"><Icon name="heart" size={18} /> For people on chemotherapy</span>
          <h1>Notice changes between chemo infusions</h1>
          <p className="lede">Some chemotherapy drugs affect the nerves in the feet and hands, which can change how you walk, balance, and use your hands. A two-minute check-in on your phone before each infusion helps you and your care team spot changes early, next to how your scans are responding.</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => go('signup')}>Create your account <Icon name="arrowRight" size={18} /></button>
            <button type="button" className="btn" onClick={() => go('signin')}>Sign in</button>
            <button type="button" className="btn ghost" onClick={() => { startDemo(); go('home'); }}><Icon name="play" size={16} /> Try a demo patient</button>
          </div>
        </div>
        <figure className="hero-visual" style={{ margin: 0 }}>
          <div className="score-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="fine">Demo patient, cycle 6</div>
              <div className="score-row"><span className="score">{Math.round(last.mean)}</span><span className="muted">/100 change in function</span></div>
            </div>
            <Chip level="notable" />
          </div>
          <BandChart steps={twin} selected={twin.length - 1} />
          <figcaption className="fine">The twin’s estimate across six chemo cycles. The red point was worse than the twin expected.</figcaption>
        </figure>
      </section>

      <section className="wrap wide">
        <h2>How a check-in works</h2>
        <div className="steps">
          <div className="step-card"><div className="n">1</div><h3>Answer three questions</h3><p className="muted">Rate numbness, tingling, and pain in your feet and hands, and tell us about any falls.</p></div>
          <div className="step-card"><div className="n">2</div><h3>Walk and stand still</h3><p className="muted">Walk for 30 seconds with your phone in your pocket, then stand still for 20. Your phone’s motion sensor does the measuring.</p></div>
          <div className="step-card"><div className="n">3</div><h3>Tap with each hand</h3><p className="muted">Tap two circles back and forth for 10 seconds per hand. Then see your twin and share the report.</p></div>
        </div>
      </section>

      <section className="wrap wide">
        <h2>What you get</h2>
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
        <h2>What it does and doesn’t do</h2>
        <div className="safety">
          <p>Your phone measures <strong>function</strong>: how you walk, balance, and tap. Those can change because of nerve side effects from chemotherapy, but also because of tiredness, anemia, pain, or other causes. Only your care team can tell what a change means. This is a prototype built for a hackathon, it isn’t a medical device, and it hasn’t been clinically validated.</p>
          <p className="fine">The tests follow a published smartphone study in people on chemotherapy (NeuroDetect, JMIR 2025). Explanations are written by Gemma 4, Google’s open AI model.</p>
        </div>
        <div className="actions"><button type="button" className="btn primary" onClick={() => go('signup')}>Get started <Icon name="arrowRight" size={18} /></button></div>
      </section>
    </>
  );
}
