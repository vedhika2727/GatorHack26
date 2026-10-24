// Small stroke icon set (24×24), drawn for this app. Usage: <Icon name="home" />
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  scan: 'M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2M8 12h8M12 8v8',
  report: 'M9 3h6l1 2h3v16H5V5h3zM9 11h6M9 15h6',
  check: 'M5 12.5 10 17 19 7',
  plus: 'M12 5v14M5 12h14',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M7 12l3-4 4 1 2 3M10 8l1 7',
  balance: 'M12 3v18M7 21h10M5 8l7-3 7 3M5 8l-2 6a3 3 0 0 0 4 0zM19 8l-2 6a3 3 0 0 0 4 0z',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.6-1.5L8 15',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  shield: 'M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z',
  doctors: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M12.5 15.5A6 6 0 0 1 22 20',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  printer: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  play: 'M7 4l13 8-13 8z',
  alert: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  timeline: 'M3 12h18M7 12v-4M12 12v6M17 12v-5',
};
export default function Icon({ name, size = 22, stroke = 1.9, className = '', label }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={P[name] || P.info} />
    </svg>
  );
}
