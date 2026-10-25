import { requestMotion, record } from '../src/lib/sensors.js';

let failed = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!condition) failed++;
}

const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const oldDeviceMotionEvent = Object.getOwnPropertyDescriptor(globalThis, 'DeviceMotionEvent');
const listeners = new Map();
globalThis.window = {
  isSecureContext: true,
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

async function rejects(promise, pattern) {
  try {
    await promise;
    return false;
  } catch (error) {
    return pattern.test(error.message);
  }
}

try {
  globalThis.DeviceMotionEvent = class {
    static async requestPermission() { return 'denied'; }
  };
  check('permission denial is surfaced', await rejects(requestMotion(), /not allowed/));

  delete globalThis.DeviceMotionEvent;
  check('unavailable sensor API is surfaced', await rejects(requestMotion(), /doesn't give access/));

  globalThis.DeviceMotionEvent = class {};
  const controller = new AbortController();
  const cancelled = record({
    seconds: 10,
    leadIn: 0,
    signal: controller.signal,
    onTick: ({ phase }) => { if (phase === 'recording') controller.abort(); },
  });
  check('cancelling recording rejects as aborted', await rejects(cancelled, /cancelled/));
  check('cancelled recording removes its sensor listener', !listeners.has('devicemotion'));

  const noSamples = record({ seconds: 5, leadIn: 0, onTick: () => {} });
  check('no sensor readings are rejected', await rejects(noSamples, /isn't sending motion data/));
  check('failed recording removes its sensor listener', !listeners.has('devicemotion'));
} finally {
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
  else delete globalThis.window;
  if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
  else delete globalThis.navigator;
  if (oldDeviceMotionEvent) Object.defineProperty(globalThis, 'DeviceMotionEvent', oldDeviceMotionEvent);
  else delete globalThis.DeviceMotionEvent;
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
