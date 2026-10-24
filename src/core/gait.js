/*
 * Gait Twin — gait analysis engine
 * Works in the browser (window.Gait) and in Node (module.exports) so the
 * same code is used by the app, the unit tests, and the validation script.
 *
 * Input: array of samples { t: ms, ax, ay, az, gx?, gy?, gz? }
 *   ax/ay/az = accelerationIncludingGravity (m/s^2) from DeviceMotionEvent
 *   gx/gy/gz = rotationRate (deg/s), optional
 *
 * Method (standard trunk/thigh accelerometry approach):
 *   1. Acceleration magnitude (orientation-independent, so pocket rotation doesn't matter)
 *   2. Resample to a fixed 100 Hz grid (phones deliver uneven sample rates)
 *   3. Remove gravity / drift with a 1 s moving-average high-pass
 *   4. Low-pass (4th-order Butterworth, 3 Hz, zero-phase) to keep the step rhythm
 *   5. Autocorrelation -> dominant step period and stride period
 *   6. Peak detection constrained by that period -> individual step times
 *   7. Metrics: cadence, step-time variability (CV), step regularity,
 *      stride regularity, symmetry, left/right step asymmetry, hesitations
 */

const FS = 100; // Hz, analysis sample rate

function mean(a) { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : 0; }
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m);
  return Math.sqrt(s / (a.length - 1));
}
function median(a) {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y); const n = b.length;
  return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
}

// Linear-interpolation resample onto a uniform grid.
function resample(times, values, fs) {
  const t0 = times[0], t1 = times[times.length - 1];
  const n = Math.floor(((t1 - t0) / 1000) * fs) + 1;
  const out = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    while (j < times.length - 2 && times[j + 1] < t) j++;
    const ta = times[j], tb = times[j + 1];
    const f = tb > ta ? (t - ta) / (tb - ta) : 0;
    out[i] = values[j] + Math.max(0, Math.min(1, f)) * (values[j + 1] - values[j]);
  }
  return { signal: out, t0 };
}

function movingAverage(x, win) {
  const n = x.length, out = new Float64Array(n), h = Math.floor(win / 2);
  const cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n, i + h + 1);
    out[i] = (cs[b] - cs[a]) / (b - a);
  }
  return out;
}

// 2nd-order Butterworth low-pass biquad (RBJ cookbook), applied as cascaded
// forward-backward passes for zero phase (effective 4th order).
function biquadLowpass(x, fc, fs) {
  const w0 = (2 * Math.PI * fc) / fs, q = Math.SQRT1_2;
  const alpha = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0;
  const a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
  const run = (inp) => {
    const out = new Float64Array(inp.length);
    let x1 = inp[0], x2 = inp[0], y1 = inp[0], y2 = inp[0];
    for (let i = 0; i < inp.length; i++) {
      const x0 = inp[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return out;
  };
  const fwd = run(x);
  const back = run(Float64Array.from(fwd).reverse()).reverse();
  return back;
}

// Unbiased normalized autocorrelation at a single lag.
function autocorrAt(x, lag) {
  const n = x.length - lag; if (n <= 1) return 0;
  let s = 0, e0 = 0, e1 = 0;
  for (let i = 0; i < n; i++) { s += x[i] * x[i + lag]; e0 += x[i] * x[i]; e1 += x[i + lag] * x[i + lag]; }
  return e0 && e1 ? s / Math.sqrt(e0 * e1) : 0;
}

function preprocess(samples) {
  const times = [], mag = [];
  for (const s of samples) {
    if (s == null || !isFinite(s.ax) || !isFinite(s.ay) || !isFinite(s.az)) continue;
    if (times.length && s.t <= times[times.length - 1]) continue; // drop duplicates / out-of-order
    times.push(s.t);
    mag.push(Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az));
  }
  if (times.length < 20) return null;
  const { signal, t0 } = resample(times, mag, FS);
  const base = movingAverage(signal, FS); // 1 s window
  const hp = signal.map((v, i) => v - base[i]);
  const lp = biquadLowpass(hp, 3.0, FS);
  // Raw-rate estimate (helps debugging different phones)
  const rawRate = (times.length - 1) / ((times[times.length - 1] - times[0]) / 1000);
  return { x: lp, t0, rawRate };
}

// Find step period (s) from the first autocorrelation peak in 0.3–1.2 s,
// and confirm the stride peak near twice that.
function dominantPeriods(x) {
  const minLag = Math.round(0.3 * FS), maxLag = Math.round(1.2 * FS);
  const ac = [];
  for (let lag = 0; lag <= Math.min(2.6 * FS, x.length - 2); lag++) ac.push(autocorrAt(x, lag));
  let best = -1, bestLag = 0;
  for (let lag = minLag; lag <= Math.min(maxLag, ac.length - 2); lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > best) { best = ac[lag]; bestLag = lag; }
  }
  if (!bestLag) return null;
  // A thigh/pocket signal can show its strongest peak at the STRIDE (two steps).
  // If a clear peak exists near half that lag, the true step lag is the half.
  const half = Math.round(bestLag / 2);
  if (half >= minLag) {
    let hBest = -1, hLag = 0;
    for (let lag = Math.max(minLag, half - 8); lag <= half + 8 && lag < ac.length - 1; lag++) {
      if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > hBest) { hBest = ac[lag]; hLag = lag; }
    }
    if (hLag && hBest > 0.25 && hBest > 0.5 * best) bestLag = hLag;
  }
  const stepLag = bestLag;
  // Stride peak: best local max within ±20% of 2×step lag.
  let sBest = -1, sLag = 0;
  const lo = Math.round(stepLag * 1.6), hi = Math.min(Math.round(stepLag * 2.4), ac.length - 2);
  for (let lag = lo; lag <= hi; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > sBest) { sBest = ac[lag]; sLag = lag; }
  }
  return {
    stepLag, strideLag: sLag || 2 * stepLag,
    stepRegularity: Math.max(0, ac[stepLag]),
    strideRegularity: Math.max(0, sLag ? ac[sLag] : ac[Math.min(2 * stepLag, ac.length - 1)] || 0),
  };
}

function detectPeaks(x, minDist, threshold) {
  const peaks = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > threshold && x[i] > x[i - 1] && x[i] >= x[i + 1]) {
      if (peaks.length && i - peaks[peaks.length - 1] < minDist) {
        if (x[i] > x[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
      } else peaks.push(i);
    }
  }
  return peaks;
}

/**
 * analyze(samples, opts) -> metrics object, or { ok:false, reason }
 * opts.trimSeconds: ignore the first/last N seconds (starting/stopping, putting phone away)
 */
function analyze(samples, opts = {}) {
  const trim = opts.trimSeconds ?? 2;
  const pre = preprocess(samples);
  if (!pre) return { ok: false, reason: 'Not enough motion data was recorded.' };
  const a = Math.round(trim * FS), b = pre.x.length - Math.round(trim * FS);
  if (b - a < 8 * FS) return { ok: false, reason: 'The walk was too short. Please walk for at least 15 seconds.' };
  const x = pre.x.slice(a, b);
  const energy = sd(Array.from(x));
  if (energy < 0.15) return { ok: false, reason: 'Very little movement was detected. Was the phone in your pocket while walking?' };

  const per = dominantPeriods(x);
  if (!per) return { ok: false, reason: 'No steady walking rhythm was found. Try walking in a straight line at your usual pace.' };

  const peaks = detectPeaks(x, Math.round(per.stepLag * 0.6), 0.35 * energy);
  if (peaks.length < 8) return { ok: false, reason: 'Too few steps were detected. Try a longer walk.' };

  const stepTimesSec = peaks.map((p) => (a + p) / FS); // seconds from recording start
  const intervals = [];
  for (let i = 1; i < stepTimesSec.length; i++) intervals.push(stepTimesSec[i] - stepTimesSec[i - 1]);

  const med = median(intervals);
  // Hesitations: gaps much longer than a normal step (possible pause / freezing-like episode).
  const hesitations = intervals.filter((d) => d > 1.8 * med).length;
  // Variability on "normal" steps only, so one pause doesn't swamp the number.
  const normal = intervals.filter((d) => d <= 1.8 * med && d >= 0.5 * med);
  const m = mean(normal), s = sd(normal);
  const cv = m ? (s / m) * 100 : 0;

  // Left/right: steps alternate, so compare odd vs even intervals.
  const odd = normal.filter((_, i) => i % 2 === 0), even = normal.filter((_, i) => i % 2 === 1);
  const asym = odd.length && even.length
    ? (Math.abs(mean(odd) - mean(even)) / ((mean(odd) + mean(even)) / 2)) * 100 : 0;

  const durationSec = x.length / FS;
  return {
    ok: true,
    version: 1,
    durationSec: +durationSec.toFixed(1),
    steps: peaks.length,
    cadence: +(60 / m).toFixed(1),                       // steps / minute
    stepTimeMean: +m.toFixed(3),                          // s
    stepTimeCV: +cv.toFixed(1),                           // %
    stepRegularity: +per.stepRegularity.toFixed(2),       // 0–1
    strideRegularity: +per.strideRegularity.toFixed(2),   // 0–1
    symmetry: per.strideRegularity > 0.05
      ? +Math.min(1.5, per.stepRegularity / per.strideRegularity).toFixed(2) : null, // ~1 = symmetric
    stepAsymmetry: +asym.toFixed(1),                      // % difference L vs R step time
    hesitations,
    stepTimes: stepTimesSec.map((v) => +v.toFixed(3)),    // for the twin animation
    sampleRateHz: +pre.rawRate.toFixed(0),
  };
}

/* ---------- Synthetic walks: tests, demo sessions, and the "no phone" fallback ---------- */

// Seeded PRNG so demo sessions are identical every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

/**
 * synthesizeWalk({ seconds, cadence, cv, asymmetry, pauses, seed, rate, jitterMs })
 * Produces samples shaped like a phone in a front trouser pocket:
 * gravity + a sharp impact at each heel strike + a smaller swing-phase wave,
 * with the phone held at an arbitrary tilt.
 */
function synthesizeWalk(opt = {}) {
  const o = Object.assign({ seconds: 30, cadence: 110, cv: 2, asymmetry: 0, pauses: 0, seed: 1, rate: 60, jitterMs: 4 }, opt);
  const r = rng(o.seed);
  const base = 60 / o.cadence;
  const steps = [];
  let t = 1.5;
  let pauseAt = new Set();
  for (let k = 0; k < o.pauses; k++) pauseAt.add(8 + Math.floor(r() * 25));
  let i = 0;
  while (t < o.seconds - 1) {
    steps.push(t);
    const side = i % 2 ? 1 + o.asymmetry / 200 : 1 - o.asymmetry / 200;
    let d = base * side * (1 + (o.cv / 100) * gauss(r));
    if (pauseAt.has(i)) d += 1.2 + r() * 0.8;
    t += Math.max(0.25, d); i++;
  }
  const tilt = [0.3, 0.8, 0.5]; const n = Math.hypot(...tilt); const g = tilt.map((v) => (9.81 * v) / n);
  const samples = [];
  let tm = 0; let si = 0;
  while (tm < o.seconds) {
    while (si < steps.length - 1 && steps[si + 1] <= tm) si++;
    let impact = 0;
    for (let k = Math.max(0, si - 1); k <= Math.min(steps.length - 1, si + 1); k++) {
      const dt = tm - steps[k];
      if (dt >= 0) impact += 3.2 * Math.exp(-dt / 0.05) * (1 - Math.exp(-dt / 0.012));
    }
    const phase = steps[si] != null && steps[si + 1] != null ? (tm - steps[si]) / (steps[si + 1] - steps[si]) : 0;
    const swing = 0.9 * Math.sin(2 * Math.PI * Math.min(1, Math.max(0, phase)));
    const moving = steps.length && tm > steps[0] - 0.3 && tm < steps[steps.length - 1] + 0.4 && phase <= 1.05 ? 1 : 0.15;
    const noise = () => 0.12 * gauss(r);
    const amp = (impact + swing) * moving;
    samples.push({ t: Math.round(tm * 1000), ax: g[0] + amp * 0.55 + noise(), ay: g[1] + amp * 0.7 + noise(), az: g[2] + amp * 0.45 + noise() });
    tm += 1 / o.rate + (o.jitterMs / 1000) * (r() - 0.5);
  }
  return { samples, trueStepTimes: steps };
}

/* ---------- Standing balance (feet together, eyes open) ---------- */
/**
 * analyzeBalance(samples) -> { ok, swayRms, swayPeak, durationSec } or { ok:false, reason }
 * Phone in front pocket while standing still. Sway = RMS of acceleration
 * deviation from its slow-moving mean (all three axes combined), in m/s^2.
 * Larger = more body sway. Only meaningful compared with the same person's earlier tests.
 */
function analyzeBalance(samples, opts = {}) {
  const trim = opts.trimSeconds ?? 2;
  const clean = samples.filter((s) => s && isFinite(s.ax) && isFinite(s.ay) && isFinite(s.az));
  if (clean.length < 20) return { ok: false, reason: 'Not enough motion data was recorded.' };
  const times = clean.map((s) => s.t);
  const axes = ['ax', 'ay', 'az'].map((k) => resample(times, clean.map((s) => s[k]), FS).signal);
  const a = Math.round(trim * FS), b = axes[0].length - Math.round(trim * FS);
  if (b - a < 10 * FS) return { ok: false, reason: 'The balance test was too short. Please stand for the full 20 seconds.' };
  let sumSq = 0, peak = 0, n = 0;
  const devs = axes.map((x) => { const seg = x.slice(a, b); const base = movingAverage(seg, 2 * FS); return seg.map((v, i) => v - base[i]); });
  for (let i = 0; i < b - a; i++) {
    const d = Math.sqrt(devs[0][i] ** 2 + devs[1][i] ** 2 + devs[2][i] ** 2);
    sumSq += d * d; peak = Math.max(peak, d); n++;
  }
  const rms = Math.sqrt(sumSq / n);
  // Walking has a steady step rhythm; large but irregular sway is still a valid (unsteady) stance.
  if (rms > 0.5) {
    const w = analyze(clean, { trimSeconds: trim });
    if ((w.ok && w.steps >= 10 && w.stepRegularity > 0.5) || rms > 2.5) return { ok: false, reason: 'It looks like you were walking. Please stand still with feet together for this test.' };
  }
  return { ok: true, swayRms: +rms.toFixed(3), swayPeak: +peak.toFixed(2), durationSec: +((b - a) / FS).toFixed(1) };
}

function synthesizeStand(opt = {}) {
  const o = Object.assign({ seconds: 24, sway: 0.05, wobbles: 0, seed: 11, rate: 60 }, opt);
  const r = rng(o.seed);
  const samples = []; let tm = 0;
  const wob = Array.from({ length: o.wobbles }, () => 5 + r() * (o.seconds - 10));
  let lx = 0, ly = 0;
  while (tm < o.seconds) {
    lx = 0.97 * lx + o.sway * 0.6 * gauss(r); ly = 0.97 * ly + o.sway * 0.6 * gauss(r);
    let w = 0; for (const c of wob) w += 0.6 * Math.exp(-((tm - c) ** 2) / 0.2);
    samples.push({ t: Math.round(tm * 1000), ax: 0.5 + lx + w, ay: 9.7 + 0.3 * ly, az: 1.0 + ly + 0.5 * w });
    tm += 1 / o.rate;
  }
  return { samples };
}

/* ---------- Finger tapping (alternate between two on-screen targets) ---------- */
/**
 * analyzeTapping(taps, seconds) -> { ok, taps, rate, intervalCV, accuracy } or { ok:false, reason }
 * taps: [{ t: ms, hit: true|false, target: 0|1 }]
 *   rate       correct alternating taps per second
 *   intervalCV variability of time between taps (%), higher = less steady rhythm
 *   accuracy   % of taps that landed on the correct target
 */
function analyzeTapping(taps, seconds) {
  if (!taps || taps.length < 6) return { ok: false, reason: 'Too few taps were recorded. Tap back and forth between the two circles as fast as you comfortably can.' };
  const hits = taps.filter((x) => x.hit);
  const iv = [];
  for (let i = 1; i < taps.length; i++) iv.push(taps[i].t - taps[i - 1].t);
  const m = mean(iv), s = sd(iv);
  return {
    ok: true, taps: taps.length,
    rate: +(hits.length / seconds).toFixed(2),
    intervalCV: +(m ? (s / m) * 100 : 0).toFixed(1),
    accuracy: +((hits.length / taps.length) * 100).toFixed(0),
  };
}
function synthesizeTaps(opt = {}) {
  const o = Object.assign({ seconds: 10, rate: 4.5, cv: 15, missRate: 0.03, seed: 21 }, opt);
  const r = rng(o.seed); const taps = []; let t = 300, target = 0;
  while (t < o.seconds * 1000) {
    const hit = r() > o.missRate;
    taps.push({ t: Math.round(t), hit, target });
    if (hit) target = 1 - target;
    t += Math.max(60, (1000 / o.rate) * (1 + (o.cv / 100) * gauss(r)));
  }
  return taps;
}

const api = { analyze, analyzeBalance, analyzeTapping, synthesizeWalk, synthesizeStand, synthesizeTaps, _internal: { preprocess, dominantPeriods, median, mean, sd } };
export const Gait = api;
export default api;
