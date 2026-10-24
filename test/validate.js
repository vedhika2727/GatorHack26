#!/usr/bin/env node
/*
 * Validate the step detector on real accelerometer data (for example a trial
 * from the WearGait-PD dataset, or a raw recording from your own phone).
 *
 * Usage:
 *   node test/validate.js trial.csv --steps 52
 *   node test/validate.js trial.csv --cadence 108 --time t --ax accX --ay accY --az accZ --time-unit s --accel-unit g
 *
 * Options:
 *   --steps N        true number of steps (e.g. counted, or from a walkway reference)
 *   --cadence N      true cadence in steps/min (alternative to --steps)
 *   --time/--ax/--ay/--az   column names (defaults: time, ax, ay, az)
 *   --time-unit      ms (default) or s
 *   --accel-unit     ms2 (default, m/s^2) or g
 *   --trim S         seconds trimmed from each end (default 0 for lab trials)
 * Compare a whole folder by running it in a shell loop and collecting the error column.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import Gait from '../src/core/gait.js';
const __filename = fileURLToPath(import.meta.url);

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(1); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const cols = { t: opt('time', 'time'), ax: opt('ax', 'ax'), ay: opt('ay', 'ay'), az: opt('az', 'az') };
const tMul = opt('time-unit', 'ms') === 's' ? 1000 : 1;
const aMul = opt('accel-unit', 'ms2') === 'g' ? 9.80665 : 1;

const lines = fs.readFileSync(args[0], 'utf8').trim().split(/\r?\n/);
const sep = lines[0].includes('\t') ? '\t' : ',';
const head = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
const idx = Object.fromEntries(Object.entries(cols).map(([k, name]) => [k, head.indexOf(name)]));
for (const [k, i] of Object.entries(idx)) if (i < 0) { console.error(`Column "${cols[k]}" not found. Columns are: ${head.join(', ')}`); process.exit(1); }
const samples = lines.slice(1).map((l) => { const c = l.split(sep); return { t: +c[idx.t] * tMul, ax: +c[idx.ax] * aMul, ay: +c[idx.ay] * aMul, az: +c[idx.az] * aMul }; }).filter((s) => isFinite(s.t));

const r = Gait.analyze(samples, { trimSeconds: +opt('trim', 0) });
if (!r.ok) { console.error('Analysis failed:', r.reason); process.exit(1); }
console.log(`file: ${args[0]}\nsamples: ${samples.length} at ~${r.sampleRateHz} Hz, analysed ${r.durationSec} s`);
console.log(`detected: ${r.steps} steps, cadence ${r.cadence} steps/min, step-time CV ${r.stepTimeCV}%, regularity ${r.stepRegularity}`);
const ts = opt('steps'), tc = opt('cadence');
if (ts) console.log(`step count error: ${r.steps - ts} (${(((r.steps - ts) / ts) * 100).toFixed(1)}%)`);
if (tc) console.log(`cadence error: ${(r.cadence - tc).toFixed(1)} steps/min (${(((r.cadence - tc) / tc) * 100).toFixed(1)}%)`);
