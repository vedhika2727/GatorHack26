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

const PHYSICAL_MEASUREMENTS = ['gait', 'balance', 'balanceClosed', 'tapping'];

function measurementSource(checkin, measurement) {
  const taskSource = checkin.measurementSources?.[measurement];
  if (taskSource === 'sensor' || taskSource === 'sample') return taskSource;
  if (checkin.source === 'sensor' || checkin.source === 'sample') return checkin.source;
  return null;
}

export function checkinsForPersonalTwin(checkins) {
  const personal = personalMeasurementInputs(checkins);

  if (!personal.length) return personal;

  // Establish each physical baseline from its first known sensor measurement.
  const baseline = { ...personal[0] };
  for (const measurement of PHYSICAL_MEASUREMENTS) {
    const firstPersonalMeasurement = personal.find((checkin, index) =>
      measurementSource(checkins[index], measurement) === 'sensor'
      && hasValidMeasurement(checkin[measurement]),
    );
    if (firstPersonalMeasurement) baseline[measurement] = firstPersonalMeasurement[measurement];
  }
  personal[0] = baseline;
  return personal;
}

export function personalMeasurementInputs(checkins) {
  return checkins.map((checkin) => {
    const next = { ...checkin };
    for (const measurement of PHYSICAL_MEASUREMENTS) {
      if (measurementSource(checkin, measurement) !== 'sensor') next[measurement] = null;
    }
    return next;
  });
}

export function isDemoCheckins(checkins) {
  return checkins.length > 0 && checkins.every((checkin) => checkin.demo === true);
}

export function checkinsForTwin(checkins, demoMode = isDemoCheckins(checkins)) {
  return demoMode ? checkins : checkinsForPersonalTwin(checkins);
}

export function hasExcludedPhysicalMeasurements(checkins) {
  return checkins.some((checkin) => PHYSICAL_MEASUREMENTS.some((measurement) =>
    hasValidMeasurement(checkin[measurement]) && measurementSource(checkin, measurement) !== 'sensor',
  ));
}

function hasValidMeasurement(value) {
  if (value?.ok) return true;
  return ['right', 'left'].some((hand) => value?.[hand]?.ok);
}
