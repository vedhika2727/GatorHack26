/*
 * Demo scan reports for the demo patient. FICTIONAL reports written for this
 * prototype (not real patients): metastatic breast cancer on weekly taxane
 * chemotherapy, a drug class known for causing nerve symptoms.
 * The cycle-6 CT has two reads: the original and a second opinion.
 */
import Scans from './scans.js';

const R = {
  baseline: `CT CHEST, ABDOMEN AND PELVIS WITH CONTRAST
FINDINGS:
Liver: Hypoattenuating lesion in hepatic segment 7 measuring 3.2 x 2.8 cm. Second lesion in hepatic segment 4 measuring 1.9 cm.
Lymph nodes: Left axillary lymph node measuring 2.1 cm in short axis.
Lungs: No suspicious pulmonary nodules.
Bones: No suspicious osseous lesions.
IMPRESSION:
Hepatic lesions in segments 7 and 4 and an enlarged left axillary lymph node, consistent with metastatic disease.`,
  mid: `CT CHEST, ABDOMEN AND PELVIS WITH CONTRAST
COMPARISON: Prior CT.
FINDINGS:
Liver: Segment 7 lesion now measures 2.4 x 2.0 cm, previously 3.2 cm. Segment 4 lesion measures 1.3 cm, previously 1.9 cm.
Lymph nodes: Left axillary lymph node measures 1.4 cm, previously 2.1 cm.
Lungs: No suspicious pulmonary nodules.
IMPRESSION:
Interval decrease in size of hepatic metastases and left axillary adenopathy, consistent with response to therapy. No new lesions.`,
  lateA: `CT CHEST, ABDOMEN AND PELVIS WITH CONTRAST
COMPARISON: Prior CT.
FINDINGS:
Liver: Segment 7 lesion measures 1.8 cm, previously 2.4 cm. Segment 4 lesion measures 0.9 cm, previously 1.3 cm.
Lymph nodes: Left axillary lymph node measures 1.1 cm, previously 1.4 cm.
Lungs: New 4 mm nodule in the right lower lobe.
IMPRESSION:
Continued decrease in hepatic metastases and axillary node. New 4 mm right lower lobe pulmonary nodule, indeterminate; attention on follow-up.`,
  lateB: `SECOND OPINION INTERPRETATION: CT CHEST, ABDOMEN AND PELVIS
COMPARISON: Prior CTs reviewed.
FINDINGS:
Liver: Segment 7 lesion measures 2.2 cm, previously 2.4 cm. Segment 4 lesion measures 1.0 cm, previously 1.3 cm.
Lymph nodes: Left axillary lymph node measures 1.1 cm.
Lungs: Tiny 4 mm right lower lobe nodule. On review of prior imaging it was faintly visible on the prior study and is likely benign.
IMPRESSION:
Mild decrease in hepatic metastases. Right lower lobe nodule is not new and likely benign. No new metastatic disease.`,
};
export function buildDemoScans(checkins) {
  const d = (i, off) => { const x = new Date(checkins[i].date + 'T12:00:00'); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
  const mk = (id, date, reader, text) => ({ id, demo: true, date, kind: 'CT', reader, text, images: [], extracted: Scans.verify(Scans.extractRules(text), text), extractSource: 'rules' });
  return [
    mk('demo-s1', d(0, -5), 'Hospital radiologist', R.baseline),
    mk('demo-s2', d(2, 16), 'Hospital radiologist', R.mid),
    mk('demo-s3', d(5, -3), 'Hospital radiologist', R.lateA),
    mk('demo-s4', d(5, 0), 'Second opinion, cancer center', R.lateB),
  ];
}
export const DEMO_REPORTS = R;
