// Minimal Gemma 4 client for the Gemini API (Google AI Studio). No dependencies.
const MODEL = process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';

function parseJson(text) {
  const t = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

/**
 * askGemma({ system, text, image, maxTokens }) -> { ok:true, json, raw } | { ok:false, reason }
 * image: { mimeType, data (base64) } — Gemma 4 is multimodal.
 */
async function askGemma({ system, text, image, maxTokens = 900 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'GEMINI_API_KEY is not set, so Gemma is not connected.' };
  const parts = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  parts.push({ text });
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: 'minimal' } },
  };
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    return { ok: false, reason: `Could not reach the Gemini API (${e.name === 'TimeoutError' ? 'timed out' : e.message}).` };
  }
  if (!res.ok) return { ok: false, reason: `Gemini API returned ${res.status}: ${(await res.text()).slice(0, 240)}` };
  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
  const json = parseJson(raw);
  if (!json) return { ok: false, reason: 'Gemma replied, but not in the expected format.' };
  return { ok: true, json, raw };
}

export { askGemma, MODEL };
