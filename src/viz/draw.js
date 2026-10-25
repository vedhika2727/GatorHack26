/*
 * Chemo Nerve Check — twin drawing (SVG, no libraries)
 *   Twin.renderBody(svg, symptoms)       front body; feet/hands glow with reported symptoms
 *   new Twin.Walker(svg)                 side-view walker replaying real step times
 *   Twin.sparkline(svg, values, opts)    small trend chart across cycles
 */
const NS = 'http://www.w3.org/2000/svg';
let scope = null; // element whose CSS variables the current chart reads (so a dark panel can restyle its own chart)
const css = (name) => getComputedStyle(scope || document.documentElement).getPropertyValue(name).trim();
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Interpolate amber -> brick as the score rises.
function glowColor(score) {
  const a = css('--rose') || '#C23B74', b = css('--red') || '#B3261E';
  const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
  const t = Math.min(1, Math.max(0, (score - 2) / 6));
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

function renderBody(svg, symptoms = {}) {
  svg.innerHTML = '';
  const fill = css('--body'), stroke = css('--body-line');
  const defs = el('defs', {}, svg);
  const feet = Math.max(symptoms.feetNumb || 0, symptoms.feetPain || 0);
  const hands = symptoms.handsNumb || 0;
  [['gf', feet], ['gh', hands]].forEach(([id, s]) => {
    const g = el('radialGradient', { id }, defs);
    el('stop', { offset: '0%', 'stop-color': glowColor(s), 'stop-opacity': Math.min(0.95, 0.25 + s / 11) }, g);
    el('stop', { offset: '100%', 'stop-color': glowColor(s), 'stop-opacity': 0 }, g);
  });
  const body = el('g', { fill, stroke, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, svg);
  el('circle', { cx: 100, cy: 32, r: 20 }, body);
  el('path', { d: 'M78 60 Q100 52 122 60 L130 150 Q100 162 70 150 Z' }, body);
  el('path', { d: 'M78 62 Q62 70 58 100 L48 182 L58 184 L70 108 Z' }, body);
  el('path', { d: 'M122 62 Q138 70 142 100 L152 182 L142 184 L130 108 Z' }, body);
  el('path', { d: 'M72 150 L96 152 L92 300 L78 300 Z' }, body);
  el('path', { d: 'M104 152 L128 150 L122 300 L108 300 Z' }, body);
  el('ellipse', { cx: 52, cy: 192, rx: 9, ry: 12 }, body);
  el('ellipse', { cx: 148, cy: 192, rx: 9, ry: 12 }, body);
  el('path', { d: 'M76 298 L94 298 L96 312 L68 314 Z' }, body);
  el('path', { d: 'M106 298 L124 298 L132 314 L104 312 Z' }, body);
  // Nerve pathways, faint
  const nerve = el('g', { stroke: css('--body-line'), 'stroke-width': 1, fill: 'none', 'stroke-dasharray': '2 4', opacity: 0.9 }, svg);
  el('path', { d: 'M100 60 L100 150 M100 150 Q88 220 86 300 M100 150 Q112 220 115 300 M96 64 Q70 110 52 186 M104 64 Q130 110 148 186' }, nerve);
  const glow = (cx, cy, s, id) => { if (s > 0) el('circle', { cx, cy, r: 14 + s * 2.6, fill: `url(#${id})` }, svg); };
  glow(84, 306, feet, 'gf'); glow(118, 306, feet, 'gf');
  glow(52, 192, hands, 'gh'); glow(148, 192, hands, 'gh');
  const label = (x, y, txt, anchor) => { const t = el('text', { x, y, 'text-anchor': anchor, 'font-size': 14, fill: css('--ink-2'), 'font-family': 'inherit' }, svg); t.textContent = txt; };
  label(100, 326, `Feet ${feet}/10`, 'middle');
  label(6, 222, `Hands`, 'start'); label(6, 235, `${hands}/10`, 'start');
}

/* ---------------- Walker ---------------- */
const walkers = new Set();
let rafId = 0, t0 = 0;
function loop(now) {
  if (!t0) t0 = now;
  for (const w of walkers) w.draw((now - t0) / 1000);
  rafId = walkers.size ? requestAnimationFrame(loop) : 0;
}

class Walker {
  constructor(svg) {
    this.svg = svg; this.steps = []; this.empty = true;
    svg.innerHTML = '';
    const ground = css('--line');
    el('line', { x1: 0, y1: 102, x2: 360, y2: 102, stroke: ground, 'stroke-width': 2 }, svg);
    this.prints = el('g', {}, svg);
    this.fig = el('g', { stroke: css('--ink'), 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, svg);
    this.head = el('circle', { r: 8, fill: css('--ink'), stroke: 'none' }, this.fig);
    this.torso = el('line', {}, this.fig);
    this.legA = el('polyline', {}, this.fig);
    this.legB = el('polyline', {}, this.fig);
    this.msg = el('text', { x: 180, y: 60, 'text-anchor': 'middle', 'font-size': 14, fill: css('--ink-2'), 'font-family': 'inherit' }, svg);
  }
  setSteps(stepTimes) {
    this.steps = (stepTimes || []).slice();
    this.empty = this.steps.length < 4;
    this.msg.textContent = this.empty ? 'No walking test for this check-in' : '';
    this.fig.style.display = this.empty ? 'none' : '';
    if (!this.empty) {
      const iv = []; for (let i = 1; i < this.steps.length; i++) iv.push(this.steps[i] - this.steps[i - 1]);
      const s = [...iv].sort((a, b) => a - b); this.med = s[Math.floor(s.length / 2)];
      this.start = this.steps[0]; this.span = this.steps[this.steps.length - 1] - this.start + this.med;
    }
    walkers.add(this);
    if (reduceMotion()) { walkers.delete(this); this.draw(null); }
    else if (!rafId) rafId = requestAnimationFrame(loop);
  }
  stop() { walkers.delete(this); }
  draw(time) {
    const st = this.steps; this.prints.innerHTML = '';
    if (this.empty) return;
    const V = 70, FOOTX = 288, HIP = { x: 270, y: 58 }, L = 44;
    // Static mode (reduced motion): show the last ~4 seconds as a footprint strip.
    const tt = time == null ? this.start + Math.min(this.span, 4.2) : this.start + (time % this.span);
    let k = 0; while (k < st.length - 1 && st[k + 1] <= tt) k++;
    const next = st[k + 1] ?? st[k] + this.med;
    const iv = next - st[k];
    const swingDur = Math.min(iv, this.med * 1.25);
    const ph = Math.min(1, (tt - st[k]) / swingDur);
    const paused = tt - st[k] > swingDur;
    const amp = 0.42;
    const ang = paused ? 0 : amp * Math.cos(Math.PI * ph); // stance leg: +amp -> -amp
    const lead = k % 2;
    const legs = [ang, -ang];
    const bob = paused ? 0 : -2 * Math.abs(Math.sin(Math.PI * ph));
    const hip = { x: HIP.x, y: HIP.y + bob };
    const pts = (a, swinging) => {
      const knee = { x: hip.x + Math.sin(a) * L * 0.52, y: hip.y + Math.cos(a) * L * 0.52 };
      const bend = swinging && !paused ? 0.35 * Math.sin(Math.PI * ph) : 0;
      const foot = { x: knee.x + Math.sin(a - bend) * L * 0.5, y: knee.y + Math.cos(a - bend) * L * 0.5 };
      return `${hip.x},${hip.y} ${knee.x},${knee.y} ${foot.x},${Math.min(100, foot.y)}`;
    };
    this.legA.setAttribute('points', pts(legs[lead], false));
    this.legB.setAttribute('points', pts(legs[1 - lead], true));
    this.torso.setAttribute('x1', hip.x); this.torso.setAttribute('y1', hip.y);
    this.torso.setAttribute('x2', hip.x + 3); this.torso.setAttribute('y2', hip.y - 32);
    this.head.setAttribute('cx', hip.x + 4); this.head.setAttribute('cy', hip.y - 42);
    // Footprints of steps already taken, scrolling left at constant speed.
    const teal = css('--navy'), amber = css('--rose');
    for (let i = 0; i <= k; i++) {
      const x = FOOTX - (tt - st[i]) * V - (i % 2 ? 0 : 6);
      if (x < -10) continue;
      const pause = i > 0 && st[i] - st[i - 1] > 1.8 * this.med;
      el('ellipse', { cx: x, cy: i % 2 ? 108 : 113, rx: 7, ry: 3.2, fill: pause ? amber : teal, opacity: 0.85 }, this.prints);
      if (pause) { const t = el('text', { x: x + 10, y: 92, 'font-size': 14, fill: amber, 'font-family': 'inherit' }, this.prints); t.textContent = 'pause'; }
    }
  }
}

/* ---------------- Sparkline ---------------- */
function sparkline(svg, values, opts = {}) {
  svg.innerHTML = '';
  const W = 220, H = 64, P = 8;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null && isFinite(p.v));
  if (!pts.length) return;
  let lo = opts.min ?? Math.min(...pts.map((p) => p.v)), hi = opts.max ?? Math.max(...pts.map((p) => p.v));
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const x = (i) => values.length === 1 ? W / 2 : P + (i / (values.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const base = pts[0].v;
  el('line', { x1: 0, x2: W, y1: y(base), y2: y(base), stroke: css('--line'), 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' }, svg);
  el('polyline', { points: pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' '), fill: 'none', stroke: css('--navy'), 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, svg);
  for (const p of pts) {
    const sel = p.i === opts.selected;
    el('circle', { cx: x(p.i), cy: y(p.v), r: sel ? 5 : 3, fill: sel ? css('--ink') : css('--navy') }, svg);
  }
}

function txt(parent, x, y, s, attrs = {}) {
  const t = el('text', Object.assign({ x, y, 'font-size': 15, fill: css('--ink-2'), 'font-family': 'inherit' }, attrs), parent);
  t.textContent = s; return t;
}

/* ---------------- Nerve twin band chart ---------------- */
// steps: output of NerveTwin.run; observations shown as faint dots behind the estimate.
function bandChart(svg, steps, selected) {
  svg.innerHTML = '';
  const W = 600, H = 250, L = 38, R = 14, T = 26, B = 34;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const n = steps.length;
  // Function score: 100 = same as the first check-in, so the line falls as function changes.
  const bottom = Math.max(0, Math.min(60, Math.floor((Math.min(...steps.map((s) => s.scoreLow)) - 10) / 20) * 20));
  const x = (i) => n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R);
  const y = (v) => T + (1 - (Math.max(bottom, Math.min(100, v)) - bottom) / (100 - bottom)) * (H - T - B);
  const line = css('--line'), teal = css('--navy'), ink = css('--ink');
  for (let v = bottom; v <= 100; v += 20) {
    el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: line, 'stroke-width': 1 }, svg);
    txt(svg, L - 6, y(v) + 4, v, { 'text-anchor': 'end', 'font-size': 14 });
  }
  if (selected != null) el('line', { x1: x(selected), x2: x(selected), y1: T, y2: H - B, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.5 }, svg);
  // Raw signals, faint
  steps.forEach((s, i) => s.signals.forEach((g, j) => {
    if (g.value == null) return;
    el('circle', { cx: x(i) + (j - 3) * 3, cy: y(g.score), r: 2.6, fill: css('--ink-2'), opacity: 0.25 }, svg);
  }));
  // Uncertainty band
  const up = steps.map((s, i) => `${x(i)},${y(s.scoreHigh)}`), dn = steps.map((s, i) => `${x(i)},${y(s.scoreLow)}`).reverse();
  el('polygon', { points: up.concat(dn).join(' '), fill: css('--navy-wash'), stroke: 'none', opacity: 0.95 }, svg);
  el('polyline', { points: steps.map((s, i) => `${x(i)},${y(s.score)}`).join(' '), fill: 'none', stroke: teal, 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
  steps.forEach((s, i) => {
    el('circle', { cx: x(i), cy: y(s.score), r: i === selected ? 7 : 5, fill: teal, stroke: css('--surface'), 'stroke-width': 2 }, svg);
    txt(svg, x(i), H - 10, 'C' + s.cycle, { 'text-anchor': 'middle', 'font-weight': i === selected ? 700 : 400, fill: i === selected ? ink : css('--ink-2') });
  });
}

/* ---------------- Tumor vs nerve timeline ---------------- */
function dualTimeline(svg, tumor, nerve) {
  svg.innerHTML = '';
  const W = 600, H = 320, L = 40, R = 14;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const dates = [...tumor.map((p) => p.date), ...nerve.map((p) => p.date)].map((d) => new Date(d + 'T12:00:00').getTime());
  const d0 = Math.min(...dates), d1 = Math.max(...dates);
  const x = (d) => d1 === d0 ? (L + W - R) / 2 : L + ((new Date(d + 'T12:00:00').getTime() - d0) / (d1 - d0)) * (W - L - R);
  const line = css('--line'), teal = css('--navy'), ink = css('--ink'), violet = css('--rose') || ink;
  // Panel A: tumor
  const A = { t: 36, b: 130 }, Bp = { t: 192, b: 282 };
  const tmax = Math.max(10, ...tumor.map((p) => p.max)) * 1.15;
  const ya = (v) => A.t + (1 - v / tmax) * (A.b - A.t);
  txt(svg, L, 18, 'Measured tumor size, per scan type (mm)', { 'font-weight': 700, fill: ink });
  el('line', { x1: L, x2: W - R, y1: A.b, y2: A.b, stroke: line }, svg);
  if (tumor.length) {
    const kinds = [...new Set(tumor.map((p) => p.kind))];
    kinds.forEach((k, ki) => {
      const pts = tumor.filter((p) => p.kind === k);
      el('polyline', { points: pts.map((p) => `${x(p.date)},${ya(p.value)}`).join(' '), fill: 'none', stroke: violet, 'stroke-width': 3, 'stroke-dasharray': ki ? '7 5' : 'none' }, svg);
      const lp = pts[pts.length - 1];
      if (kinds.length > 1) txt(svg, x(lp.date) + 8, ya(lp.value) - 8, k, { fill: violet, 'font-size': 14, 'font-weight': 700 });
    });
    for (const p of tumor) {
      if (p.reads > 1 && p.max - p.min > 0.5) {
        el('line', { x1: x(p.date), x2: x(p.date), y1: ya(p.max), y2: ya(p.min), stroke: violet, 'stroke-width': 8, opacity: 0.25, 'stroke-linecap': 'round' }, svg);
        txt(svg, x(p.date) - 8, ya(p.max) - 6, `${p.reads} doctors: ${Math.round(p.min)}–${Math.round(p.max)}`, { 'text-anchor': 'end', fill: violet, 'font-size': 14, 'font-weight': 700 });
      }
      el('circle', { cx: x(p.date), cy: ya(p.value), r: 5, fill: violet, stroke: css('--surface'), 'stroke-width': 2 }, svg);
      txt(svg, x(p.date), ya(p.value) + 18, Math.round(p.value), { 'text-anchor': 'middle', fill: ink, 'font-size': 14 });
      txt(svg, x(p.date), A.b + 14, p.kind, { 'text-anchor': 'middle', 'font-size': 13 });
    }
  } else txt(svg, (L + W) / 2, (A.t + A.b) / 2, 'Add a scan report to see tumor size here', { 'text-anchor': 'middle' });
  // Panel B: nerve twin
  const ymaxN = 100;
  const yb = (v) => Bp.t + (1 - Math.min(ymaxN, v) / ymaxN) * (Bp.b - Bp.t);
  txt(svg, L, Bp.t - 18, 'Function score: 100 = same as your first check-in', { 'font-weight': 700, fill: ink });
  el('line', { x1: L, x2: W - R, y1: Bp.b, y2: Bp.b, stroke: line }, svg);
  if (nerve.length) {
    const up = nerve.map((s) => `${x(s.date)},${yb(s.scoreHigh)}`), dn = nerve.map((s) => `${x(s.date)},${yb(s.scoreLow)}`).reverse();
    el('polygon', { points: up.concat(dn).join(' '), fill: css('--navy-wash') }, svg);
    el('polyline', { points: nerve.map((s) => `${x(s.date)},${yb(s.score)}`).join(' '), fill: 'none', stroke: teal, 'stroke-width': 3 }, svg);
    for (const s of nerve) {
      el('circle', { cx: x(s.date), cy: yb(s.score), r: 4.5, fill: teal }, svg);
      txt(svg, x(s.date), Bp.b + 16, 'C' + s.cycle, { 'text-anchor': 'middle', 'font-size': 14 });
    }
  }
}

/* ---------------- Spot chart (dark reading-room panel on the Scans page) ---------------- */
// data: Scans.lesionTracks(scans). Each measured spot is one line across scan dates.
// opts: { selected: date index, focus: track index | null }. Columns carry data-k for clicks.
function spotChart(svg, data, opts = {}) {
  svg.innerHTML = '';
  const W = Math.max(300, Math.round(svg.clientWidth || svg.parentNode?.clientWidth || 600));
  const wide = W >= 640;
  const H = wide ? 330 : 240, L = 44, R = wide ? 210 : 18, T = 22, B = 46;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const { dates, tracks } = data;
  scope = svg;
  const ink = css('--night-ink'), ink2 = css('--night-ink-2'), line = css('--night-line'), hi = css('--rose-glow'), raised = css('--night-2');
  const night = css('--night');
  scope = null;
  // lines draw themselves in during the first moments after the chart appears, not on every redraw
  if (!svg.dataset.born) svg.dataset.born = Date.now();
  const intro = Date.now() - svg.dataset.born < 600;
  const n = dates.length;
  const x = (k) => n === 1 ? (L + W - R) / 2 : L + 18 + (k / (n - 1)) * (W - L - R - 36);
  const top = Math.max(10, ...tracks.flatMap((t) => t.points.filter(Boolean).map((p) => p.max))) * 1.12;
  const step = top > 60 ? 20 : top > 30 ? 10 : 5;
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const colW = n === 1 ? 120 : (W - L - R - 36) / (n - 1);
  // selected column
  if (opts.selected != null) el('rect', { x: x(opts.selected) - Math.min(48, colW / 2), y: T - 10, width: Math.min(96, colW), height: H - T - B + 20, rx: 14, fill: raised, class: 'sel-col' }, svg);
  for (let v = 0; v <= top; v += step) {
    el('line', { x1: L, x2: W - R + (wide ? 10 : 0), y1: y(v), y2: y(v), stroke: line, 'stroke-width': 1 }, svg);
    txt(svg, L - 8, y(v) + 5, v, { 'text-anchor': 'end', fill: ink2, 'font-size': 13 });
  }
  txt(svg, L - 8, T - 8, 'mm', { 'text-anchor': 'end', fill: ink2, 'font-size': 12 });
  const order = tracks.map((t, i) => i).sort((a, b) => (a === opts.focus) - (b === opts.focus));
  for (const i of order) {
    const t = tracks[i], on = opts.focus == null || opts.focus === i;
    const col = opts.focus === i ? hi : ink;
    const pts = t.points.map((p, k) => p && { k, p }).filter(Boolean);
    if (pts.length > 1) {
      const d = pts.map(({ k, p }) => `${x(k)},${y(p.mm)}`).join(' ');
      el('polyline', { points: d, fill: 'none', stroke: col, 'stroke-width': opts.focus === i ? 3.5 : 2, opacity: on ? 1 : 0.28, 'stroke-linejoin': 'round', pathLength: 1, class: intro ? 'draw' : '', style: `--d:${order.indexOf(i) * 120}ms` }, svg);
      el('polyline', { points: d, fill: 'none', stroke: 'transparent', 'stroke-width': 16, 'data-spot': i, style: 'cursor:pointer' }, svg);
    }
    for (const { k, p } of pts) {
      if (p.max - p.min > 0.5) el('line', { x1: x(k), x2: x(k), y1: y(p.max), y2: y(p.min), stroke: hi, 'stroke-width': 10, 'stroke-linecap': 'round', opacity: on ? 0.6 : 0.18 }, svg);
      el('circle', { cx: x(k), cy: y(p.mm), r: opts.focus === i ? 6 : 4.5, fill: col, stroke: night, 'stroke-width': 2, opacity: on ? 1 : 0.35, class: intro ? 'pop' : '', style: `--d:${300 + k * 90}ms`, 'data-spot': i }, svg);
    }
  }
  // end labels, nudged apart so they never overlap
  if (wide) {
    const labs = tracks.map((t, i) => {
      const lastK = t.points.reduce((m, p, k) => (p ? k : m), 0);
      return { i, yy: y(t.points[lastK].mm), t };
    }).sort((a, b) => a.yy - b.yy);
    for (let j = 1; j < labs.length; j++) if (labs[j].yy - labs[j - 1].yy < 40) labs[j].yy = labs[j - 1].yy + 40;
    const lx = W - R + 22;
    for (const lb of labs) {
      const on = opts.focus == null || opts.focus === lb.i;
      const name = lb.t.location.length > 24 ? lb.t.location.slice(0, 23) + '…' : lb.t.location;
      txt(svg, lx, lb.yy - 2, name, { fill: opts.focus === lb.i ? hi : ink, 'font-size': 13.5, 'font-weight': 600, opacity: on ? 1 : 0.45 });
      txt(svg, lx, lb.yy + 15, lb.t.changePct == null ? `${lb.t.last} mm, new` : `${lb.t.last} mm, ${lb.t.changePct > 0 ? '+' : ''}${lb.t.changePct}% since first`, { fill: ink2, 'font-size': 12.5, opacity: on ? 1 : 0.45 });
    }
  }
  dates.forEach((d, k) => {
    const dt = new Date(d + 'T12:00:00');
    txt(svg, x(k), H - 22, dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), { 'text-anchor': 'middle', fill: k === opts.selected ? ink : ink2, 'font-size': 13.5, 'font-weight': k === opts.selected ? 700 : 400 });
    txt(svg, x(k), H - 6, dt.getFullYear(), { 'text-anchor': 'middle', fill: ink2, 'font-size': 11.5 });
    svg.insertBefore(el('rect', { x: x(k) - Math.min(48, colW / 2), y: 0, width: Math.min(96, colW), height: H, fill: 'transparent', 'data-k': k, style: 'cursor:pointer' }), svg.firstChild); // under the lines, so lines stay tappable
  });
}

export { renderBody, Walker, sparkline, bandChart, dualTimeline, spotChart };
