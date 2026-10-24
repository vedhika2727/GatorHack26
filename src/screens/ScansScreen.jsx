import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import Scans from '../core/scans.js';
import { useStore } from '../store.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { readReport, explainOpinions } from '../lib/api.js';
import { downscale, pdfText } from '../lib/files.js';
import { fmtDate, today } from '../lib/format.js';

const CHG_LEVEL = { smaller: 'steady', larger: 'notable', stable: 'navy', first: 'navy', mixed: 'watch', unclear: 'navy' };

function Findings({ ex }) {
  return <>
    <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip level={CHG_LEVEL[ex.change] || 'navy'}>{Scans.CHANGE_WORDS[ex.change] || ex.change}</Chip>
      {ex.newLesions && <Chip level="watch">Mentions a new finding</Chip>}
    </p>
    <p className="plain">{ex.plain || <><strong>Radiologist’s conclusion:</strong> {ex.impression}</>}</p>
    {ex.lesions.length ? (
      <div className="table-wrap"><table className="lesions"><thead><tr><th scope="col">Where</th><th scope="col">Size</th><th scope="col">Before</th><th scope="col">Checked</th></tr></thead>
        <tbody>{ex.lesions.map((l, k) => <tr key={k}><td>{l.location}</td><td>{l.sizeMm} mm</td><td>{l.previousMm ? `${l.previousMm} mm` : '—'}</td><td className="tick"><Icon name="check" size={14} stroke={3} /> in report</td></tr>)}</tbody></table></div>
    ) : <p className="muted">No measurements were found in this report.</p>}
  </>;
}

function ScanCard({ s, onOpenImage }) {
  const { removeScan, user } = useStore();
  const confirm = useConfirm();
  return (
    <article className="card">
      <div className="score-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{s.kind}, {fmtDate(s.date)}</h3>
        <span className="fine">{s.extractSource === 'gemma' ? 'Read by Gemma 4' : 'Read by built-in rules'}</span>
      </div>
      <p className="muted" style={{ marginTop: 2 }}>Read by {s.reader}{s.demo ? ', fictional demo report' : ''}</p>
      <Findings ex={s.extracted} />
      {!!s.images?.length && <div className="thumbs">{s.images.map((src, k) => <button key={k} type="button" aria-label={`Open scan picture ${k + 1}`} onClick={() => onOpenImage(src)}><img src={src} alt="" /></button>)}</div>}
      <details className="more" style={{ marginTop: 12 }}><summary>Full report text</summary><div className="report-text">{s.text}</div></details>
      {user.mode !== 'demo' && <div className="actions" style={{ marginBottom: 0 }}><button type="button" className="btn ghost small" onClick={async () => { if (await confirm('Remove this scan report?', 'Remove report', true)) removeScan(s.id); }}><Icon name="trash" size={16} /> Remove</button></div>}
    </article>
  );
}

function OpinionsCard({ a, b }) {
  const { saveScan, user } = useStore();
  const cmp = Scans.compareReads(a, b);
  const [o, setO] = useState(b.opinion || null);
  const [busy, setBusy] = useState(false);
  const word = { agree: 'Similar', size: 'Measured differently', 'only-a': 'Only in first report', 'only-b': 'Only in second report' };
  return (
    <section className="card opinions">
      <div className="score-row" style={{ gap: 10 }}><span className="ic rose" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name="doctors" /></span><h3 style={{ margin: 0 }}>Two doctors read this {a.kind}</h3></div>
      <p>{cmp.differences ? `They differ on ${cmp.differences} point${cmp.differences > 1 ? 's' : ''}. This is common, and a good thing to ask your oncologist about.` : 'Their measurements and conclusions match.'}</p>
      <div className="table-wrap"><table className="lesions">
        <thead><tr><th scope="col">Where</th><th scope="col">{a.reader}</th><th scope="col">{b.reader}</th><th scope="col">Comparison</th></tr></thead>
        <tbody>
          {cmp.rows.map((r, k) => <tr key={k} className={r.status === 'agree' ? 'op-same' : 'op-diff'}><td>{r.location}</td><td>{r.a != null ? `${r.a} mm` : '—'}</td><td>{r.b != null ? `${r.b} mm` : '—'}</td><td>{word[r.status]}</td></tr>)}
          <tr className={cmp.sameNew ? 'op-same' : 'op-diff'}><td>New findings?</td><td>{a.extracted.newLesions ? 'Yes' : 'No'}</td><td>{b.extracted.newLesions ? 'Yes' : 'No'}</td><td>{cmp.sameNew ? 'Same' : 'Different'}</td></tr>
          <tr className={cmp.sameChange ? 'op-same' : 'op-diff'}><td>Overall</td><td>{Scans.CHANGE_WORDS[a.extracted.change]}</td><td>{Scans.CHANGE_WORDS[b.extracted.change]}</td><td>{cmp.sameChange ? 'Same' : 'Different'}</td></tr>
        </tbody>
      </table></div>
      {o && <>
        <p className="plain" style={{ marginTop: 12 }}>{o.summary}</p>
        <p style={{ fontWeight: 700, marginBottom: 0 }}>Questions to ask</p>
        <ul>{o.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        <p className="fine">{o.source === 'gemma' ? `Written by Gemma 4 (${o.model}). It doesn’t say which doctor is right.` : `Template text, Gemma not connected. ${o.note || ''}`}</p>
      </>}
      <div className="actions" style={{ marginBottom: 0 }}>
        <button type="button" className="btn rose primary" disabled={busy} onClick={async () => { setBusy(true); const r = await explainOpinions(a, b); setO(r); setBusy(false); if (user.mode !== 'demo') saveScan({ ...b, opinion: r }).catch(() => {}); }}>
          <Icon name="sparkle" size={18} /> {busy ? 'Comparing the reports…' : o ? 'Explain again' : 'Explain the differences in plain words'}
        </button>
      </div>
    </section>
  );
}

function AddScan({ onDone }) {
  const { saveScan, user } = useStore();
  const [f, setF] = useState({ date: today(), kind: 'CT', reader: '', text: '' });
  const fileRef = useRef(null), imgRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(null);

  async function read(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      let text = f.text.trim(), image = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) text = await pdfText(file);
        else if (/^image\//.test(file.type)) image = { mimeType: 'image/jpeg', data: (await downscale(file, 1600, 0.85)).split(',')[1] };
        else text = await file.text();
      }
      if (!text && !image) throw new Error('Paste the report text or upload a file first.');
      const out = await readReport({ text, image });
      const imgs = [];
      for (const im of [...(imgRef.current?.files || [])].slice(0, 4)) imgs.push(await downscale(im, 900, 0.7));
      setPending({ scan: { id: 's' + Date.now(), date: f.date, kind: f.kind, reader: f.reader.trim() || 'Radiologist', text: out.text || text, images: imgs, extracted: out.extracted, extractSource: out.source, fromPhoto: !!out.fromPhoto, demo: user.mode === 'demo' || undefined }, out });
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (pending) {
    const ex = pending.scan.extracted;
    return (
      <section className="card" aria-labelledby="check-title">
        <h2 id="check-title" style={{ marginTop: 0 }}>Check what was found</h2>
        <Findings ex={ex} />
        {!!ex.droppedCount && <p className="fine">{ex.droppedCount} measurement{ex.droppedCount > 1 ? 's were' : ' was'} left out because {ex.droppedCount > 1 ? 'they don’t' : 'it doesn’t'} appear word for word in the report text.</p>}
        {pending.scan.fromPhoto && <p className="fine">Read from a photo. Please check these numbers against your printed report.</p>}
        <p className="fine">{pending.out.source === 'gemma' ? `Read by Gemma 4 (${pending.out.model}). Every size shown was checked against the report text.` : `Read by built-in rules. ${pending.out.note || ''}`}</p>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions" style={{ marginBottom: 0 }}>
          <button type="button" className="btn rose primary" onClick={async () => { try { await saveScan(pending.scan); setPending(null); setF({ date: today(), kind: 'CT', reader: '', text: '' }); onDone(); } catch (e2) { setErr(e2.message); } }}><Icon name="check" size={18} /> Save this scan</button>
          <button type="button" className="btn ghost" onClick={() => setPending(null)}>Discard</button>
        </div>
      </section>
    );
  }
  return (
    <form className="card" onSubmit={read} noValidate>
      <h2 style={{ marginTop: 0 }}>Add a scan report</h2>
      <div className="grid2">
        <label className="field">Scan date<input id="sc-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field">Type of scan<select id="sc-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['CT', 'MRI', 'PET-CT', 'Ultrasound', 'Mammogram', 'Other'].map((k) => <option key={k}>{k}</option>)}</select></label>
      </div>
      <label className="field">Who read it<input id="sc-reader" value={f.reader} onChange={(e) => setF({ ...f, reader: e.target.value })} placeholder="For example: hospital radiologist, or second opinion" maxLength={80} /></label>
      <label className="field">Report text<textarea id="sc-text" rows={7} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Paste the report from your patient portal, especially the Findings and Impression sections." /></label>
      <div className="grid2">
        <label className="field dropzone"><span><Icon name="upload" size={18} /> Or upload the report</span><input id="sc-file" ref={fileRef} type="file" accept=".pdf,.txt,text/plain,application/pdf,image/*" /><span className="hint">PDF, text file, or a photo of the printed report</span></label>
        <label className="field dropzone"><span><Icon name="scan" size={18} /> Scan pictures (optional)</span><input id="sc-images" ref={imgRef} type="file" accept="image/*" multiple /><span className="hint">Screenshots of your images to keep with the report. The AI doesn’t read these.</span></label>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions" style={{ marginBottom: 0 }}><button type="submit" className="btn rose primary" disabled={busy}><Icon name="sparkle" size={18} /> {busy ? 'Reading the report…' : 'Read this report'}</button></div>
    </form>
  );
}

export default function ScansScreen() {
  const { scans } = useStore();
  const [img, setImg] = useState(null);
  const dlg = useRef(null);
  const [adding, setAdding] = useState(scans.length === 0);
  const groups = Scans.groupOpinions(scans).reverse();
  const open = (src) => { setImg(src); setTimeout(() => dlg.current?.showModal(), 0); };
  return (
    <div className="wrap">
      <h1>Scan reports</h1>
      <p className="lede">Add the radiologist’s written report for each scan. Your twin plots the measured tumor size next to your check-ins. If you got a second opinion, add that report too and the two are compared side by side.</p>
      {adding ? <AddScan onDone={() => setAdding(false)} />
        : <div className="actions"><button type="button" className="btn rose primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add a scan report</button></div>}
      {groups.length > 0 && <h2>Your scans</h2>}
      <div className="stack">
        {groups.map((g) => <div className="stack" key={g[0].id}>
          {g.slice(1).map((b) => <OpinionsCard key={'o' + b.id} a={g[0]} b={b} />)}
          {g.map((s) => <ScanCard key={s.id} s={s} onOpenImage={open} />)}
        </div>)}
      </div>
      <dialog ref={dlg} className="wide" onClose={() => setImg(null)}>{img && <img src={img} alt="Scan picture" />}<form method="dialog"><button className="btn">Close</button></form></dialog>
    </div>
  );
}
