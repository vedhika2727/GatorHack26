const WORDS = { steady: 'Steady', watch: 'Worth mentioning', notable: 'Tell your care team', navy: '' };
export default function Chip({ level, children }) {
  return <span className={`chip ${level}`}><span className="dot" aria-hidden="true" />{children || WORDS[level]}</span>;
}
