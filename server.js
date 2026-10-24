// Production server: serves the built React app (dist/) and the Gemma API routes.
//   npm run build && GEMINI_API_KEY=your_key npm start   ->  http://localhost:3000
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiMiddleware } from './lib/routes.js';
import { MODEL } from './lib/gemma.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return apiMiddleware(req, res);
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Run "npm run build" first.'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(buf);
  });
}).listen(PORT, () => {
  console.log(`Chemo Nerve Check running at http://localhost:${PORT}`);
  console.log(process.env.GEMINI_API_KEY ? `Gemma model: ${MODEL}` : 'No GEMINI_API_KEY set: reports use built-in template text instead of Gemma.');
});
