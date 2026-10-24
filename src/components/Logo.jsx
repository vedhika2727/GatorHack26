export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--navy)" />
      <path d="M7 19.5c2.5 0 3-7 5.5-7s2.5 9 5 9 2.5-6 5-6 1.5 2 2.5 2" stroke="var(--rose-wash)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
