// Small drawings for the landing page features, built from the demo patient's real numbers
// rather than generic icons. Each is a 240x84 SVG.
const W = 240, H = 84;

function TwinArt({ twin }) {
  const n = twin.length, x = (i) => 10 + (i / (n - 1)) * (W - 20), y = (v) => H - 10 - (v / 80) * (H - 20);
  const up = twin.map((s, i) => `${x(i)},${y(s.high)}`), dn = twin.map((s, i) => `${x(i)},${y(s.low)}`).reverse();
  return <>
    <polygon points={up.concat(dn).join(' ')} fill="var(--navy-wash)" />
    <polyline points={twin.map((s, i) => `${x(i)},${y(s.mean)}`).join(' ')} fill="none" stroke="var(--navy)" strokeWidth="2.5" strokeLinejoin="round" />
    {twin.map((s, i) => <circle key={i} cx={x(i)} cy={y(s.mean)} r="3.5" fill={s.surprise === 'worse' ? 'var(--red)' : 'var(--navy)'} />)}
  </>;
}

function Steps({ times, row, color }) {
  const t = times.slice(2, 14), t0 = t[0], span = t[t.length - 1] - t0 || 1;
  return t.map((v, k) => <ellipse key={k} cx={12 + ((v - t0) / span) * (W - 24)} cy={row + (k % 2 ? 7 : -7)} rx="5" ry="3.2" fill={color} transform={`rotate(-12 ${12 + ((v - t0) / span) * (W - 24)} ${row + (k % 2 ? 7 : -7)})`} />);
}
function WalkArt({ first, last }) {
  return <>
    <Steps times={first} row={22} color="var(--forest)" />
    <Steps times={last} row={64} color="var(--ink-2)" />
  </>;
}

const TRACKS = [[32, 24, 18], [21, 14, 11], [19, 13, 9]];
function SpotsArt() {
  const x = (k) => 16 + k * ((W - 32) / 2), y = (v) => H - 10 - (v / 34) * (H - 20);
  return TRACKS.map((t, i) => <g key={i}>
    <polyline points={t.map((v, k) => `${x(k)},${y(v)}`).join(' ')} fill="none" stroke={i ? 'var(--ink-2)' : 'var(--rose)'} strokeWidth={i ? 1.6 : 2.6} opacity={i ? 0.55 : 1} />
    {t.map((v, k) => <circle key={k} cx={x(k)} cy={y(v)} r={i ? 2.6 : 3.6} fill={i ? 'var(--ink-2)' : 'var(--rose)'} opacity={i ? 0.6 : 1} />)}
  </g>);
}

function OpinionsArt() {
  const bar = (y, mm, fill, label) => <g>
    <rect x="0" y={y} width={(mm / 24) * 160} height="16" rx="4" fill={fill} />
    <text x={(mm / 24) * 160 + 8} y={y + 12.5} fontSize="16" fontWeight="700" fill="var(--ink)">{mm} mm</text>
    <text x="0" y={y - 5} fontSize="14" fill="var(--ink-2)">{label}</text>
  </g>;
  return <>{bar(18, 18, 'var(--navy)', 'First read')}{bar(60, 22, 'var(--rose)', 'Second opinion')}</>;
}

function PageArt() {
  return <g>
    <rect x="70" y="2" width="100" height="80" rx="6" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
    <rect x="80" y="12" width="46" height="6" rx="3" fill="var(--ink)" />
    {[26, 34].map((y) => <rect key={y} x="80" y={y} width="80" height="3.5" rx="1.75" fill="var(--line)" />)}
    <polyline points="80,64 98,60 116,56 134,48 152,44" fill="none" stroke="var(--navy)" strokeWidth="2" />
    <rect x="80" y="70" width="58" height="3.5" rx="1.75" fill="var(--line)" />
  </g>;
}

function LimitsArt() {
  return <>
    <rect x="0" y="8" width="190" height="32" rx="16" fill="var(--forest-wash)" />
    <text x="16" y="29.5" fontSize="16" fontWeight="700" fill="var(--forest)">Walking pace −17%</text>
    <rect x="0" y="48" width="140" height="32" rx="16" fill="none" stroke="var(--body-line)" strokeWidth="1.5" strokeDasharray="4 3" />
    <text x="16" y="69.5" fontSize="16" fill="var(--ink-2)" textDecoration="line-through">A diagnosis</text>
  </>;
}

export default function FeatureArt({ kind, twin, checkins }) {
  const body = {
    twin: <TwinArt twin={twin} />,
    walk: <WalkArt first={checkins[0].gait.stepTimes} last={checkins[checkins.length - 1].gait.stepTimes} />,
    spots: <SpotsArt />,
    opinions: <OpinionsArt />,
    page: <PageArt />,
    limits: <LimitsArt />,
  }[kind];
  return <svg className="feature-art" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">{body}</svg>;
}
