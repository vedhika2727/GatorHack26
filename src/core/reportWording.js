const SYMPTOM_FIELDS = ['feetNumb', 'handsNumb', 'feetPain'];

function hasReportedSymptoms(checkin) {
  return SYMPTOM_FIELDS.some((field) => Number.isFinite(checkin.symptoms?.[field]));
}

function hasTapping(checkin) {
  return ['right', 'left'].some((hand) => checkin.tapping?.[hand]?.ok);
}

export function reportInputDescription(checkins, demo = false) {
  if (demo) {
    return 'This is fictional demo data; simulated measurements and fictional symptom responses are used for the demo estimate.';
  }

  const hasSymptoms = checkins.some(hasReportedSymptoms);
  const available = [
    checkins.some((checkin) => checkin.gait?.ok) && 'walking',
    checkins.some((checkin) => checkin.balance?.ok || checkin.balanceClosed?.ok) && 'balance',
    checkins.some(hasTapping) && 'hand tapping',
  ].filter(Boolean);

  if (hasSymptoms && !available.length) {
    return 'This estimate uses reported symptoms only; walking, balance, and hand performance were not measured.';
  }

  const inputs = [
    hasSymptoms && 'reported symptoms',
    available.length && `eligible recorded measurements for ${available.join(', ')}`,
  ].filter(Boolean);

  if (inputs.length) return `This estimate uses ${inputs.join(' and ')}.`;
  return 'No reported symptoms or eligible recorded physical measurements were available for this estimate.';
}

export function reportPatientSummary(inputDescription, flags, checkinCount, demo = false) {
  const flaggedChanges = `${flags.slice(0, 3).map((flag) => flag.text).join(' ')}${flags.length > 3 ? ` ${flags.length - 3} additional threshold change${flags.length > 4 ? 's are' : ' is'} listed in the report.` : ''}`;
  const changes = flags.length
    ? `${demo ? 'Fictional demo data show these supported changes' : 'The report flags these supported changes'}: ${flaggedChanges}`
    : demo
      ? 'Fictional demo data show no symptom or simulated-measurement change crossed the report’s comparison thresholds.'
      : checkinCount < 2
        ? 'This is your first check-in; there is not yet a later check-in to compare.'
        : 'No reported symptom or eligible recorded measurement change crossed the report’s comparison thresholds.';
  const demoContext = demo
    ? 'The symptom responses and measurements are fictional and do not describe a real person.'
    : 'These reported or recorded changes do not establish their cause.';
  return `${changes} ${inputDescription} ${demoContext} Please share this report with your care team.`;
}

export function reportQuestions(flags) {
  if (flags.length) {
    return [
      'Could you help me understand what these reported changes may mean?',
      'Is there anything in these check-in results you would like me to track?',
      'When should I contact your team about a change in my symptoms or function?',
    ];
  }
  return [
    'What symptoms or changes would you like me to report between visits?',
    'How often should I complete these check-ins?',
    'Who should I contact if I notice a new or worsening symptom?',
  ];
}
