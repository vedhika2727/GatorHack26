export function withSampleData(source, hasSensorMeasurements) {
  if (source !== 'sensor') return source;
  return hasSensorMeasurements ? 'mixed' : 'sample';
}
