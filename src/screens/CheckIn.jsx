import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Gait from '../core/gait.js';
import Trends from '../core/trends.js';
import { useStore, HOSTED_PREVIEW } from '../store.jsx';
import { requestMotion, record, speak, buzz } from '../lib/sensors.js';
import { today } from '../lib/format.js';

const WALK_S = 30, BAL_S = 20, TAP_S = 10;
const STEP_NAMES = ['Symptoms', 'Walk', 'Balance', 'Hands', 'Done'];

const WORD = (v) => (v === 0 ? 'None' : v <= 3 ? 'Mild' : v <= 6 ? 'Moderate' : 'Severe');
function Scale({ id, label, value, onChange }) {
  return (
    <fieldset className="nrs">
      <legend className="sr-only">{label}</legend>
      <div className="nrs-row" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, i) => (
          <button key={i} id={`${id}-${i}`} type="button" role="radio" aria-checked={value === i} aria-pressed={value === i} aria-label={`${i} out of 10, ${WORD(i)}`} onClick={() => onChange(i)}>{i}</button>
        ))}
      </div>
      <div className="nrs-bands" aria-hidden="true"><span style={{ flex: 1 }}>None</span><span style={{ flex: 3 }}>Mild</span><span style={{ flex: 3 }}>Moderate</span><span style={{ flex: 4 }}>Severe</span></div>
      <p className="nrs-val" aria-live="polite">Selected: <b>{value}</b> ({WORD(value)})</p>
    </fieldset>
  );
}
function Options({ label, options, value, onChange }) {
  return (
    <div className="opts" role="radiogroup" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}><span className="rb" aria-hidden="true" />{t}</button>
      ))}
    </div>
  );
}

function Choice({ pressed, onClick, children }) {
  return <button type="button" className="choice" aria-pressed={pressed} onClick={onClick}><span className="box">{pressed && <Icon name="check" size={14} stroke={3} />}</span>{children}</button>;
}

function Ring({ remaining, progress }) {
  const C = 326.7;
  return (
    <div className="ring" aria-live="polite"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className="bg" /><circle cx="60" cy="60" r="52" className="fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - progress) }} /></svg><span className="t">{remaining}</span></div>
  );
}

function Instructions({ items }) {
  return <ul className="instructions">{items.map(([icon, tone, text]) => <li key={text}><span className={`ic ${tone}`}><Icon name={icon} size={18} /></span><span>{text}</span></li>)}</ul>;
}

function PreviewNote() {
  if (!HOSTED_PREVIEW) return null;
  return <p className="notice rose">This hosted preview can’t use your phone’s motion sensors, so choose “Use a sample instead” on this step. The tap test works for real. The full app records real walks and balance tests.</p>;
}

/** Runs a motion recording with a countdown ring. */
function useRecorder(seconds) {
  const [state, setState] = useState({ busy: false, remaining: seconds, progress: 0, msg: '', error: '' });
  async function run(startWord, during, analyzeFn) {
    setState({ busy: true, remaining: 5, progress: 0, msg: 'Put your phone in your pocket. Starting in 5…', error: '' });
    try {
      await requestMotion();
      const samples = await record({ seconds, startWord, onTick: ({ phase, remaining, progress }) => setState((s) => ({ ...s, remaining, progress, msg: phase === 'leadin' ? `Put your phone in your pocket. Starting in ${remaining}…` : during })) });
      const r = analyzeFn(samples);
      if (!r.ok) { setState({ busy: false, remaining: seconds, progress: 0, msg: '', error: r.reason + ' Tap start to try again.' }); return null; }
      setState({ busy: false, remaining: 0, progress: 1, msg: 'Done.', error: '' });
      return r;
    } catch (e) { setState({ busy: false, remaining: seconds, progress: 0, msg: '', error: e.message }); return null; }
  }
  return [state, run];
}

export default function CheckIn({ go }) {
  const { checkins, addCheckin, user } = useStore();
  const real = checkins.filter((c) => !c.demo);
  const lastCycle = (user.mode === 'demo' ? checkins : real).slice(-1)[0]?.cycle || 0;
  const [step, setStep] = useState(1);
  const [q, setQ] = useState(0);
  const [d, setD] = useState({ cycle: lastCycle + 1, date: today(), symptoms: { feetNumb: 0, handsNumb: 0, feetPain: 0 }, buttons: false, falls: 'none', source: 'sensor' });
  const [saved, setSaved] = useState(null);
  const [saveErr, setSaveErr] = useState('');
  const [walkRec, runWalk] = useRecorder(WALK_S);
  const [balRec, runBal] = useRecorder(BAL_S);
  const [closedRec, runClosed] = useRecorder(BAL_S);
  const [showClosed, setShowClosed] = useState(false);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const sym = (k, v) => setD((x) => ({ ...x, symptoms: { ...x.symptoms, [k]: v } }));
  const goStep = (n) => { setStep(n); window.scrollTo(0, 0); };

  // ---- tapping ----
  const tap = useRef({ hand: 'right', taps: [], start: 0, target: 0, timer: 0, results: {}, done: false });
  const [tapUi, setTapUi] = useState({ hand: 'right', remaining: TAP_S, target: 0, msg: 'Rest your phone on a table. Start whenever you’re ready.', error: '' });
  useEffect(() => () => clearInterval(tap.current.timer), []);
  function endHand() {
    const t = tap.current; clearInterval(t.timer);
    const r = Gait.analyzeTapping(t.taps, TAP_S);
    if (!r.ok) { t.taps = []; t.start = 0; setTapUi((u) => ({ ...u, remaining: TAP_S, error: r.reason })); return; }
    t.results[t.hand] = r;
    if (t.hand === 'right') {
      t.hand = 'left'; t.taps = []; t.start = 0; t.target = 0; buzz(150);
      setTapUi({ hand: 'left', remaining: TAP_S, target: 0, msg: `Right hand: ${r.rate} taps per second. Start the left hand whenever you’re ready.`, error: '' });
    } else { t.done = true; buzz([150, 80, 150]); finish({ tapping: t.results }); }
  }
  function onTap(which) {
    const t = tap.current; if (t.done) return;
    const now = performance.now();
    if (!t.start) {
      t.start = now;
      t.timer = setInterval(() => {
        const left = TAP_S - (performance.now() - t.start) / 1000;
        setTapUi((u) => ({ ...u, remaining: Math.max(0, Math.ceil(left)) }));
        if (left <= 0) endHand();
      }, 100);
    }
    const hit = which === t.target;
    t.taps.push({ t: now - t.start, hit, target: t.target });
    if (hit) { t.target = 1 - t.target; setTapUi((u) => ({ ...u, target: t.target, error: '' })); }
  }

  async function finish(extra) {
    const c = { ...d, ...extra, id: 'c' + Date.now() };
    if (user.mode === 'demo') c.demo = true;
    setSaveErr('');
    try { await addCheckin(c); setSaved(c); goStep(5); }
    catch (e) { setSaveErr(e.message); }
  }

  const all = saved ? [...checkins] : checkins;
  const flags = saved && all.length > 1 ? Trends.compare(all[0], saved) : [];

  return (
    <div className={step === 1 ? 'wrap wide ci-form' : step < 5 ? 'wrap wide ci-tests' : 'wrap'}>
      <div className="wizard-head">
        <button type="button" className="btn ghost small" onClick={() => (step === 1 && q > 0 ? setQ(q - 1) : step > 1 && step < 5 ? (step === 2 && setQ(4), goStep(step - 1)) : go('home'))}><Icon name="arrowLeft" size={18} /> {(step === 1 && q > 0) || (step > 1 && step < 5) ? 'Back' : 'Home'}</button>
        <span className="step-label">Step {step} of 5: {STEP_NAMES[step - 1]}</span>
      </div>
      <div className="progress" aria-hidden="true">{STEP_NAMES.map((n, i) => <span key={n} className={i < step ? 'on' : ''} />)}</div>

      {step === 1 && (() => {
        const QS = [
          { short: 'Numbness or tingling, feet', ans: `${d.symptoms.feetNumb}/10`, title: 'Rate the numbness or tingling in your feet over the past 7 days.', body: <Scale id="feet" label="Numbness or tingling in my feet" value={d.symptoms.feetNumb} onChange={(v) => sym('feetNumb', v)} /> },
          { short: 'Numbness or tingling, hands', ans: `${d.symptoms.handsNumb}/10`, title: 'Rate the numbness or tingling in your hands over the past 7 days.', body: <Scale id="hands" label="Numbness or tingling in my hands" value={d.symptoms.handsNumb} onChange={(v) => sym('handsNumb', v)} /> },
          { short: 'Burning or pain, feet', ans: `${d.symptoms.feetPain}/10`, title: 'Rate any burning or pain in your feet over the past 7 days.', body: <Scale id="pain" label="Burning or pain in my feet" value={d.symptoms.feetPain} onChange={(v) => sym('feetPain', v)} /> },
          { short: 'Fine hand tasks', ans: d.buttons ? 'Yes' : 'No', title: 'Have you had trouble with buttons, zips, or picking up small objects?', body: <Options label="Trouble with fine hand tasks" value={d.buttons} onChange={(v) => set({ buttons: v })} options={[[false, 'No'], [true, 'Yes']]} /> },
          { short: 'Falls', ans: { none: 'None', near: 'Near-fall', fall: 'Fall' }[d.falls], title: 'Since your last check-in, have you fallen or tripped?', body: (<>
            <Options label="Falls since last check-in" value={d.falls} onChange={(v) => set({ falls: v })} options={[['none', 'No falls or trips'], ['near', 'Tripped or caught myself'], ['fall', 'Fell']]} />
            {d.falls === 'fall' && <p className="notice red" style={{ marginTop: 14 }}>If you fell and were hurt, or your numbness came on suddenly, call your care team today rather than waiting for your next visit.</p>}
          </>) },
        ];
        const cur = QS[q], lastQ = q === QS.length - 1;
        return (
          <form className="form-ed" onSubmit={(e) => { e.preventDefault(); if (lastQ) goStep(2); else setQ(q + 1); }}>
            <aside className="form-rail" aria-label="Questions">
              <p className="mono">Symptom questionnaire</p>
              <dl className="form-meta">
                <div><dt>Cycle</dt><dd><input id="ci-cycle" type="number" min="1" max="60" inputMode="numeric" value={d.cycle} onChange={(e) => set({ cycle: Math.max(1, parseInt(e.target.value || '1', 10)) })} /></dd></div>
                <div><dt>Date</dt><dd><input id="ci-date" type="date" value={d.date} onChange={(e) => set({ date: e.target.value || today() })} /></dd></div>
              </dl>
              <ol>
                {QS.map((x, k) => (
                  <li key={k} className={k === q ? 'on' : k < q ? 'done' : ''}>
                    <button type="button" onClick={() => setQ(k)} aria-current={k === q ? 'step' : undefined}>
                      <span className="n">{String(k + 1).padStart(2, '0')}</span><span className="t">{x.short}</span><span className="a">{k < q || k === q ? x.ans : ''}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>
            <section className="form-q" aria-labelledby="q-title">
              <p className="mono form-k">Question {q + 1} of {QS.length}{q < 3 ? ' · past 7 days · 0 = none, 10 = worst imaginable' : ''}</p>
              <h1 id="q-title">{cur.title}</h1>
              {cur.body}
              <div className="form-foot">
                <button type="button" className="btn" disabled={q === 0} onClick={() => setQ(q - 1)}>Previous</button>
                <button type="submit" className="btn primary">{lastQ ? 'Continue to walking test' : 'Continue'}</button>
              </div>
            </section>
          </form>
        );
      })()}

      {step === 2 && (
        <section className="test-ed">
          <div className="test-info">
          <p className="mono test-k">Test 1 of 3 · Walking · 30 s</p>
          <h1>Walk for 30 seconds</h1>
          <PreviewNote />
          <Instructions items={[
            ['walk', 'navy', 'Find a hallway or room where you can walk safely. Use your cane or walker if you normally do.'],
            ['pulse', 'navy', 'Put your phone in a front trouser pocket, screen facing in.'],
            ['arrowRight', 'navy', 'Walk at your usual pace. Turn around when you need to.'],
            ['info', 'rose', 'Your phone will say “start walking” and “stop” out loud.'],
          ]} />
          </div>
          <div className="test-panel">
          <div className="recorder">
            <Ring remaining={walkRec.remaining} progress={walkRec.progress} />
            <p style={{ margin: 0, fontSize: '1.05rem' }} aria-live="assertive">{walkRec.msg || 'Tap start, then put your phone in your pocket. You’ll have 5 seconds.'}</p>
          </div>
          {walkRec.error && <p className="error" role="alert">{walkRec.error}</p>}
          <div className="actions">
            <button type="button" className="btn primary" disabled={walkRec.busy} onClick={async () => { const g = await runWalk('Start walking', 'Walking… keep going at your usual pace.', (s) => Gait.analyze(s)); if (g) { set({ gait: g }); goStep(3); } }}><Icon name="play" size={16} /> Start walking test</button>
            <button type="button" className="btn" disabled={walkRec.busy} onClick={() => { set({ gait: Gait.analyze(Gait.synthesizeWalk({ cadence: 105 + Math.random() * 10, cv: 2 + Math.random(), seed: Date.now() % 100000 }).samples), source: 'sample' }); goStep(3); }}>Use a sample instead</button>
          </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="test-ed">
          <div className="test-info">
          <p className="mono test-k">Test 2 of 3 · Balance · 20 s{showClosed ? ' + 20 s' : ''}</p>
          <h1>{showClosed ? 'Now, if you’re comfortable, with your eyes closed' : 'Stand still for 20 seconds'}</h1>
          <PreviewNote />
          <Instructions items={[
            ['shield', 'red', 'Stand right next to a wall, counter, or sturdy chair you can grab.'],
            ['pulse', 'navy', 'Keep the phone in the same front pocket.'],
            ['balance', 'navy', 'Put your feet side by side, close together, eyes open. Look straight ahead.'],
            ['info', 'rose', 'If you feel unsteady at any point, hold on. You can skip this test.'],
          ]} />
          </div>
          <div className="test-panel">
          {!showClosed ? <>
            <div className="recorder">
              <Ring remaining={balRec.remaining} progress={balRec.progress} />
              <p style={{ margin: 0, fontSize: '1.05rem' }} aria-live="assertive">{balRec.msg || 'Tap start, put the phone in your pocket, and stand with feet together.'}</p>
            </div>
            {balRec.error && <p className="error" role="alert">{balRec.error}</p>}
            <div className="actions">
              <button type="button" className="btn primary" disabled={balRec.busy} onClick={async () => { const b = await runBal('Feet together. Stand still.', 'Standing still… hold on to the wall if you need to.', (s) => Gait.analyzeBalance(s, { trimSeconds: 1 })); if (b) { set({ balance: b }); setShowClosed(true); } }}><Icon name="play" size={16} /> Start balance test</button>
              <button type="button" className="btn" disabled={balRec.busy} onClick={() => { set({ balance: Gait.analyzeBalance(Gait.synthesizeStand({ sway: 0.03 + Math.random() * 0.02, seed: Date.now() % 100000, seconds: 20 }).samples, { trimSeconds: 1 }), source: d.source === 'sample' ? 'sample' : 'mixed' }); setShowClosed(true); }}>Use a sample instead</button>
              <button type="button" className="btn ghost" disabled={balRec.busy} onClick={() => { set({ balance: null }); goStep(4); }}>Skip this test</button>
            </div>
          </> : <>
            <div>
              <p className="mono test-done"><Icon name="check" size={14} /> Eyes open · done</p>
              <h2 className="sr-only">Optional: the same test with your eyes closed</h2>
              <p className="muted">Doctors use this test (called the Romberg test) because some nerve problems in the feet show up as extra wobble when you can’t see. Your twin compares it with your eyes-open result.</p>
              <p className="notice red">Only do this with a wall or counter right beside you, and someone nearby if possible. If you feel unsteady, open your eyes and hold on. Skip it if your care team has told you to avoid it, or if you’ve fallen recently.</p>
              <div className="recorder" style={{ marginTop: 14 }}>
                <Ring remaining={closedRec.remaining} progress={closedRec.progress} />
                <p style={{ margin: 0 }} aria-live="assertive">{closedRec.msg || 'Your phone will say “close your eyes” and “open your eyes”.'}</p>
              </div>
              {closedRec.error && <p className="error" role="alert">{closedRec.error}</p>}
              <div className="actions" style={{ marginBottom: 0 }}>
                <button type="button" className="btn primary" disabled={closedRec.busy} onClick={async () => { const b = await runClosed('Feet together. Close your eyes.', 'Eyes closed, standing still… open your eyes and hold on if you feel unsteady.', (s) => Gait.analyzeBalance(s, { trimSeconds: 1 })); speak('Open your eyes. Well done.'); if (b) { set({ balanceClosed: b }); goStep(4); } }}><Icon name="play" size={16} /> Start eyes-closed test</button>
                <button type="button" className="btn" disabled={closedRec.busy} onClick={() => { set({ balanceClosed: Gait.analyzeBalance(Gait.synthesizeStand({ sway: (d.balance?.swayRms || 0.04) * 1.6, seed: Date.now() % 100000, seconds: 20 }).samples, { trimSeconds: 1 }) }); goStep(4); }}>Use a sample instead</button>
                <button type="button" className="btn ghost" onClick={() => { set({ balanceClosed: null }); goStep(4); }}>Skip</button>
              </div>
            </div>
          </>}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="test-ed tap-ed">
          <p className="mono test-k">Test 3 of 3 · Hands · 10 s each</p>
          <h1>Tap test for your hands</h1>
          <p className="lede">Use your <strong>{tapUi.hand}</strong> index finger. Tap the two circles back and forth, one then the other, as fast as you comfortably can. The 10 seconds start with your first tap.</p>
          <div className="card tap-area">
            <button type="button" className={`tap-target${tapUi.target === 0 ? ' next' : ''}`} aria-label="Left circle" onPointerDown={(e) => { e.preventDefault(); onTap(0); }} />
            <div className="tap-mid"><span className="t">{tapUi.remaining}</span><span className="fine">{tapUi.hand === 'right' ? 'Right hand' : 'Left hand'}</span></div>
            <button type="button" className={`tap-target${tapUi.target === 1 ? ' next' : ''}`} aria-label="Right circle" onPointerDown={(e) => { e.preventDefault(); onTap(1); }} />
          </div>
          <p aria-live="polite">{tapUi.msg}</p>
          {tapUi.error && <p className="error" role="alert">{tapUi.error}</p>}
          {saveErr && <p className="error" role="alert">{saveErr}</p>}
          <div className="actions">
            <button type="button" className="btn" onClick={() => { clearInterval(tap.current.timer); const s = Date.now() % 100000; finish({ tapping: { right: Gait.analyzeTapping(Gait.synthesizeTaps({ seed: s }), 10), left: Gait.analyzeTapping(Gait.synthesizeTaps({ seed: s + 1, rate: 4.1 }), 10) } }); }}>Use a sample instead</button>
            <button type="button" className="btn ghost" onClick={() => { clearInterval(tap.current.timer); finish({ tapping: null }); }}>Skip hand test</button>
          </div>
        </section>
      )}

      {step === 5 && saved && (
        <section className="test-ed done-ed">
          <h1>Check-in saved</h1>
          <div className="card">
            <p style={{ fontSize: '1.1rem' }}>
              {all.length === 1 ? 'This is your baseline. Check in again before your next infusion and your twin will start showing changes.'
                : flags.length ? `Compared with your first check-in, ${flags.length} thing${flags.length > 1 ? 's have' : ' has'} changed. Your twin shows the details.`
                  : 'Things look about the same as at your first check-in.'}
            </p>
            {saved.source !== 'sensor' && <p className="fine">Some of this check-in used sample data instead of your phone sensors.</p>}
            <div className="actions" style={{ marginBottom: 0 }}>
              <button type="button" className="btn primary" onClick={() => go('twin')}>See my twin <Icon name="arrowRight" size={18} /></button>
              <button type="button" className="btn" onClick={() => go('report')}>Make a report</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
