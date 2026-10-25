import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Chip from '../components/Chip.jsx';
import { SpotChart } from '../components/Viz.jsx';
import Scans from '../core/scans.js';
import { useStore } from '../store.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { readReport, explainOpinions, explainTerm } from '../lib/api.js';
import Glossed, { niceWord } from '../components/Glossed.jsx';
import Glossary from '../core/glossary.js';
import { downscale, pdfText } from '../lib/files.js';
import { fmtDate, today } from '../lib/format.js';

/*
 * Layout: a dark "reading room" band (spot chart + film strip of scan dates) joined to the header,
 * then the selected scan on the left and the list of spots on the right. Adding a report happens
 * in a sheet opened from the floating button.
 */
const CHG_LEVEL = { smaller: 'steady', larger: 'notable', stable: 'navy', first: 'navy', mixed: 'watch', unclear: 'navy' };
const SHORT = { first: 'Baseline', mixed: 'Mixed', smaller: 'Smaller', larger: 'Larger', stable: 'Stable', unclear: 'Unclear' };
const pct = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
const signed = (v) => (v > 0 ? `+${v}%` : `${v}%`);

function Measurements({ ex }) {
  if (!ex.lesions.length) return <p className="muted">No sizes were found in this report.</p>;
  const big = Math.max(...ex.lesions.map((l) => Math.max(l.sizeMm, l.previousMm || 0)));
  return (
    <div className="table-wrap">
      <table className="lesions">
        <thead><tr><th scope="col">Spot</th><th scope="col">Before</th><th scope="col">Now</th><th scope="col">Change</th></tr></thead>
        <tbody>{ex.lesions.map((l, k) => {
          const c = pct(l.sizeMm, l.previousMm);
          return (
            <tr key={k}>
              <td><Glossed text={l.location} /></td>
              <td className="muted">{l.previousMm ? `${l.previousMm} mm` : '–'}</td>
              <td><b>{l.sizeMm} mm</b><span className="sizebar" aria-hidden="true"><span style={{ width: `${(l.sizeMm / big) * 100}%` }} />{l.previousMm && <i style={{ left: `${(l.previousMm / big) * 100}%` }} />}</span></td>
              <td className={c == null ? 'muted' : c < 0 ? 'down' : c > 0 ? 'up' : ''}>{c == null ? 'new here' : signed(c)}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function verifiedLine(ex) {
  const n = ex.lesions.length;
  if (!n) return null;
  return <span className="verified"><Icon name="check" size={15} stroke={3} />{n === 1 ? 'The size' : `All ${n} sizes`} found word for word in the report</span>;
}

function Words({ text }) {
  const terms = Glossary.termsIn(text);
  const [q, setQ] = useState('');
  const [ans, setAns] = useState(null);
  const [busy, setBusy] = useState(false);
  async function ask(e) {
    e.preventDefault();
    const term = q.trim(); if (!term) return;
    setBusy(true);
    const line = text.split(/(?<=[.:])\s+|\n/).find((x) => x.toLowerCase().includes(term.toLowerCase()));
    setAns(await explainTerm(term, line)); setBusy(false);
  }
  return (
    <details className="more words">
      <summary>Words in this report{terms.length ? ` (${terms.length})` : ''}</summary>
      {terms.length > 0 && <dl>{terms.map((t) => <div key={t.word}><dt>{niceWord(t.as)}</dt><dd>{t.plain}</dd></div>)}</dl>}
      <form className="ask-word" onSubmit={ask}>
        <label className="field" style={{ margin: 0 }}>Look up another word<input value={q} onChange={(e) => { setQ(e.target.value); setAns(null); }} placeholder="For example: attenuation" maxLength={60} /></label>
        <button type="submit" className="btn small" disabled={busy || !q.trim()}>{busy ? 'Looking up…' : 'Explain'}</button>
      </form>
      {ans && <p className="word-answer" role="status">{ans.plain ? <><b>{ans.term}</b> {ans.plain} <span className="fine">{ans.source === 'gemma' ? `Explained by Gemma 4 (${ans.model}).` : 'From the built-in word list.'}</span></> : <span className="muted">{ans.note}</span>}</p>}
      <p className="fine">These explain what words mean in general. What they mean for you is a question for your care team.</p>
    </details>
  );
}

function ReadView({ s, onOpenImage }) {
  const { removeScan, user } = useStore();
  const confirm = useConfirm();
  const ex = s.extracted;
  return (
    <div className="read">
      <div className="read-meta">
        <span>{s.reader}{s.demo ? ' (fictional demo report)' : ''}</span>
        <span className="fine">{s.extractSource === 'gemma' ? 'Read by Gemma 4' : 'Read by built-in rules'}</span>
      </div>
      <div className="chips-row">
        <Chip level={CHG_LEVEL[ex.change] || 'navy'}>{Scans.CHANGE_WORDS[ex.change] || ex.change}</Chip>
        {ex.newLesions && <Chip level="watch">Mentions a new finding</Chip>}
      </div>
      <blockquote className="impression">
        <p><Glossed text={ex.impression} /></p>
        <footer>Radiologist’s conclusion. Tap an underlined word to see what it means.</footer>
      </blockquote>
      {ex.plain && <p className="plain">{ex.plain}</p>}
      <Measurements ex={ex} />
      {verifiedLine(ex)}
      {!!s.images?.length && <div className="thumbs">{s.images.map((src, k) => <button key={k} type="button" aria-label={`Open scan picture ${k + 1}`} onClick={() => onOpenImage(src)}><img src={src} alt="" /></button>)}</div>}
      <Words text={s.text} />
      <details className="more"><summary>Full report text</summary><div className="report-text"><Glossed text={s.text} /></div></details>
      {user.mode !== 'demo' && <button type="button" className="btn ghost small" style={{ marginTop: 10 }} onClick={async () => { if (await confirm('Remove this scan report?', 'Remove report', true)) removeScan(s.id); }}><Icon name="trash" size={16} /> Remove report</button>}
    </div>
  );
}

function CompareView({ a, b }) {
  const { saveScan, user } = useStore();
  const cmp = Scans.compareReads(a, b);
  const [o, setO] = useState(b.opinion || null);
  const [busy, setBusy] = useState(false);
  const word = { agree: 'Close', size: 'Different size', 'only-a': 'Only in first read', 'only-b': 'Only in second read' };
  return (
    <div className="read">
      <p className="compare-lead">{cmp.differences ? `The two reads differ on ${cmp.differences} point${cmp.differences > 1 ? 's' : ''}.` : 'The two reads match.'} <span className="muted">Radiologists often measure the same spot a few millimeters apart. Bigger gaps are worth asking about.</span></p>
      <div className="table-wrap">
        <table className="lesions compare">
          <thead><tr><th scope="col">Spot</th><th scope="col">{a.reader}</th><th scope="col">{b.reader}</th><th scope="col"><span className="sr-only">Result</span></th></tr></thead>
          <tbody>
            {cmp.rows.map((r, k) => <tr key={k} className={r.status === 'agree' ? 'same' : 'diff'}><td>{r.location}</td><td>{r.a != null ? `${r.a} mm` : '–'}</td><td>{r.b != null ? `${r.b} mm` : '–'}</td><td>{word[r.status]}</td></tr>)}
            <tr className={cmp.sameNew ? 'same' : 'diff'}><td>New finding</td><td>{a.extracted.newLesions ? 'Yes' : 'No'}</td><td>{b.extracted.newLesions ? 'Yes' : 'No'}</td><td>{cmp.sameNew ? 'Same' : 'Different'}</td></tr>
            <tr className={cmp.sameChange ? 'same' : 'diff'}><td>Overall</td><td>{SHORT[a.extracted.change]}</td><td>{SHORT[b.extracted.change]}</td><td>{cmp.sameChange ? 'Same' : 'Different'}</td></tr>
          </tbody>
        </table>
      </div>
      {o && <div className="explain">
        <p>{o.summary}</p>
        <h4>Questions for your oncologist</h4>
        <ul>{o.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        <p className="fine">{o.source === 'gemma' ? `Written by Gemma 4 (${o.model}). It doesn’t say which doctor is right.` : `Template text, Gemma not connected. ${o.note || ''}`}</p>
      </div>}
      <button type="button" className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const r = await explainOpinions(a, b); setO(r); setBusy(false); if (user.mode !== 'demo') saveScan({ ...b, opinion: r }).catch(() => {}); }}>
        {busy ? 'Comparing…' : o ? 'Explain again' : 'Explain the differences'}
      </button>
    </div>
  );
}

function ScanDetail({ group, onOpenImage }) {
  const [tab, setTab] = useState(group.length > 1 ? 'compare' : 0);
  useEffect(() => { setTab(group.length > 1 ? 'compare' : 0); }, [group[0].id, group.length]);
  const s = group[tab === 'compare' ? 0 : tab] || group[0];
  return (
    <article className="scan-detail" aria-labelledby="scan-title">
      <h2 id="scan-title">{s.kind} on {fmtDate(s.date)}</h2>
      {group.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Choose a read">
          <button type="button" role="tab" aria-selected={tab === 'compare'} className="cmp" onClick={() => setTab('compare')}><Icon name="doctors" size={17} /> Compare reads</button>
          {group.map((g, k) => <button key={g.id} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{g.reader}</button>)}
        </div>
      )}
      {tab === 'compare' && group.length > 1 ? <CompareView a={group[0]} b={group[1]} /> : <ReadView s={s} onOpenImage={onOpenImage} />}
    </article>
  );
}

function AddScan({ onDone, onCancel }) {
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
      if (!text && !image) throw new Error('Paste the report text or choose a file first.');
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
      <div aria-labelledby="check-title">
        <h2 id="check-title">Check the numbers</h2>
        <p className="muted">Compare these with your report before saving.</p>
        <Measurements ex={ex} />
        {verifiedLine(ex)}
        {!!ex.droppedCount && <p className="fine">{ex.droppedCount} size{ex.droppedCount > 1 ? 's were' : ' was'} left out because {ex.droppedCount > 1 ? 'they don’t' : 'it doesn’t'} appear word for word in the report.</p>}
        {pending.scan.fromPhoto && <p className="fine">Read from a photo, so check each number against the printed report.</p>}
        <p className="fine">{pending.out.source === 'gemma' ? `Read by Gemma 4 (${pending.out.model}).` : `Read by built-in rules. ${pending.out.note || ''}`}</p>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions" style={{ marginBottom: 0 }}>
          <button type="button" className="btn primary" onClick={async () => { try { await saveScan(pending.scan); setPending(null); setF({ date: today(), kind: 'CT', reader: '', text: '' }); onDone(pending.scan); } catch (e2) { setErr(e2.message); } }}><Icon name="check" size={18} /> Save report</button>
          <button type="button" className="btn ghost" onClick={() => setPending(null)}>Back</button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={read} noValidate>
      <h2 id="add-title">Add a report</h2>
      <p className="muted">Paste the radiology report from your patient portal, or upload it.</p>
      <div className="grid2">
        <label className="field">Scan date<input id="sc-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field">Type of scan<select id="sc-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['CT', 'MRI', 'PET-CT', 'Ultrasound', 'Mammogram', 'Other'].map((k) => <option key={k}>{k}</option>)}</select></label>
      </div>
      <label className="field">Who read it<input id="sc-reader" value={f.reader} onChange={(e) => setF({ ...f, reader: e.target.value })} placeholder="Hospital radiologist, second opinion…" maxLength={80} /></label>
      <label className="field">Report text<textarea id="sc-text" rows={6} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="The Findings and Impression sections matter most." /></label>
      <div className="grid2">
        <label className="field dropzone"><span><Icon name="upload" size={18} /> Upload the report</span><input id="sc-file" ref={fileRef} type="file" accept=".pdf,.txt,text/plain,application/pdf,image/*" /><span className="hint">PDF, text, or a photo of the printout</span></label>
        <label className="field dropzone"><span><Icon name="scan" size={18} /> Scan pictures</span><input id="sc-images" ref={imgRef} type="file" accept="image/*" multiple /><span className="hint">Optional. Kept with the report, not read by the AI.</span></label>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions" style={{ marginBottom: 0 }}>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Reading…' : 'Read report'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Sheet({ open, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <dialog ref={ref} className="sheet" aria-labelledby="add-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>{open && children}</dialog>;
}

export default function ScansScreen() {
  const { scans } = useStore();
  const groups = useMemo(() => Scans.groupOpinions(scans), [scans]);
  const data = useMemo(() => Scans.lesionTracks(scans), [scans]);
  const [sel, setSel] = useState(groups.length - 1);
  const [focus, setFocus] = useState(null);
  const [adding, setAdding] = useState(false);
  const [img, setImg] = useState(null);
  const dlg = useRef(null);
  useEffect(() => { setSel(groups.length - 1); }, [groups.length]);
  const open = (src) => { setImg(src); setTimeout(() => dlg.current?.showModal(), 0); };
  const i = Math.max(0, Math.min(sel, groups.length - 1));
  const g = groups[i];

  return (
    <>
      <section className="reading" aria-labelledby="scans-h">
        <div className="wrap wide">
          <div className="reading-head">
            <div>
              <h1 id="scans-h">Scans</h1>
              <p>{scans.length ? 'Every size your radiologists measured, spot by spot.' : 'Your radiology reports, measured and checked.'}</p>
            </div>
          </div>
          {scans.length ? <>
            <SpotChart data={data} selected={i} focus={focus} onPick={setSel} />
            <div className="film" role="tablist" aria-label="Choose a scan date">
              {groups.map((gr, k) => {
                const ex = gr[0].extracted;
                return (
                  <button key={gr[0].id} type="button" role="tab" aria-selected={k === i} className={`frame ${CHG_LEVEL[ex.change] || ''}`} onClick={() => setSel(k)}>
                    <b>{fmtDate(gr[0].date)}</b>
                    <span>{gr[0].kind}, {SHORT[ex.change] || 'Read'}</span>
                    {gr.length > 1 && <em>{gr.length} reads</em>}
                  </button>
                );
              })}
            </div>
          </> : (
            <div className="reading-empty">
              <p>Add a report and you’ll see each measured spot here, scan after scan. If you got a second opinion, add both and they’re compared line by line.</p>
              <button type="button" className="btn light" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add your first report</button>
            </div>
          )}
        </div>
      </section>

      {g && (
        <div className="wrap wide scan-body">
          <ScanDetail group={g} onOpenImage={open} />
          <aside className="spot-list" aria-labelledby="spots-h">
            <h3 id="spots-h">Spots</h3>
            <p className="fine">Tap one to follow it on the chart.</p>
            <ul>
              {data.tracks.map((t, k) => (
                <li key={k}>
                  <button type="button" aria-pressed={focus === k} onClick={() => setFocus(focus === k ? null : k)}>
                    <span className="name">{t.location}</span>
                    <span className="nums">{t.changePct == null ? <>{t.last} mm <small>first seen {fmtDate(data.dates[t.points.findIndex(Boolean)])}</small></> : <>{t.first} → {t.last} mm <small className={t.changePct < 0 ? 'down' : t.changePct > 0 ? 'up' : ''}>{signed(t.changePct)}</small></>}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fine">Sizes come straight from the reports. Only your care team can say what a change means.</p>
          </aside>
        </div>
      )}

      {scans.length > 0 && <button type="button" className="fab" onClick={() => setAdding(true)}><Icon name="plus" size={20} stroke={2.4} /> Add report</button>}
      <Sheet open={adding} onClose={() => setAdding(false)}>
        <AddScan onCancel={() => setAdding(false)} onDone={() => { setAdding(false); setSel(Infinity); }} />
      </Sheet>
      <dialog ref={dlg} className="wide" onClose={() => setImg(null)}>{img && <img src={img} alt="Scan picture" />}<form method="dialog"><button className="btn">Close</button></form></dialog>
    </>
  );
}
