// Phone motion recording for the walk and balance tests.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function abortError() {
  const error = new Error('Motion recording was cancelled.');
  error.name = 'AbortError';
  return error;
}
function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}
export function speak(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (_) {}
}
export const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };

export async function requestMotion({ signal } = {}) {
  throwIfAborted(signal);
  if (!window.isSecureContext) throw new Error('Motion sensors only work on a secure (https) page. Open the deployed site on your phone, or use a sample.');
  if (typeof DeviceMotionEvent === 'undefined') throw new Error("This browser doesn't give access to motion sensors. Try Safari or Chrome on a phone, or use a sample.");
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const r = await DeviceMotionEvent.requestPermission(); // iPhone: must run inside a tap
    if (r !== 'granted') throw new Error('Motion access was not allowed. In Safari, reload the page and tap "Allow" when asked.');
  }
  throwIfAborted(signal);
}

/**
 * record({ seconds, leadIn, startWord, onTick }) -> samples
 * onTick({ phase: 'leadin'|'recording', remaining, progress })
 */
export async function record({ seconds, leadIn = 5, startWord, onTick, signal }) {
  const samples = [];
  const onMotion = (e) => {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    const r = e.rotationRate || {};
    samples.push({ t: performance.now(), ax: a.x, ay: a.y, az: a.z, gx: r.alpha, gy: r.beta, gz: r.gamma });
  };
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch (_) {}
  try {
    for (let i = leadIn; i > 0; i--) {
      throwIfAborted(signal);
      onTick({ phase: 'leadin', remaining: i, progress: 0 });
      await sleep(1000);
    }
    throwIfAborted(signal);
    window.addEventListener('devicemotion', onMotion);
    speak(startWord); buzz(200);
    const start = performance.now();
    for (;;) {
      throwIfAborted(signal);
      const el = (performance.now() - start) / 1000;
      if (el >= 1.5 && samples.length < 5) throw new Error("This device isn't sending motion data. Open the site on a phone, or use a sample.");
      onTick({ phase: 'recording', remaining: Math.max(0, Math.ceil(seconds - el)), progress: Math.min(1, el / seconds) });
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
