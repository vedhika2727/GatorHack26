// React wrappers around the SVG drawing code in viz/draw.js.
import { useEffect, useRef } from 'react';
import { renderBody, Walker as WalkerDraw, sparkline, bandChart, dualTimeline } from '../viz/draw.js';

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
