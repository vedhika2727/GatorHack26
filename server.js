// Local development server, no dependencies.
//   GEMINI_API_KEY=your_key node server.js     then open http://localhost:3000
// Phones need HTTPS for motion sensors, so to test on a phone either deploy
// (see README) or use a tunnel such as `npx localtunnel --port 3000`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { explain, MODEL } = require('./lib/explain.js');
const { extractReport, explainOpinions } = require('./lib/scans-ai.js');
const ROUTES = {
  '/api/explain': (b) => explain(b.checkins, b.scans),
  '/api/extract': (b) => extractReport(b),
  '/api/opinions': (b) => explainOpinions(b),
};

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (ROUTES[url.pathname]) {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 12e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const out = await ROUTES[url.pathname](JSON.parse(raw || '{}'));
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  const file = path.normalize(path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(buf);
  });
}).listen(PORT, () => {
  console.log(`Chemo Nerve Check running at http://localhost:${PORT}`);
  console.log(process.env.GEMINI_API_KEY ? `Gemma model: ${MODEL}` : 'No GEMINI_API_KEY set: reports will use the built-in template instead of Gemma.');
});
