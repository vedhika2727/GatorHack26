// Text with known report words made tappable. Tapping one shows its plain meaning in a small popover.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Glossary from '../core/glossary.js';

export const niceWord = (w) => { const t = w === w.toUpperCase() ? w.toLowerCase() : w; return t[0].toUpperCase() + t.slice(1); };

const OPEN_EVENT = 'glossary-open';
let nextId = 1;

function Term({ entry, children }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const [up, setUp] = useState(false);
  const id = useRef(nextId++);
  const wrap = useRef(null), pop = useRef(null);

  useEffect(() => {
    const other = (e) => { if (e.detail !== id.current) setOpen(false); };
    addEventListener(OPEN_EVENT, other);
    return () => removeEventListener(OPEN_EVENT, other);
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  // Keep the popover inside the screen.
  useLayoutEffect(() => {
    if (!open || !pop.current) return;
    const r = pop.current.getBoundingClientRect(), pad = 12;
    const over = r.right - (window.innerWidth - pad), under = pad - r.left;
    setShift(over > 0 ? -over : under > 0 ? under : 0);
    if (r.bottom > window.innerHeight - 120) setUp(true);
  }, [open]);

  const label = niceWord(children);
  return (
    <span className="term-wrap" ref={wrap}>
      <button type="button" className="term" aria-expanded={open} onClick={() => { setShift(0); setUp(false); setOpen(!open); dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id.current })); }}>{children}</button>
      {open && <span className={`term-pop${up ? ' up' : ''}`} role="note" ref={pop} style={{ transform: `translateX(${shift}px)` }}><b>{label}</b> {entry.plain}</span>}
    </span>
  );
}

export default function Glossed({ text }) {
  return Glossary.segments(text).map((s, k) => (s.entry ? <Term key={k} entry={s.entry}>{s.text}</Term> : s.text));
}
