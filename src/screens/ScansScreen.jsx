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

function Quote({ src }) {
  if (!src) return <span className="muted">This size couldn’t be matched to one sentence. Check the full report text.</span>;
  const out = []; let at = 0;
  src.marks.forEach(([x, y], k) => { out.push(src.sentence.slice(at, x), <mark key={k}>{src.sentence.slice(x, y)}</mark>); at = y; });
  out.push(src.sentence.slice(at));
  return <>“{out}”</>;
}

function Measurements({ ex, text }) {
  const [open, setOpen] = useState(null);
  if (!ex.lesions.length) return <p className="muted">No sizes were found in this report.</p>;
  const big = Math.max(...ex.lesions.map((l) => Math.max(l.sizeMm, l.previousMm || 0)));
  return (
    <div className="table-wrap">
      <table className="lesions">
        <thead><tr><th scope="col">Spot</th><th scope="col">Before</th><th scope="col">Now</th><th scope="col">Change</th></tr></thead>
        <tbody>{ex.lesions.map((l, k) => {
          const c = pct(l.sizeMm, l.previousMm);
          const on = open === k;
          return [
            <tr key={k} className={on ? 'src-open' : ''}>
              <td><Glossed text={l.location} /></td>
              <td className="muted">{l.previousMm ? `${l.previousMm} mm` : '–'}</td>
              <td><button type="button" className="size-btn" aria-expanded={on} aria-controls={`src-${k}`} onClick={() => setOpen(on ? null : k)}>{l.sizeMm} mm</button><span className="sizebar" aria-hidden="true"><span style={{ width: `${(l.sizeMm / big) * 100}%` }} />{l.previousMm && <i style={{ left: `${(l.previousMm / big) * 100}%` }} />}</span></td>
              <td className={c == null ? 'muted' : c < 0 ? 'down' : c > 0 ? 'up' : ''}>{c == null ? 'new here' : signed(c)}</td>
            </tr>,
            on && <tr key={k + 's'} className="src-row" id={`src-${k}`}><td colSpan={4}><span className="src-label">From the report</span><Quote src={Scans.sourceOf(text, l)} /></td></tr>,
          ];
        })}</tbody>
      </table>
      <p className="fine table-note">Tap a size to see the sentence it was taken from.</p>
    </div>
  );
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
      <Measurements ex={ex} text={s.text} />
      {!!s.images?.length && <div className="thumbs">{s.images.map((src, k) => <button key={k} type="button" aria-label={`Open scan picture ${k + 1}`} onClick={() => onOpenImage(src)}><img src={src} alt="" /></button>)}</div>}
      <Words text={s.text} />
      <details className="more"><summary>Full report text</summary><div className="report-text"><Glossed text={s.text} /></div></details>
      {user.mode !== 'demo' && <button type="button" className="btn ghost small" style={{ marginTop: 10 }} onClick={async () => { if (await confirm('Remove this scan report?', 'Remove report', true)) removeScan(s.id); }}><Icon name="trash" size={16} /> Remove report</button>}
    </div>
  );
}

/** One spot across doctors: a thin bar per doctor, labeled with their name, as long as the size they gave. */
const READER_COLORS = ['var(--navy)', 'var(--rose)', 'var(--forest)', 'var(--ink-2)', '#8A7A55', '#6B5A8E'];
const readerColor = (i) => READER_COLORS[i % READER_COLORS.length];
function Bars({ values, reads, max }) {
  return (
    <div className="dbars">
      {values.map((v, i) => (
        <div key={i} className="dbar" style={{ '--c': readerColor(i) }}>
          <span className="sr-only">{reads[i].reader}: </span>
          <span className="dbar-track" aria-hidden="true">{v != null && <i style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />}</span>
          <span className="dbar-v">{v != null ? `${v} mm` : 'not measured'}</span>
        </div>
      ))}
    </div>
  );
}

function CompareView({ reads }) {
  const { saveScan, user } = useStore();
  const cmp = Scans.compareMany(reads);
  const lastRead = reads[reads.length - 1];
  const [o, setO] = useState(lastRead.opinion || null);
  const [busy, setBusy] = useState(false);
  const max = Math.ceil(Math.max(10, ...cmp.rows.flatMap((x) => x.values.filter((v) => v != null))) / 10) * 10;
  const agree = cmp.rows.filter((x) => x.status === 'agree').length, differ = cmp.rows.length - agree;
  const who = (vals) => vals.map((v, i) => (v != null ? reads[i].reader : null)).filter(Boolean);
  const note = (x) => (x.status === 'agree' ? (x.spread ? `Within ${x.spread} mm` : 'Same size') : x.status === 'differ' ? `${x.spread} mm apart` : `Only ${who(x.values).join(' and ')} measured it`);
  return (
    <div className="read cmp">
      <p className="compare-lead">{reads.length} radiologists read this {reads[0].kind}. {cmp.rows.length ? `They agree on ${agree} of ${cmp.rows.length} spots${differ ? ` and see ${differ} differently` : ''}.` : ''}</p>

      <ul className="reader-key" aria-label="Who read it">
        {reads.map((r, i) => <li key={r.id} style={{ '--c': readerColor(i) }}><i aria-hidden="true" /><b>{r.reader}</b><span>{fmtDate(r.date)}</span></li>)}
      </ul>

      <div className="spots-cmp">
        {cmp.rows.map((x, k) => (
          <div key={k} className={`cspot ${x.status}`}>
            <div className="cspot-name">
              <b>{x.location[0].toUpperCase() + x.location.slice(1)}</b>
              <span className="cspot-status">{note(x)}</span>
            </div>
            <Bars values={x.values} reads={reads} max={max} />
          </div>
        ))}
        </div>
      <p className="fine cmp-note">Each color is one doctor. Bars that end in the same place mean they agree. A few millimeters apart is common; bigger gaps are worth asking about.</p>

      <div className="also">
        <div className="also-row"><span className="also-k">New finding mentioned</span>{cmp.newFinding.map((v, i) => <span key={i}><small>{reads[i].reader}</small>{v ? 'Yes' : 'No'}</span>)}</div>
        <div className="also-row"><span className="also-k">Overall, compared with the last scan</span>{cmp.change.map((v, i) => <span key={i}><small>{reads[i].reader}</small>{SHORT[v] || v}</span>)}</div>
      </div>

      {o && <div className="explain">
        <p>{o.summary}</p>
        <h4>Questions for your oncologist</h4>
        <ul>{o.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        <p className="fine">{o.source === 'gemma' ? `Written by Gemma 4 (${o.model}). It doesn’t say which doctor is right.` : `Template text, Gemma not connected. ${o.note || ''}`}</p>
      </div>}
      <button type="button" className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const r = await explainOpinions(reads); setO(r); setBusy(false); if (user.mode !== 'demo') saveScan({ ...lastRead, opinion: r }).catch(() => {}); }}>
        {busy ? 'Comparing…' : o ? 'Explain again' : `Explain the differences`}
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
      {tab === 'compare' && group.length > 1 ? <CompareView reads={group} /> : <ReadView s={s} onOpenImage={onOpenImage} />}
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
        <Measurements ex={ex} text={pending.scan.text} />
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
      <label className="field">Who read it<input id="sc-reader" value={f.reader} onChange={(e) => setF({ ...f, reader: e.target.value })} placeholder="Doctor’s name or hospital, like Dr. Patel or UF Health" maxLength={80} /><span className="hint">This names the read. If you add more than one report for the same scan, they’re compared side by side under these names.</span></label>
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
          <div className="sc-head">
            <h1 id="scans-h">Scans</h1>
            <p className="mono">{scans.length} report{scans.length === 1 ? '' : 's'} · every size checked against the report’s own words</p>
          </div>
          {scans.length ? <div className="sc-room">
            <div className="lightbox"><SpotChart data={data} selected={i} focus={focus} onPick={setSel} onFocus={setFocus} /></div>
            <p className="lightbox-hint">Tap a line to follow one spot. Tap a date to open that scan.</p>
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
          </div> : (
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
