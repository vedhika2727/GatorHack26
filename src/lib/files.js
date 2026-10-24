// Reading uploaded reports (PDF / text / photo) and shrinking images.
export function downscale(file, max, quality) {
  return new Promise((ok, bad) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => bad(new Error("That image couldn't be opened. Try a JPG or PNG."));
    img.src = url;
  });
}
function loadScript(src) {
  return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load the PDF reader. Paste the report text instead.')); document.head.appendChild(s); });
}
export async function pdfText(file) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let lastY = null;
    for (const it of tc.items) { const y = it.transform[5]; out += (lastY != null && Math.abs(y - lastY) > 2 ? '\n' : ' ') + it.str; lastY = y; }
    out += '\n';
  }
  if (out.trim().length < 40) throw new Error('This PDF looks like a scanned picture with no text. Upload a photo of it instead.');
  return out;
}
