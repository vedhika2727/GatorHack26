/*
 * Chemo Nerve Check — change rules.
 * Deterministic comparisons of each check-in against the patient's own
 * baseline (first check-in). The AI explains these flags; it never decides them.
 * Thresholds are conservative, illustrative values for a hackathon prototype,
 * not validated clinical cut-offs.
 */
(function (root) {
  'use strict';

  const SYMPTOMS = [
    { key: 'feetNumb', label: 'numbness or tingling in the feet' },
    { key: 'handsNumb', label: 'numbness or tingling in the hands' },
    { key: 'feetPain', label: 'burning or pain in the feet' },
  ];

  function pct(a, b) { return b ? ((a - b) / b) * 100 : 0; }

  /**
   * compare(baseline, current) -> array of { id, level: 'watch'|'notable', text }
   * baseline/current: check-in objects { symptoms, gait, balance, falls, buttons }
   */
  function compare(base, cur) {
    const flags = [];
    if (!base || !cur || base === cur) return flags;
    const g0 = base.gait, g1 = cur.gait, b0 = base.balance, b1 = cur.balance;

    if (g0 && g1 && g0.ok && g1.ok) {
      const dc = pct(g1.cadence, g0.cadence);
      if (dc <= -15) flags.push({ id: 'cadence', level: 'notable', text: `Walking pace is ${Math.abs(dc).toFixed(0)}% slower than at baseline (${g0.cadence} → ${g1.cadence} steps/min).` });
      else if (dc <= -8) flags.push({ id: 'cadence', level: 'watch', text: `Walking pace is ${Math.abs(dc).toFixed(0)}% slower than at baseline (${g0.cadence} → ${g1.cadence} steps/min).` });

      const dr = g1.stepRegularity - g0.stepRegularity;
      if (dr <= -0.2) flags.push({ id: 'regularity', level: 'notable', text: `Steps are much less even than at baseline (regularity ${g0.stepRegularity} → ${g1.stepRegularity}).` });
      else if (dr <= -0.1) flags.push({ id: 'regularity', level: 'watch', text: `Steps are less even than at baseline (regularity ${g0.stepRegularity} → ${g1.stepRegularity}).` });

      const dv = g1.stepTimeCV - g0.stepTimeCV;
      if (dv >= 3) flags.push({ id: 'variability', level: 'notable', text: `Step timing varies much more than at baseline (${g0.stepTimeCV}% → ${g1.stepTimeCV}%).` });
      else if (dv >= 1.5) flags.push({ id: 'variability', level: 'watch', text: `Step timing varies more than at baseline (${g0.stepTimeCV}% → ${g1.stepTimeCV}%).` });

      if (g1.hesitations > g0.hesitations) flags.push({ id: 'hesitations', level: g1.hesitations >= 2 ? 'notable' : 'watch', text: `${g1.hesitations} pause${g1.hesitations > 1 ? 's' : ''} or hesitation${g1.hesitations > 1 ? 's' : ''} during the walk (baseline: ${g0.hesitations}).` });
    }

    if (b0 && b1 && b0.ok && b1.ok) {
      const ds = pct(b1.swayRms, b0.swayRms);
      if (ds >= 100) flags.push({ id: 'sway', level: 'notable', text: `Body sway while standing is ${(b1.swayRms / b0.swayRms).toFixed(1)}× baseline.` });
      else if (ds >= 50) flags.push({ id: 'sway', level: 'watch', text: `Body sway while standing is ${ds.toFixed(0)}% higher than at baseline.` });
    }

    if (b0?.ok && b1?.ok && base.balanceClosed?.ok && cur.balanceClosed?.ok) {
      const r0 = base.balanceClosed.swayRms / b0.swayRms, r1 = cur.balanceClosed.swayRms / b1.swayRms;
      const d = pct(r1, r0);
      if (d >= 60) flags.push({ id: 'romberg', level: 'notable', text: `With eyes closed, sway rises much more than at baseline (${r0.toFixed(1)}× → ${r1.toFixed(1)}× eyes-open sway).` });
      else if (d >= 30) flags.push({ id: 'romberg', level: 'watch', text: `With eyes closed, sway rises more than at baseline (${r0.toFixed(1)}× → ${r1.toFixed(1)}× eyes-open sway).` });
    }
    for (const h of ['right', 'left']) {
      const t0 = base.tapping?.[h], t1 = cur.tapping?.[h];
      if (!t0?.ok || !t1?.ok) continue;
      const d = pct(t1.rate, t0.rate);
      if (d <= -30) flags.push({ id: 'tap-' + h, level: 'notable', text: `${h === 'right' ? 'Right' : 'Left'}-hand tapping is ${Math.abs(d).toFixed(0)}% slower than at baseline (${t0.rate} → ${t1.rate} taps/s).` });
      else if (d <= -15) flags.push({ id: 'tap-' + h, level: 'watch', text: `${h === 'right' ? 'Right' : 'Left'}-hand tapping is ${Math.abs(d).toFixed(0)}% slower than at baseline (${t0.rate} → ${t1.rate} taps/s).` });
    }
    for (const s of SYMPTOMS) {
      const a = base.symptoms?.[s.key] ?? 0, c = cur.symptoms?.[s.key] ?? 0;
      if (c - a >= 4 || c >= 7) flags.push({ id: s.key, level: 'notable', text: `Reports ${s.label} at ${c}/10 (baseline ${a}/10).` });
      else if (c - a >= 2) flags.push({ id: s.key, level: 'watch', text: `Reports ${s.label} at ${c}/10 (baseline ${a}/10).` });
    }
    if (cur.buttons && !base.buttons) flags.push({ id: 'buttons', level: 'watch', text: 'New trouble with buttons, zips, or picking up small objects.' });
    if (cur.falls === 'fall') flags.push({ id: 'falls', level: 'notable', text: 'Reports a fall since the last check-in.' });
    else if (cur.falls === 'near') flags.push({ id: 'falls', level: 'watch', text: 'Reports a near-fall (tripping or catching themselves) since the last check-in.' });
    return flags;
  }

  function overall(flags) {
    if (flags.some((f) => f.level === 'notable')) return 'notable';
    if (flags.length) return 'watch';
    return 'steady';
  }

  const api = { compare, overall, SYMPTOMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Trends = api;
})(typeof window !== 'undefined' ? window : globalThis);
