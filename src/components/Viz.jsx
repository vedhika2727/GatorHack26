// React wrappers around the SVG drawing code in viz/draw.js.
import { useEffect, useRef } from 'react';
import { renderBody, Walker as WalkerDraw, sparkline, bandChart, dualTimeline, spotChart } from '../viz/draw.js';

export function SpotChart({ data, selected, focus, onPick }) {
  const ref = useRef(null);
  useEffect(() => {
    const draw = () => ref.current && spotChart(ref.current, data, { selected, focus });
    draw();
    const ro = new ResizeObserver(draw); ro.observe(ref.current);
    return () => ro.disconnect();
  }, [data, selected, focus]);
  const click = (e) => { const k = e.target.getAttribute?.('data-k'); if (k != null) onPick?.(+k); };
  const label = `Measured size of each spot across ${data.dates.length} scan dates: ` + data.tracks.map((t) => `${t.location} ${t.points.map((p) => (p ? p.mm : 'none')).join(', ')} mm`).join('; ');
  return <svg ref={ref} className="spots" role="img" aria-label={label} onClick={click} />;
}

export function BodyMap({ symptoms }) {
  const ref = useRef(null);
  useEffect(() => { renderBody(ref.current, symptoms || {}); }, [symptoms]);
  return <svg ref={ref} viewBox="0 0 200 330" role="img" aria-label={`Body map: feet ${Math.max(symptoms?.feetNumb || 0, symptoms?.feetPain || 0)} out of 10, hands ${symptoms?.handsNumb || 0} out of 10`} />;
}

export function Walker({ stepTimes, label }) {
  const ref = useRef(null), w = useRef(null);
  useEffect(() => { w.current = new WalkerDraw(ref.current); return () => w.current?.stop(); }, []);
  useEffect(() => { w.current?.setSteps(stepTimes || []); }, [stepTimes]);
  return <svg ref={ref} className="walker" viewBox="0 0 360 120" role="img" aria-label={label} />;
}

export function Sparkline({ values, selected, min, max, label }) {
  const ref = useRef(null);
  useEffect(() => { sparkline(ref.current, values, { selected, min, max }); }, [values, selected, min, max]);
  return <svg ref={ref} role="img" aria-label={label} />;
}

export function BandChart({ steps, selected }) {
  const ref = useRef(null);
  useEffect(() => { if (steps.length) bandChart(ref.current, steps, selected); }, [steps, selected]);
  return <svg ref={ref} className="band" role="img" aria-label="Function twin estimate across chemo cycles" />;
}

export function DualTimeline({ tumor, twin }) {
  const ref = useRef(null);
  useEffect(() => { dualTimeline(ref.current, tumor, twin); }, [tumor, twin]);
  return <svg ref={ref} className="dual" role="img" aria-label="Tumor size and function twin estimate over time" />;
}
