export function isMissingReportValue(value) {
  return value == null || (typeof value === 'number' && !Number.isFinite(value));
}

export function formatReportValue(value, unit = '') {
  if (isMissingReportValue(value)) return 'Not measured';
  if (unit && typeof value === 'number') {
    return /^[%/×]/.test(unit) ? `${value}${unit}` : `${value} ${unit}`;
  }
  return String(value);
}

export function formatReportCategory(value, categories) {
  if (isMissingReportValue(value)) return 'Not measured';
  const category = typeof value === 'number'
    ? categories[value]
    : categories.includes(value) ? value : null;
  return formatReportValue(category);
}
