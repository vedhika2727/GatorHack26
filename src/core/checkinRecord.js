import { sourceFromMeasurements } from './checkinSource.js';

export function buildCheckinRecord(draft, measurements, measurementSources, id, isDemo) {
  const checkin = {
    ...draft,
    ...measurements,
    source: sourceFromMeasurements(measurementSources),
    measurementSources: { ...measurementSources },
    id,
  };
  if (isDemo) checkin.demo = true;
  return checkin;
}
