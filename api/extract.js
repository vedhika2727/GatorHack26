// Vercel serverless function: POST /api/extract
import { ROUTES } from '../lib/routes.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    res.status(200).json(await ROUTES['/api/extract'](body));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
