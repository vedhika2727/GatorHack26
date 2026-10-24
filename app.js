/* Chemo Nerve Check — app logic: routing, storage, check-in flow, twin, report. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const STORE = 'cnc.checkins.v1';
  const WALK_SECONDS = 30, BALANCE_SECONDS = 20, LEAD_IN = 5;

  /* ---------- Storage (wrapped: private windows can throw) ---------- */
  let memory = [];
  function load() {
    try { const raw = localStorage.getItem(STORE); if (raw) memory = JSON.parse(raw); } catch (_) {}
    return memory;
  }
  function save(list) {
    memory = list;
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (_) {}
  }
  const checkins = () => [...memory].sort((a, b) => a.cycle - b.cycle || a.date.localeCompare(b.date));
  const SCAN_STORE = 'cnc.scans.v1';
  let scanMem = [];
  function loadScans() { try { const r = localStorage.getItem(SCAN_STORE); if (r) scanMem = JSON.parse(r); } catch (_) {} return scanMem; }
  function saveScans(list) {
    scanMem = list;
    try { localStorage.setItem(SCAN_STORE, JSON.stringify(list)); return true; }
    catch (_) { return false; } // usually storage full because of images
  }
  const scans = () => [...scanMem].sort((a, b) => a.date.localeCompare(b.date));

  /* ---------- Routing ---------- */
  const views = ['twin', 'checkin', 'scans', 'report'];
  function route() {
    const name = (location.hash || '#twin').slice(1);
    const v = views.includes(name) ? name : 'twin';
    for (const x of views) $('#view-' + x).hidden = x !== v;
    document.querySelectorAll('.tabs a').forEach((a) => { if (a.dataset.tab === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'twin') renderTwin();
    if (v === 'checkin') startCheckin();
    if (v === 'report') prepReport();
    if (v === 'scans') renderScans();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- Helpers ---------- */
  const fmtDate = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) { return iso; } };
  function speak(text) {
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (_) {}
  }
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Motion recording ---------- */
  async function requestMotion() {
    if (!window.isSecureContext) throw new Error('Motion sensors only work on a secure (https) page. Open the deployed site on your phone, or use a sample.');
    if (typeof DeviceMotionEvent === 'undefined') throw new Error("This browser doesn't give access to motion sensors. Try Safari or Chrome on a phone, or use a sample.");
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission(); // iPhone: must run inside a tap
      if (r !== 'granted') throw new Error('Motion access was not allowed. In Safari, reload the page and tap "Allow" when asked.');
    }
  }

  async function record(seconds, ui) {
    const samples = [];
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
      const r = e.rotationRate || {};
      samples.push({ t: performance.now(), ax: a.x, ay: a.y, az: a.z, gx: r.alpha, gy: r.beta, gz: r.gamma });
    };
    let lock = null;
    try { lock = await navigator.wakeLock?.request('screen'); } catch (_) {}
    try {
      for (let i = LEAD_IN; i > 0; i--) { ui.time.textContent = i; ui.msg.textContent = `Put your phone in your pocket. Starting in ${i}…`; await sleep(1000); }
      window.addEventListener('devicemotion', onMotion);
      speak(ui.startWord); buzz(200);
      ui.msg.textContent = ui.during;
      const C = 326.7, start = performance.now();
      while (true) {
        const el = (performance.now() - start) / 1000;
        if (el >= 1.5 && samples.length < 5) throw new Error("This device isn't sending motion data. Open the site on a phone, or use a sample.");
        ui.time.textContent = Math.max(0, Math.ceil(seconds - el));
        ui.ring.style.strokeDashoffset = C * (1 - Math.min(1, el / seconds));
        if (el >= seconds) break;
        await sleep(200);
      }
      speak('Stop. You can take out your phone.'); buzz([200, 100, 200]);
      return samples;
    } finally {
      window.removeEventListener('devicemotion', onMotion);
      try { await lock?.release(); } catch (_) {}
    }
  }

  /* ---------- Check-in flow ---------- */
  let draft = null;
  function showStep(n) {
    for (let i = 1; i <= 5; i++) $('#step-' + i).hidden = i !== n;
    document.querySelectorAll('#progress li').forEach((li) => li.classList.toggle('on', +li.dataset.step <= n));
    window.scrollTo(0, 0);
  }
  function startCheckin() {
    if (draft && draft.inProgress) return;
    const list = checkins().filter((c) => !c.demo);
    const last = list[list.length - 1];
    draft = { inProgress: true };
    $('#f-cycle').value = last ? last.cycle + 1 : 1;
    $('#f-date').value = new Date().toISOString().slice(0, 10);
    for (const k of ['feetNumb', 'handsNumb', 'feetPain']) { $('#s-' + k).value = 0; $('#s-' + k).nextElementSibling.value = 0; }
    document.querySelector('input[name=buttons][value=no]').checked = true;
    document.querySelector('input[name=falls][value=none]').checked = true;
    $('#fall-callout').hidden = true;
    resetRecorder('walk', WALK_SECONDS); resetRecorder('bal', BALANCE_SECONDS); resetRecorder('closed', BALANCE_SECONDS);
    $('#bal-closed').hidden = true; resetTapping();
    showStep(1);
  }
  function resetRecorder(p, secs) {
    $(`#${p}-time`).textContent = secs; $(`#${p}-ring`).style.strokeDashoffset = 326.7;
    $(`#${p}-error`).hidden = true; $(`#${p}-start`).disabled = false;
  }
  document.querySelectorAll('.slider input').forEach((inp) => inp.addEventListener('input', () => { inp.nextElementSibling.value = inp.value; }));
  document.querySelectorAll('input[name=falls]').forEach((r) => r.addEventListener('change', () => { $('#fall-callout').hidden = r.value !== 'fall' || !r.checked; }));

  $('#step-1').addEventListener('submit', (e) => {
    e.preventDefault();
    const cycle = parseInt($('#f-cycle').value, 10);
    if (!cycle || cycle < 1) { $('#f-cycle').focus(); return; }
    Object.assign(draft, {
      id: 'c' + Date.now(), cycle, date: $('#f-date').value || new Date().toISOString().slice(0, 10),
      symptoms: { feetNumb: +$('#s-feetNumb').value, handsNumb: +$('#s-handsNumb').value, feetPain: +$('#s-feetPain').value },
      buttons: document.querySelector('input[name=buttons]:checked').value === 'yes',
      falls: document.querySelector('input[name=falls]:checked').value,
    });
    showStep(2);
  });

  function fail(p, msg) { const e = $(`#${p}-error`); e.textContent = msg; e.hidden = false; $(`#${p}-start`).disabled = false; }

  $('#walk-start').addEventListener('click', async () => {
    $('#walk-error').hidden = true; $('#walk-start').disabled = true;
    try {
      await requestMotion();
      const s = await record(WALK_SECONDS, { time: $('#walk-time'), ring: $('#walk-ring'), msg: $('#walk-msg'), startWord: 'Start walking', during: 'Walking… keep going at your usual pace.' });
      const g = Gait.analyze(s);
      if (!g.ok) return fail('walk', g.reason + ' Tap start to try again.');
      draft.gait = g; draft.source = 'sensor';
      $('#walk-msg').textContent = `Got it: ${g.steps} steps.`;
      showStep(3);
    } catch (err) { fail('walk', err.message); }
  });
  $('#walk-sample').addEventListener('click', () => {
    const w = Gait.synthesizeWalk({ cadence: 105 + Math.random() * 10, cv: 2 + Math.random(), seed: Date.now() % 100000 });
    draft.gait = Gait.analyze(w.samples); draft.source = 'sample';
    showStep(3);
  });

  $('#bal-start').addEventListener('click', async () => {
    $('#bal-error').hidden = true; $('#bal-start').disabled = true;
    try {
      await requestMotion();
      const s = await record(BALANCE_SECONDS, { time: $('#bal-time'), ring: $('#bal-ring'), msg: $('#bal-msg'), startWord: 'Feet together. Stand still.', during: 'Standing still… hold on to the wall if you need to.' });
      const b = Gait.analyzeBalance(s, { trimSeconds: 1 });
      if (!b.ok) return fail('bal', b.reason + ' Tap start to try again, or skip.');
      draft.balance = b; offerClosed();
    } catch (err) { fail('bal', err.message); }
  });
  $('#bal-sample').addEventListener('click', () => {
    draft.balance = Gait.analyzeBalance(Gait.synthesizeStand({ sway: 0.03 + Math.random() * 0.02, seed: Date.now() % 100000, seconds: 20 }).samples, { trimSeconds: 1 });
    if (draft.source !== 'sample') draft.source = 'mixed';
    offerClosed();
  });
  $('#bal-skip').addEventListener('click', () => { draft.balance = null; showStep(4); });
  function offerClosed() {
    $('#bal-msg').textContent = 'Eyes-open test done.';
    $('#bal-start').disabled = true;
    $('#bal-closed').hidden = false;
    $('#bal-closed').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#closed-start').addEventListener('click', async () => {
    $('#closed-error').hidden = true; $('#closed-start').disabled = true;
    try {
      await requestMotion();
      const s = await record(BALANCE_SECONDS, { time: $('#closed-time'), ring: $('#closed-ring'), msg: $('#closed-msg'), startWord: 'Feet together. Close your eyes.', during: 'Eyes closed, standing still… open your eyes and hold on if you feel unsteady.' });
      speak('Open your eyes. Well done.');
      const b = Gait.analyzeBalance(s, { trimSeconds: 1 });
      if (!b.ok) return fail('closed', b.reason + ' Tap start to try again, or skip.');
      draft.balanceClosed = b; showStep(4);
    } catch (err) { fail('closed', err.message); }
  });
  $('#closed-sample').addEventListener('click', () => {
    const open = draft.balance?.swayRms || 0.04;
    draft.balanceClosed = Gait.analyzeBalance(Gait.synthesizeStand({ sway: open * 1.6, seed: Date.now() % 100000, seconds: 20 }).samples, { trimSeconds: 1 });
    showStep(4);
  });
  $('#closed-skip').addEventListener('click', () => { draft.balanceClosed = null; showStep(4); });

  /* Tapping: right hand, then left hand, 10 s each */
  const TAP_SECONDS = 10;
  let tap = null;
  function resetTapping() {
    tap = { hand: 'right', taps: [], start: 0, target: 0, timer: 0, results: {} };
    $('#tap-time').textContent = TAP_SECONDS; $('#tap-hand').textContent = 'Right hand';
    $('#tap-instr').innerHTML = 'Use your <strong>right</strong> index finger. Tap the two circles back and forth, one then the other, as fast as you comfortably can. The 10 seconds start with your first tap.';
    $('#tap-msg').textContent = "Rest your phone on a table. Start whenever you're ready.";
    $('#tap-error').hidden = true;
    markNext();
  }
  function markNext() { $('#tap-0').classList.toggle('next', tap.target === 0); $('#tap-1').classList.toggle('next', tap.target === 1); }
  function onTap(e) {
    if (!tap || tap.done) return;
    e.preventDefault();
    const now = performance.now();
    if (!tap.start) {
      tap.start = now;
      tap.timer = setInterval(() => {
        const left = TAP_SECONDS - (performance.now() - tap.start) / 1000;
        $('#tap-time').textContent = Math.max(0, Math.ceil(left));
        if (left <= 0) endHand();
      }, 100);
    }
    const which = e.currentTarget === $('#tap-0') ? 0 : e.currentTarget === $('#tap-1') ? 1 : -1;
    const hit = which === tap.target;
    tap.taps.push({ t: now - tap.start, hit, target: tap.target });
    if (hit) { tap.target = 1 - tap.target; markNext(); }
  }
  ['#tap-0', '#tap-1', '#tap-area'].forEach((sel) => $(sel).addEventListener('pointerdown', (e) => { if (sel === '#tap-area' && e.target !== $('#tap-area')) return; onTap(e); }));
  function endHand() {
    clearInterval(tap.timer);
    const r = Gait.analyzeTapping(tap.taps, TAP_SECONDS);
    if (!r.ok) { $('#tap-error').textContent = r.reason; $('#tap-error').hidden = false; tap.taps = []; tap.start = 0; $('#tap-time').textContent = TAP_SECONDS; return; }
    tap.results[tap.hand] = r;
    if (tap.hand === 'right') {
      tap.hand = 'left'; tap.taps = []; tap.start = 0; tap.target = 0; markNext();
      $('#tap-time').textContent = TAP_SECONDS; $('#tap-hand').textContent = 'Left hand';
      $('#tap-instr').innerHTML = 'Now use your <strong>left</strong> index finger. Same thing: back and forth, as fast as you comfortably can.';
      $('#tap-msg').textContent = `Right hand: ${r.rate} taps per second. Start the left hand whenever you're ready.`;
      buzz(150);
    } else {
      tap.done = true; draft.tapping = tap.results; buzz([150, 80, 150]); finish();
    }
  }
  $('#tap-sample').addEventListener('click', () => {
    clearInterval(tap?.timer);
    const seed = Date.now() % 100000;
    draft.tapping = { right: Gait.analyzeTapping(Gait.synthesizeTaps({ seed }), 10), left: Gait.analyzeTapping(Gait.synthesizeTaps({ seed: seed + 1, rate: 4.1 }), 10) };
    finish();
  });
  $('#tap-skip').addEventListener('click', () => { clearInterval(tap?.timer); draft.tapping = null; finish(); });

  function finish() {
    const { inProgress, ...c } = draft;
    // A new real check-in replaces the demo patient.
    const list = load().filter((x) => !x.demo && !(x.cycle === c.cycle && x.date === c.date));
    if (load().some((x) => x.demo)) saveScans(loadScans().filter((x) => !x.demo));
    list.push(c); save(list);
    draft = null;
    const all = checkins(); const flags = Trends.compare(all[0], c);
    $('#done-summary').innerHTML = '';
    const card = document.createElement('div'); card.className = 'done-card';
    const p = document.createElement('p');
    p.textContent = all.length === 1
      ? 'This is your baseline. Check in again before your next infusion and your twin will start showing changes.'
      : flags.length ? `Compared with your first check-in, ${flags.length} thing${flags.length > 1 ? 's have' : ' has'} changed. Your twin shows the details.` : 'Things look about the same as at your first check-in.';
    card.appendChild(p);
    if (c.source !== 'sensor') { const s = document.createElement('p'); s.className = 'fine'; s.textContent = 'Some of this check-in used sample data instead of your phone sensors.'; card.appendChild(s); }
    $('#done-summary').appendChild(card);
    showStep(5);
  }

  /* ---------- Twin ---------- */
  let selected = null; const walkerA = { w: null }, walkerB = { w: null };
  function renderTwin() {
    const list = checkins();
    $('#empty-state').hidden = list.length > 0;
    $('#twin-content').hidden = list.length === 0;
    if (!list.length) { walkerA.w?.stop(); walkerB.w?.stop(); return; }
    $('#demo-banner').hidden = !list.some((c) => c.demo);
    if (selected == null || selected >= list.length) selected = list.length - 1;
    const base = list[0], cur = list[selected];
    const flags = Trends.compare(base, cur);
    const level = selected === 0 ? 'steady' : Trends.overall(flags);

    // Nerve twin (hidden-state estimate)
    const tw = NerveTwin.run(list);
    const step = tw[selected];
    $('#est-num').textContent = Math.round(step.mean);
    $('#est-range').textContent = selected === 0
      ? (list.length === 1 ? 'This is your baseline. The twin starts learning from your next check-in.' : `Cycle ${base.cycle} is your baseline, so the twin starts at 0.`)
      : `Likely between ${Math.round(step.low)} and ${Math.round(step.high)} at cycle ${cur.cycle} (${fmtDate(cur.date)}). Before this check-in, the twin expected about ${Math.round(step.priorMean)}.`;
    const sp = $('#est-surprise');
    sp.hidden = step.surprise === 'none'; sp.className = 'surprise' + (step.surprise === 'better' ? ' better' : '');
    sp.textContent = step.surprise === 'worse'
      ? `This check-in was worse than your twin expected for cycle ${cur.cycle}. That's worth telling your care team before your next infusion.`
      : step.surprise === 'better' ? `This check-in was better than your twin expected.` : '';
    Twin.bandChart($('#band'), tw, selected);

    // Drivers: each signal's impact value vs the twin estimate
    const dv = $('#drivers'); dv.innerHTML = '';
    $('#drivers-note').textContent = selected === 0 ? 'Every later check-in is compared with this baseline.' : (NerveTwin.disagreements(step) || '') + ' The black tick on each bar is the twin\'s combined estimate. "Counts" is how much each signal contributes, based on how noisy it tends to be.';
    if (selected > 0) for (const g of step.signals) {
      const row = document.createElement('div'); row.className = 'driver' + (g.value == null ? ' missing' : '');
      const v = g.value == null ? null : Math.max(0, Math.min(100, g.value));
      row.innerHTML = `<span>${g.label}</span><span class="track" aria-hidden="true">${v == null ? '' : `<span class="fill" style="width:${v}%"></span>`}<span class="est" style="left:${Math.min(99, step.mean)}%"></span></span><span class="v">${g.value == null ? 'not measured' : `${Math.round(v)}, counts ${Math.round(g.share * 100)}%`}</span>`;
      row.setAttribute('aria-label', g.value == null ? `${g.label}: not measured` : `${g.label}: ${Math.round(v)} out of 100`);
      dv.appendChild(row);
    }

    // Body + walkers
    Twin.renderBody($('#body-svg'), cur.symptoms);
    if (!walkerA.w) { walkerA.w = new Twin.Walker($('#walk-a')); walkerB.w = new Twin.Walker($('#walk-b')); }
    walkerA.w.setSteps(base.gait?.ok ? base.gait.stepTimes : []);
    walkerB.w.setSteps(cur.gait?.ok ? cur.gait.stepTimes : []);
    $('#walk-a-label').textContent = `Baseline (cycle ${base.cycle})`;
    $('#walk-b-label').textContent = `Cycle ${cur.cycle}`;
    const gnum = (g) => g?.ok ? `${Math.round(g.cadence)} steps/min, evenness ${g.stepRegularity}` : '';
    $('#walk-a-num').textContent = gnum(base.gait); $('#walk-b-num').textContent = gnum(cur.gait);

    // Beads
    const beads = $('#beads'); beads.innerHTML = '';
    list.forEach((c, i) => {
      if (i) { const l = document.createElement('span'); l.className = 'bead-link'; l.setAttribute('aria-hidden', 'true'); beads.appendChild(l); }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'bead ' + (i === 0 ? 'steady' : Trends.overall(Trends.compare(base, c)));
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === selected ? 'true' : 'false');
      b.innerHTML = `<span>C${c.cycle}</span><small>${fmtDate(c.date)}</small>`;
      b.setAttribute('aria-label', `Cycle ${c.cycle}, ${fmtDate(c.date)}`);
      b.addEventListener('click', () => { selected = i; renderTwin(); });
      beads.appendChild(b);
    });
    beads.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // Changes
    const ch = $('#changes'); ch.innerHTML = '';
    if (selected > 0) {
      const t = document.createElement('h2'); t.className = 'h3'; t.textContent = 'What changed since your first check-in'; ch.appendChild(t);
      if (flags.length) { const ul = document.createElement('ul'); for (const f of flags) { const li = document.createElement('li'); li.className = f.level; li.textContent = f.text; ul.appendChild(li); } ch.appendChild(ul); }
      else { const p = document.createElement('p'); p.className = 'none'; p.textContent = 'Nothing has changed beyond normal day-to-day variation.'; ch.appendChild(p); }
    }

    // Trends
    const tr = $('#trends'); tr.innerHTML = '';
    const metrics = [
      { name: 'Walking pace', unit: 'steps/min', get: (c) => c.gait?.ok ? c.gait.cadence : null, hint: 'A slower pace can follow numb feet' },
      { name: 'Step evenness', unit: 'out of 1', get: (c) => c.gait?.ok ? c.gait.stepRegularity : null, hint: 'Closer to 1 is more even', min: 0, max: 1 },
      { name: 'Step timing variation', unit: '%', get: (c) => c.gait?.ok ? c.gait.stepTimeCV : null, hint: 'Higher means less steady timing' },
      { name: 'Standing sway', unit: 'index', get: (c) => c.balance?.ok ? +(c.balance.swayRms * 100).toFixed(1) : null, hint: 'Higher means more wobble' },
      { name: 'Eyes-closed sway', unit: '× eyes open', get: (c) => c.balance?.ok && c.balanceClosed?.ok ? +(c.balanceClosed.swayRms / c.balance.swayRms).toFixed(2) : null, hint: 'Higher means you rely more on your eyes to balance' },
      { name: 'Tapping speed', unit: 'taps/s', get: (c) => tapRate(c), hint: 'Average of both hands' },
      { name: 'Feet symptoms', unit: '/10', get: (c) => Math.max(c.symptoms?.feetNumb || 0, c.symptoms?.feetPain || 0), hint: 'Your own rating', min: 0, max: 10 },
      { name: 'Hand symptoms', unit: '/10', get: (c) => c.symptoms?.handsNumb || 0, hint: 'Your own rating', min: 0, max: 10 },
    ];
    for (const m of metrics) {
      const vals = list.map(m.get);
      const d = document.createElement('div'); d.className = 'trend';
      const cv = vals[selected];
      d.innerHTML = `<h3>${m.name}</h3><div class="val">${cv == null ? '—' : cv} <span class="unit">${m.unit}</span></div><p class="hint">${m.hint}</p>`;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${m.name} across check-ins: ${vals.map((v) => v ?? 'none').join(', ')}`);
      d.appendChild(svg); tr.appendChild(d);
      Twin.sparkline(svg, vals, { selected, min: m.min, max: m.max });
    }
    renderDual(tw);
  }

  function tapRate(c) {
    const t = c.tapping; if (!t) return null;
    const v = [t.right, t.left].filter((x) => x?.ok).map((x) => x.rate);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
  }
  function renderDual(tw) {
    Twin.dualTimeline($('#dual'), Scans.tumorSeries(scans()), tw);
  }

  $('#load-demo').addEventListener('click', () => {
    const real = load().filter((c) => !c.demo);
    const demo = Demo.build();
    save([...real, ...demo]);
    saveScans([...loadScans().filter((x) => !x.demo), ...DemoScans.build(demo)]);
    selected = null; renderTwin();
  });
  $('#clear-demo').addEventListener('click', () => { save(load().filter((c) => !c.demo)); saveScans(loadScans().filter((x) => !x.demo)); selected = null; renderTwin(); });
  $('#delete-data').addEventListener('click', () => {
    if (!confirm('Delete every check-in stored on this device? This can’t be undone.')) return;
    save([]); saveScans([]); try { localStorage.removeItem(STORE); localStorage.removeItem(SCAN_STORE); } catch (_) {}
    selected = null; location.hash = '#twin'; renderTwin();
  });

  /* ---------- Report ---------- */
  function prepReport() {
    const n = checkins().length;
    $('#make-report').disabled = n === 0;
    $('#report-error').hidden = n > 0;
    if (!n) { $('#report-error').textContent = 'Do a check-in first (or load the demo patient) to make a report.'; }
  }
  $('#make-report').addEventListener('click', async () => {
    const list = checkins(); if (!list.length) return;
    const btn = $('#make-report'); btn.disabled = true; btn.textContent = 'Writing your report…';
    $('#report-error').hidden = true;
    try {
      const slim = list.map(({ gait, ...c }) => ({ ...c, gait: gait ? { ...gait, stepTimes: undefined } : gait }));
      const res = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkins: slim, scans: scans().map(({ images, ...x }) => x) }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || `The report service returned ${res.status}.`);
      showReport(list, out);
    } catch (err) {
      $('#report-error').textContent = `Couldn't write the report: ${err.message} The app needs its server running (see README).`;
      $('#report-error').hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Write my report again'; }
  });

  function showReport(list, out) {
    $('#report').hidden = false; $('#print-report').disabled = false;
    const last = list[list.length - 1];
    $('#report-meta').textContent = `${list.length} check-in${list.length > 1 ? 's' : ''}, cycles ${list[0].cycle}–${last.cycle}. Latest: ${fmtDate(last.date)}.${list.some((c) => c.demo) ? ' Demo patient, simulated data.' : ''}`;
    $('#r-patient').textContent = out.patient;
    $('#r-twin').textContent = out.twin || '';
    $('#r-scans-sec').hidden = !out.scans; $('#r-scans').textContent = out.scans || '';
    $('#r-clinician').textContent = out.clinician;
    const ul = $('#r-questions'); ul.innerHTML = '';
    for (const q of out.questions || []) { const li = document.createElement('li'); li.textContent = q; ul.appendChild(li); }
    const t = $('#r-table');
    const tw = NerveTwin.run(list);
    const head = ['Cycle', 'Date', 'Twin estimate', 'Feet /10', 'Hands /10', 'Pain /10', 'Steps/min', 'Evenness', 'Timing var. %', 'Pauses', 'Sway index', 'Eyes-closed ratio', 'Taps/s R', 'Taps/s L', 'Falls'];
    t.innerHTML = '<thead><tr>' + head.map((h) => `<th scope="col">${h}</th>`).join('') + '</tr></thead>';
    const tb = document.createElement('tbody');
    for (const c of list) {
      const g = c.gait?.ok ? c.gait : null, b = c.balance?.ok ? c.balance : null;
      const ti = tw[list.indexOf(c)];
      const cells = [c.cycle, c.date, `${ti.mean} (${ti.low}–${ti.high})${ti.surprise === 'worse' ? ' worse than expected' : ''}`, c.symptoms.feetNumb, c.symptoms.handsNumb, c.symptoms.feetPain, g?.cadence ?? '—', g?.stepRegularity ?? '—', g?.stepTimeCV ?? '—', g?.hesitations ?? '—', b ? (b.swayRms * 100).toFixed(1) : '—', b && c.balanceClosed?.ok ? (c.balanceClosed.swayRms / b.swayRms).toFixed(2) : '—', c.tapping?.right?.ok ? c.tapping.right.rate : '—', c.tapping?.left?.ok ? c.tapping.left.rate : '—', { none: 'No', near: 'Near-fall', fall: 'Fall' }[c.falls] || '—'];
      const tr = document.createElement('tr'); for (const v of cells) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); } tb.appendChild(tr);
    }
    t.appendChild(tb);
    const src = $('#report-source'); src.innerHTML = '';
    const badge = document.createElement('span');
    if (out.source === 'gemma') {
      badge.className = 'badge'; badge.textContent = `Written by Gemma 4 (${out.model})`;
      src.append(badge, ' from the measurements above. Which changes are flagged is decided by fixed rules, not by AI. Phone measurements are approximate. Not a diagnosis.');
    } else {
      badge.className = 'badge warn'; badge.textContent = 'Template text (Gemma not connected)';
      src.append(badge, ` ${out.note || ''} Phone measurements are approximate. Not a diagnosis.`);
    }
    $('#report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#print-report').addEventListener('click', () => window.print());

  /* ---------- Scans ---------- */
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let pending = null;

  function loadScript(src) {
    return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load the PDF reader. Paste the report text instead.')); document.head.appendChild(s); });
  }
  async function pdfText(file) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let lastY = null;
      for (const it of tc.items) { const y = it.transform[5]; out += (lastY != null && Math.abs(y - lastY) > 2 ? '\n' : ' ') + it.str; lastY = y; }
      out += '\n';
    }
    if (out.trim().length < 40) throw new Error('This PDF looks like a scanned picture with no text. Upload a photo of it instead.');
    return out;
  }
  function downscale(file, max, quality) {
    return new Promise((ok, bad) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => bad(new Error("That image couldn't be opened. Try a JPG or PNG."));
      img.src = url;
    });
  }

  function lesionTable(ex) {
    if (!ex.lesions.length) return '<p class="fine">No measurements were found in this report.</p>';
    return `<table class="lesions"><thead><tr><th scope="col">Where</th><th scope="col">Size</th><th scope="col">Before</th><th scope="col"><span class="sr">Found in text</span></th></tr></thead><tbody>${ex.lesions.map((l) => `<tr><td>${esc(l.location)}</td><td>${l.sizeMm} mm</td><td>${l.previousMm ? l.previousMm + ' mm' : '—'}</td><td class="tick" title="This number appears in the report text">✓ in report</td></tr>`).join('')}</tbody></table>`;
  }
  const chg = (ex) => `<span class="chg ${ex.change}">${esc(Scans.CHANGE_WORDS[ex.change] || ex.change)}</span>${ex.newLesions ? ' <span class="chg larger">Mentions a new finding</span>' : ''}`;

  function scanCard(s) {
    const d = document.createElement('article'); d.className = 'scan-card';
    d.innerHTML = `<h3>${esc(s.kind)}, ${esc(fmtDate(s.date))}</h3><p class="meta">Read by ${esc(s.reader || 'radiologist')}${s.demo ? ', fictional demo report' : ''}${s.extractSource === 'gemma' ? `, findings read by Gemma 4` : ', findings read by built-in rules'}</p>
      <p>${chg(s.extracted)}</p>
      ${s.extracted.plain ? `<p class="plain">${esc(s.extracted.plain)}</p>` : `<p class="plain"><strong>Radiologist's impression:</strong> ${esc(s.extracted.impression)}</p>`}
      ${lesionTable(s.extracted)}
      <div class="thumbs"></div>
      <details><summary>Full report text</summary><div class="report-text">${esc(s.text)}</div></details>
      <div class="actions"><button class="btn quiet" type="button" data-del="${esc(s.id)}">Remove this report</button></div>`;
    const th = d.querySelector('.thumbs');
    (s.images || []).forEach((src, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Open scan picture ${i + 1}`);
      const im = document.createElement('img'); im.src = src; im.alt = ''; b.appendChild(im);
      b.addEventListener('click', () => { $('#img-big').src = src; $('#img-dialog').showModal(); });
      th.appendChild(b);
    });
    d.querySelector('[data-del]').addEventListener('click', () => {
      if (!confirm('Remove this scan report from this device?')) return;
      saveScans(loadScans().filter((x) => x.id !== s.id)); renderScans();
    });
    return d;
  }

  function opinionsCard(a, b) {
    const cmp = Scans.compareReads(a, b);
    const d = document.createElement('section'); d.className = 'opinions';
    const word = { agree: 'Similar', size: 'Measured differently', 'only-a': 'Only in first report', 'only-b': 'Only in second report' };
    d.innerHTML = `<h3>Two doctors read this ${esc(a.kind)}</h3>
      <p>${cmp.differences ? `They differ on ${cmp.differences} point${cmp.differences > 1 ? 's' : ''}.` : 'Their measurements and conclusions match.'} This is common, and it's a good thing to ask your oncologist about.</p>
      <div class="table-wrap"><table class="lesions"><thead><tr><th scope="col">Where</th><th scope="col">${esc(a.reader || 'First read')}</th><th scope="col">${esc(b.reader || 'Second read')}</th><th scope="col">Comparison</th></tr></thead><tbody>
      ${cmp.rows.map((r) => `<tr class="op-row ${r.status}"><td>${esc(r.location)}</td><td>${r.a != null ? r.a + ' mm' : '—'}</td><td>${r.b != null ? r.b + ' mm' : '—'}</td><td>${word[r.status]}</td></tr>`).join('')}
      <tr class="op-row ${cmp.sameNew ? 'agree' : 'size'}"><td>New findings?</td><td>${a.extracted.newLesions ? 'Yes' : 'No'}</td><td>${b.extracted.newLesions ? 'Yes' : 'No'}</td><td>${cmp.sameNew ? 'Same' : 'Different'}</td></tr>
      <tr class="op-row ${cmp.sameChange ? 'agree' : 'size'}"><td>Overall</td><td>${esc(Scans.CHANGE_WORDS[a.extracted.change])}</td><td>${esc(Scans.CHANGE_WORDS[b.extracted.change])}</td><td>${cmp.sameChange ? 'Same' : 'Different'}</td></tr>
      </tbody></table></div>
      <div class="op-explain"></div>
      <div class="actions"><button class="btn" type="button">Explain the differences in plain words</button></div>`;
    const box = d.querySelector('.op-explain'), btn = d.querySelector('button');
    const show = (o) => {
      box.innerHTML = `<p class="plain">${esc(o.summary)}</p><p><strong>Questions to ask:</strong></p><ul>${(o.questions || []).map((q) => `<li>${esc(q)}</li>`).join('')}</ul><p class="fine">${o.source === 'gemma' ? `Written by Gemma 4 (${esc(o.model)}). It doesn't say which doctor is right.` : `Template text (Gemma not connected). ${esc(o.note || '')}`}</p>`;
    };
    if (b.opinion) show(b.opinion);
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Comparing the reports…';
      try {
        const res = await fetch('/api/opinions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: { reader: a.reader, text: a.text, extracted: a.extracted }, b: { reader: b.reader, text: b.text, extracted: b.extracted } }) });
        const o = await res.json(); if (!res.ok) throw new Error(o.error);
        show(o);
        saveScans(loadScans().map((x) => x.id === b.id ? { ...x, opinion: o } : x));
      } catch (e) { box.innerHTML = `<p class="error">Couldn't compare the reports: ${esc(e.message)}</p>`; }
      finally { btn.disabled = false; btn.textContent = 'Explain the differences again'; }
    });
    return d;
  }

  function renderScans() {
    if (!$('#sc-date').value) $('#sc-date').value = new Date().toISOString().slice(0, 10);
    const box = $('#scan-list'); box.innerHTML = '';
    const groups = Scans.groupOpinions(scans());
    if (!groups.length) { box.innerHTML = '<p class="fine">No scan reports yet. Add your first one above.</p>'; return; }
    for (const g of groups.reverse()) {
      if (g.length > 1) for (let i = 1; i < g.length; i++) box.appendChild(opinionsCard(g[0], g[i]));
      for (const s of g) box.appendChild(scanCard(s));
    }
  }

  function scanError(msg) { const e = $('#scan-error'); e.textContent = msg; e.hidden = !msg; }

  $('#scan-form').addEventListener('submit', async (e) => {
    e.preventDefault(); scanError('');
    const btn = $('#sc-read'); btn.disabled = true; btn.textContent = 'Reading the report…';
    try {
      let text = $('#sc-text').value.trim(), image = null;
      const f = $('#sc-file').files[0];
      if (f) {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) text = await pdfText(f);
        else if (/^image\//.test(f.type)) { const url = await downscale(f, 1600, 0.85); image = { mimeType: 'image/jpeg', data: url.split(',')[1] }; }
        else text = await f.text();
      }
      if (!text && !image) throw new Error('Paste the report text or upload a file first.');
      let out;
      try {
        const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(image ? { image } : { text }) });
        out = await res.json(); if (!res.ok) throw new Error(out.error || `Error ${res.status}`);
      } catch (err) {
        if (image) throw err;
        out = { extracted: Scans.verify(Scans.extractRules(text), text), source: 'rules', note: "The report service couldn't be reached, so built-in rules read the report.", text };
      }
      const imgs = [];
      for (const im of [...$('#sc-images').files].slice(0, 4)) imgs.push(await downscale(im, 900, 0.7));
      pending = { id: 's' + Date.now(), date: $('#sc-date').value, kind: $('#sc-kind').value, reader: $('#sc-reader').value.trim() || 'Radiologist', text: out.text || text, images: imgs, extracted: out.extracted, extractSource: out.source, fromPhoto: !!out.fromPhoto };
      showPreview(out);
    } catch (err) { scanError(err.message); }
    finally { btn.disabled = false; btn.textContent = 'Read this report'; }
  });

  function showPreview(out) {
    const p = $('#scan-preview'); p.hidden = false;
    const ex = pending.extracted;
    p.innerHTML = `<h2 class="h3">Check what was found</h2>
      <p>${chg(ex)}</p>
      ${ex.plain ? `<p class="plain">${esc(ex.plain)}</p>` : `<p class="plain"><strong>Radiologist's impression:</strong> ${esc(ex.impression)}</p>`}
      ${lesionTable(ex)}
      ${ex.droppedCount ? `<p class="fine">${ex.droppedCount} measurement${ex.droppedCount > 1 ? 's were' : ' was'} left out because ${ex.droppedCount > 1 ? 'they don\'t' : 'it doesn\'t'} appear word for word in the report text.</p>` : ''}
      ${pending.fromPhoto ? '<p class="fine">Read from a photo. Please check these numbers against your printed report.</p>' : ''}
      <p class="fine">${out.source === 'gemma' ? `Read by Gemma 4 (${esc(out.model)}). Every size shown was checked against the report text.` : `Read by built-in rules. ${esc(out.note || '')}`}</p>
      <div class="actions"><button class="btn primary" type="button" id="sc-save">Save this scan</button><button class="btn quiet" type="button" id="sc-discard">Discard</button></div>`;
    $('#sc-save').addEventListener('click', () => {
      const list = [...loadScans().filter((x) => !x.demo || load().some((c) => c.demo)), pending];
      let saved = saveScans(list);
      if (!saved) { pending.images = []; saved = saveScans([...list.slice(0, -1), pending]); if (saved) alert('Your device is out of storage space, so the scan pictures were not saved. The report was saved.'); }
      if (!saved) { scanError("This device's storage is full. Remove an older scan and try again."); return; }
      pending = null; p.hidden = true; $('#scan-form').reset(); renderScans();
    });
    $('#sc-discard').addEventListener('click', () => { pending = null; p.hidden = true; });
    p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  load(); loadScans(); route();
})();
