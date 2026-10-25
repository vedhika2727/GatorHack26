export function withSampleData(source, hasSensorMeasurements) {
  if (source !== 'sensor') return source;
  return hasSensorMeasurements ? 'mixed' : 'sample';
}

export function setMeasurementSource(sources, measurement, source) {
  const next = { ...sources };
  if (source === 'sensor' || source === 'sample') next[measurement] = source;
  else delete next[measurement];
  return next;
}

export function clearMeasurementSources(sources, measurements) {
  return measurements.reduce((next, measurement) => setMeasurementSource(next, measurement, null), sources);
}

export function skipMeasurements(checkin, sources, measurements, cancel) {
  cancel?.();
  const nextCheckin = { ...checkin };
  for (const measurement of measurements) nextCheckin[measurement] = null;
  const nextSources = clearMeasurementSources(sources, measurements);
  nextCheckin.source = sourceFromMeasurements(nextSources);
  return { checkin: nextCheckin, sources: nextSources };
}

export function sourceFromMeasurements(sources) {
  const recorded = Object.values(sources);
  const hasSamples = recorded.includes('sample');
  const hasSensors = recorded.includes('sensor');
  if (hasSamples && hasSensors) return 'mixed';
  if (hasSamples) return 'sample';
  return 'sensor';
}
