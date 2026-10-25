import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import FunctionTwin from '../core/twin.js';
import { useStore, HOSTED_PREVIEW } from '../store.jsx';
import { writeReport } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';

export default function Report({ go }) {
  const { user, checkins, scans } = useStore();
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const twin = useMemo(() => FunctionTwin.run(checkins), [checkins]);

  if (!checkins.length) return (
    <div className="wrap"><h1>Report for your care team</h1>
      <div className="card"><p>Do a check-in first, and your report will be ready to write.</p>
        <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn primary" onClick={() => go('checkin')}>Start a check-in <Icon name="arrowRight" size={18} /></button></div></div></div>
  );

  const last = checkins[checkins.length - 1];
  const asText = () => [
    `Chemo Nerve Check: pre-infusion summary for ${user.name}`,
    `${checkins.length} check-ins, cycles ${checkins[0].cycle}–${last.cycle}. Latest: ${fmtDate(last.date)}.`,
    '', 'For the patient', out.patient, '', 'Function twin', out.twin,
    ...(out.scans ? ['', 'Scans', out.scans] : []), '', 'For the oncology team', out.clinician,
    '', 'Questions for the next visit', ...out.questions.map((q) => `- ${q}`),
    '', 'Phone measurements are approximate and not a diagnosis.',
  ].join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(asText()); setCopied('Copied. Paste it into a patient-portal message or email.'); }
    catch (_) { setCopied('Your browser blocked copying. Select the report text below and copy it.'); }
  }

  return (
    <div className="wrap">
      <div className="no-print">
        <h1>Report for your care team</h1>
        <p className="lede">Bring this to your next infusion or send it through your patient portal. It’s written by Gemma, an open AI model, from your measurements.</p>
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setOut(await writeReport(checkins, scans)); setBusy(false); }}>{busy ? 'Writing your report…' : out ? 'Write it again' : 'Write my report'}</button>
          {out && <button type="button" className="btn" onClick={copy}><Icon name="copy" size={18} /> Copy report text</button>}
          {out && !HOSTED_PREVIEW && <button type="button" className="btn" onClick={() => window.print()}><Icon name="printer" size={18} /> Print or save as PDF</button>}
        </div>
        {copied && <p className="notice" role="status">{copied}</p>}
      </div>
      {out && (
        <article className="card report">
          <h2 style={{ marginTop: 0 }}>Pre-infusion summary</h2>
          <p className="muted">{user.name}. {checkins.length} check-in{checkins.length > 1 ? 's' : ''}, cycles {checkins[0].cycle}–{last.cycle}. Latest: {fmtDate(last.date)}.{user.mode === 'demo' ? ' Demo patient, simulated data.' : ''}</p>
          <h3>For the patient</h3><p>{out.patient}</p>
          <h3>Function twin</h3><p>{out.twin}</p>
          {out.scans && <><h3>Scans</h3><p>{out.scans}</p></>}
          <h3>For the oncology team</h3><div className="pre">{out.clinician}</div>
          <h3>Questions for the next visit</h3><ul>{out.questions.map((q) => <li key={q}>{q}</li>)}</ul>
          <h3>Measurements</h3>
          <div className="table-wrap"><table>
            <thead><tr>{['Cycle', 'Date', 'Twin estimate', 'Feet /10', 'Hands /10', 'Pain /10', 'Steps/min', 'Evenness', 'Timing var. %', 'Pauses', 'Sway', 'Eyes-closed ratio', 'Taps/s R', 'Taps/s L', 'Falls'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{checkins.map((c, k) => {
              const g = c.gait?.ok ? c.gait : null, b = c.balance?.ok ? c.balance : null, t = twin[k];
              return <tr key={c.id}>{[c.cycle, c.date, `${t.mean} (${t.low}–${t.high})${t.surprise === 'worse' ? ' worse than expected' : ''}`, c.symptoms.feetNumb, c.symptoms.handsNumb, c.symptoms.feetPain, g?.cadence ?? '—', g?.stepRegularity ?? '—', g?.stepTimeCV ?? '—', g?.hesitations ?? '—', b ? (b.swayRms * 100).toFixed(1) : '—', b && c.balanceClosed?.ok ? (c.balanceClosed.swayRms / b.swayRms).toFixed(2) : '—', c.tapping?.right?.ok ? c.tapping.right.rate : '—', c.tapping?.left?.ok ? c.tapping.left.rate : '—', { none: 'No', near: 'Near-fall', fall: 'Fall' }[c.falls]].map((v, j) => <td key={j}>{v}</td>)}</tr>;
            })}</tbody>
          </table></div>
          <p className="fine" style={{ marginTop: 14 }}>
            {out.source === 'gemma' ? <><span className="chip navy">Written by Gemma 4 ({out.model})</span> from the measurements above. Which changes are flagged is decided by fixed rules, and the twin is a fixed model, not AI. </> : <><span className="chip watch">Template text, Gemma not connected</span> {out.note} </>}
            Phone measurements are approximate and measure function, not nerves directly. Not a diagnosis.
          </p>
        </article>
      )}
    </div>
  );
}
