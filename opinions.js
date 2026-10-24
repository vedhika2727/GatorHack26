// Vercel serverless function: POST /api/opinions  { a: {reader, text, extracted}, b: {...} }
const { explainOpinions } = require('../lib/scans-ai.js');
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    res.status(200).json(await explainOpinions(body || {}));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
