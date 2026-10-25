import { useId } from 'react';

// Steadi mark: a white sun resting on a level horizon, in the sky palette.
export default function Logo({ size = 32 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4F79B8" />
          <stop offset="1" stopColor="#A9C3E4" />
        </linearGradient>
        <clipPath id={`tile${id}`}><rect width="32" height="32" rx="9" /></clipPath>
      </defs>
      <g clipPath={`url(#tile${id})`}>
        <rect width="32" height="32" fill={`url(#sky${id})`} />
        <path d="M9.5 21a6.5 6.5 0 0 1 13 0z" fill="#fff" />
        <rect y="21" width="32" height="11" fill="#8E9A6A" />
        <rect x="4" y="20.1" width="24" height="1.8" rx="0.9" fill="#fff" />
      </g>
    </svg>
  );
}
