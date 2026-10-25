/*
 * Function Twin — a state-space model of a hidden quantity: overall change in walking,
 * balance, and hand function since baseline during chemotherapy. It does NOT measure
 * nerves directly; these functions can change from neuropathy or from other causes.
 *
 * Nobody can measure "how much have the nerves been affected" directly at home.
 * We observe several noisy proxies instead. The twin is a 1-D Kalman filter:
 *
 *   Hidden state   N_k   function change after check-in k, on a 0–100 scale (0 = baseline)
 *   Process model  N_k = N_{k-1} + alpha * exposure_k + w,   w ~ Normal(0, Q)
 *                  (each chemo cycle adds expected stress; Q allows for surprises)
 *   Observations   z_i = N_k + v_i,   v_i ~ Normal(0, R_i)
 *                  one per signal, each converted to the same 0–100 impact scale
 *                  relative to the patient's own baseline, with its own noise R_i
 *
 * Outputs per check-in: estimate, uncertainty (sd), the twin's expectation BEFORE
 * seeing that check-in (for "worse than expected" surprises), and how much each
 * signal pulled the estimate.
 *
 * IMPORTANT: these settings are NOT clinically calibrated. Walking pace is
 * literature-informed (see the comment on that signal); every other value is a
 * hand-picked starting point. Calibrating them needs a repeat-testing study and a
 * side-by-side study against clinical neuropathy grading (see README).
 */

const PARAMS = {
  alpha: 3,      // expected impact added per chemo cycle (points)
  Q: 8 * 8,      // process noise variance per cycle
  P0: 4 * 4,     // initial uncertainty at baseline (baseline defines 0)
};

// Each signal: how to turn a check-in into an impact value (0–100, relative to
// baseline), and how noisy that signal is (sd in impact points).
const SIGNALS = [
  { id: 'feet', label: 'Feet symptoms', plural: true, sd: 14, obs: (c) => 10 * Math.max(c.symptoms?.feetNumb || 0, c.symptoms?.feetPain || 0) },
  { id: 'hands', label: 'Hand symptoms', plural: true, sd: 18, obs: (c) => 10 * (c.symptoms?.handsNumb || 0) },
  // Walking pace (literature-informed). Scale: 100 points ~ the gap between healthy adults and
  // people with active CIPN. Active CIPN walked ~43% slower than controls (37.8 vs 66.7 cm/s,
  // Support Care Cancer 2026, doi:10.1007/s00520-026-10507-2) with ~31% shorter steps (0.54 vs
  // 0.78 m, JMIR mHealth 2021;9:e27502); speed = cadence x step length, leaving ~18% lower cadence,
  // so 1% cadence drop ~ 5.5 points. Noise: smartphone cadence test-retest SEM is reported at
  // ~2-8% (Functional Morphology & Kinesiology 2025;10:133); ~4% x 5.5 ~ 22 points.
  { id: 'pace', label: 'Walking pace', sd: 22, obs: (c, b) => ok(c.gait, b.gait) && clamp(((b.gait.cadence - c.gait.cadence) / b.gait.cadence) * 100 * 5.5) },
  { id: 'timing', label: 'Step timing variation', sd: 24, obs: (c, b) => ok(c.gait, b.gait) && clamp((c.gait.stepTimeCV - b.gait.stepTimeCV) * 14) },
  { id: 'evenness', label: 'Step evenness', sd: 26, obs: (c, b) => ok(c.gait, b.gait) && clamp((b.gait.stepRegularity - c.gait.stepRegularity) * 250) },
  { id: 'sway', label: 'Standing sway', sd: 24, obs: (c, b) => ok(c.balance, b.balance) && clamp((c.balance.swayRms / b.balance.swayRms - 1) * 40) },
  { id: 'romberg', label: 'Eyes-closed balance', sd: 22, obs: (c, b) => ok(c.balance, b.balance) && ok(c.balanceClosed, b.balanceClosed) && clamp(((c.balanceClosed.swayRms / c.balance.swayRms) / (b.balanceClosed.swayRms / b.balance.swayRms) - 1) * 70) },
  { id: 'tapping', label: 'Finger tapping', sd: 26, obs: (c, b) => tapImpact(c, b) },
  { id: 'hands-fine', label: 'Trouble with buttons and small objects', sd: 30, obs: (c) => (c.buttons ? 45 : 0) },
];
// Tapping: average % drop in tap rate across hands measured at both times, plus accuracy loss.
function tapImpact(c, b) {
  if (!c.tapping || !b.tapping) return false;
  const vals = ['right', 'left'].filter((h) => c.tapping[h]?.ok && b.tapping[h]?.ok).map((h) => {
    const drop = ((b.tapping[h].rate - c.tapping[h].rate) / b.tapping[h].rate) * 100;
    const acc = Math.max(0, b.tapping[h].accuracy - c.tapping[h].accuracy);
    return drop * 3 + acc * 2;
  });
  return vals.length ? clamp(vals.reduce((a, x) => a + x, 0) / vals.length) : false;
}
function ok(x, y) { return !!(x && x.ok && y && y.ok); }
function clamp(v) { return Math.max(-20, Math.min(100, v)); }

// Standard normal CDF (Abramowitz–Stegun approximation).
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * run(checkins) -> array (one per check-in, same order) of
 *   { cycle, date, mean, sd, low, high, priorMean, priorSd, surprise, pChanged, signals: [...] }
 * checkins must be sorted oldest first; the first one is the baseline.
 */
function run(checkins, params = {}) {
  const P = Object.assign({}, PARAMS, params);
  if (!checkins.length) return [];
  const base = checkins[0];
  const out = [];
  let m = 0, v = P.P0, prevCycle = base.cycle;
  checkins.forEach((c, k) => {
    // Predict: exposure = number of cycles since the previous check-in.
    const exposure = k === 0 ? 0 : Math.max(0, c.cycle - prevCycle);
    const priorMean = m + P.alpha * exposure;
    const priorVar = v + (k === 0 ? 0 : P.Q * Math.max(1, exposure));
    let mean = priorMean, vr = priorVar;
    const signals = [];
    if (k > 0) {
      // Sequential update with each available signal.
      for (const s of SIGNALS) {
        const z = s.obs(c, base);
        if (z === false || z == null || !isFinite(z)) { signals.push({ id: s.id, label: s.label, value: null }); continue; }
        const R = s.sd * s.sd;
        const K = vr / (vr + R);
        const before = mean;
        mean = mean + K * (z - mean);
        vr = (1 - K) * vr;
        signals.push({ id: s.id, label: s.label, value: +z.toFixed(0), pull: +(mean - before).toFixed(1) });
      }
      // Each signal's share of the information in this check-in (1/R normalized).
      const prec = signals.filter((g) => g.value != null).map((g) => 1 / (SIGNALS.find((x) => x.id === g.id).sd ** 2));
      const tot = prec.reduce((a, b) => a + b, 0);
      signals.forEach((g) => { if (g.value != null) g.share = +((1 / SIGNALS.find((x) => x.id === g.id).sd ** 2) / tot).toFixed(2); });
    }
    mean = Math.max(0, mean);
    const sd = Math.sqrt(vr);
    const priorSd = Math.sqrt(priorVar);
    // How unusual is this check-in relative to what the twin expected beforehand?
    const surpriseZ = k === 0 ? 0 : (mean - priorMean) / Math.sqrt(priorVar);
    out.push({
      cycle: c.cycle, date: c.date,
      mean: +mean.toFixed(1), sd: +sd.toFixed(1),
      low: +Math.max(0, mean - 1.64 * sd).toFixed(1), high: +Math.min(100, mean + 1.64 * sd).toFixed(1), // ~90% range
      priorMean: +priorMean.toFixed(1), priorSd: +priorSd.toFixed(1),
      surprise: k === 0 ? 'none' : surpriseZ > 1.5 ? 'worse' : surpriseZ < -1.5 ? 'better' : 'none',
      surpriseZ: +surpriseZ.toFixed(2),
      pChanged: k === 0 ? 0 : +(1 - phi((15 - mean) / sd)).toFixed(2), // chance impact exceeds 15 points
      signals: signals.map((g) => ({ ...g, score: g.value == null ? null : +Math.max(0, 100 - g.value).toFixed(1) })),
      // Function score for display: 100 = same as the first check-in, lower = more change.
      score: +(100 - mean).toFixed(1), scoreLow: +(100 - Math.min(100, mean + 1.64 * sd)).toFixed(1), scoreHigh: +(100 - Math.max(0, mean - 1.64 * sd)).toFixed(1),
      scorePrior: +(100 - priorMean).toFixed(1),
    });
    m = mean; v = vr; prevCycle = c.cycle;
  });
  return out;
}

/** Plain-language description of where the signals disagree with the twin. */
function disagreements(step) {
  const have = step.signals.filter((s) => s.value != null);
  if (have.length < 2) return null;
  const hiS = have.filter((s) => s.value - step.mean > 25), loS = have.filter((s) => step.mean - s.value > 25);
  const hi = hiS.map((s) => s.label.toLowerCase()), lo = loS.map((s) => s.label.toLowerCase());
  const plural = (arr) => arr.length > 1 || SIGNALS.find((x) => x.id === arr[0].id).plural;
  if (!hi.length && !lo.length) return 'All signals roughly agree with each other.';
  const parts = [];
  if (hi.length) parts.push(`${list(hi)} ${plural(hiS) ? 'suggest' : 'suggests'} more impact`);
  if (lo.length) parts.push(`${list(lo)} ${plural(loS) ? 'suggest' : 'suggests'} less`);
  const t = parts.join(', while ');
  return `The signals disagree: ${t.charAt(0).toUpperCase() + t.slice(1)}. The twin weighs each by how reliable it tends to be.`;
}
function list(a) { return a.length < 2 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

function interpretation(step, hasRecordedChange) {
  if (hasRecordedChange) return 'Recorded changes from baseline are shown below.';
  if (step.surprise !== 'none') return 'The experimental model estimate differs from the recorded signals; this model discrepancy alone does not establish deterioration.';
  return '';
}

const api = { run, disagreements, interpretation, SIGNALS, PARAMS };
export const FunctionTwin = api;
export default api;
