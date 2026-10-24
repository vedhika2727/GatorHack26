// API routes shared by the Vite dev server, the production Node server, and Vercel.
import { explain } from './explain.js';
import { extractReport, explainOpinions } from './scans-ai.js';

export const ROUTES = {
  '/api/explain': (b) => explain(b.checkins, b.scans),
  '/api/extract': (b) => extractReport(b),
  '/api/opinions': (b) => explainOpinions(b),
};

// Node-style (req, res) handler used by vite.config.js and server.js.
export function apiMiddleware(req, res, next) {
  const path = req.url.split('?')[0];
  const route = ROUTES[path];
  if (!route) return next ? next() : (res.statusCode = 404, res.end());
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 12e6) req.destroy(); });
  req.on('end', async () => {
    res.setHeader('Content-Type', 'application/json');
    try { res.end(JSON.stringify(await route(JSON.parse(raw || '{}')))); }
    catch (e) { res.statusCode = e.status || 500; res.end(JSON.stringify({ error: e.message })); }
  });
}
