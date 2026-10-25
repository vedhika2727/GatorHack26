// Steadi mark: a sun resting just above a level horizon (used for the browser tab and small spots).
export default function Logo({ size = 32, light = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="17" r="8" fill={light ? '#FFFFFF' : '#3C68A8'} />
      <rect x="3" y="28" width="34" height="3.4" rx="1.7" fill={light ? 'rgba(255,255,255,.85)' : '#5F7A3A'} />
    </svg>
  );
}

// Steadi wordmark: the dot on the i is a small sun, with a level line under the word.
export function Wordmark({ light = false }) {
  return (
    <span className={`wordmark${light ? ' light' : ''}`} aria-hidden="true">stead<span className="wm-i">ı</span></span>
  );
}
