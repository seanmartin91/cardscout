// CardScout — shared AI vision proxy. Holds ONE server-side key so users don't need their own.
// POST { prompt, images:[url|dataURI,...] } -> { text }  |  { enabled:false } if no key set.
// Per-IP daily cap protects the key from abuse. Set AI_API_KEY (+ optional AI_PROVIDER) in Netlify.

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

const KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
const PROVIDER = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.AI_API_KEY ? 'openai' : 'anthropic')).toLowerCase();
const DAILY_CAP = parseInt(process.env.AI_DAILY_CAP || '400', 10);

function rlStore() {
  const opts = { name: 'cardscout-rl' };
  if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) { opts.siteID = process.env.NETLIFY_BLOBS_SITE_ID; opts.token = process.env.NETLIFY_BLOBS_TOKEN; }
  return getStore(opts);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!KEY) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: false }) };

  // Per-IP daily rate limit
  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  try {
    const store = rlStore(); const k = 'rl:' + day + ':' + ip;
    const rec = (await store.get(k, { type: 'json' })) || { c: 0 };
    if (rec.c >= DAILY_CAP) return { statusCode: 429, headers: CORS, body: JSON.stringify({ error: 'Daily scan limit reached. Try again tomorrow, or add your own AI key in Settings.' }) };
    rec.c++; await store.setJSON(k, rec);
  } catch (e) { /* if rate-limit store fails, don't block the request */ }

  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) {}
  const prompt = String(body.prompt || '').slice(0, 6000);
  const images = (Array.isArray(body.images) ? body.images : []).filter(Boolean).slice(0, 10);
  if (!prompt || !images.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Need a prompt and at least one image.' }) };

  try {
    let text = '';
    if (PROVIDER === 'openai') {
      const content = [{ type: 'text', text: prompt }, ...images.map(u => ({ type: 'image_url', image_url: { url: u } }))];
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }, body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content }], max_tokens: 900 }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message); text = j.choices[0].message.content;
    } else {
      const content = images.map(u => { let source; if (u.startsWith('data:')) { source = { type: 'base64', media_type: u.substring(5, u.indexOf(';')), data: u.split(',')[1] }; } else { source = { type: 'url', url: u }; } return { type: 'image', source }; });
      content.push({ type: 'text', text: prompt });
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900, messages: [{ role: 'user', content }] }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || (j.error.type || 'AI error')); text = j.content[0].text;
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, text }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
