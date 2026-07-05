// CardScout — shared Local-Hunt store (local Pokémon lots the scout finds on Kijiji / Facebook Marketplace).
// GET  /.netlify/functions/localhunt               -> { leads:[...], updated }
// POST /.netlify/functions/localhunt {leads:[...]}  -> { ok:true, count }
// Each lead: { title, price, currency, location, source, url, note, date }
// Backed by Netlify Blobs (same pattern as boxdeals.js / lots.js).

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  let store;
  try {
    if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
      store = getStore({ name: 'cardscout-localhunt', siteID: process.env.NETLIFY_BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    } else {
      store = getStore('cardscout-localhunt');
    }
  }
  catch (e) { return { statusCode: 200, headers: CORS, body: JSON.stringify({ leads: [], error: 'store: ' + String(e && e.message || e) }) }; }

  try {
    if (event.httpMethod === 'POST') {
      let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) {}
      const leads = Array.isArray(body.leads) ? body.leads.slice(0, 60) : [];
      await store.setJSON('latest', { leads, updated: Date.now() });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, count: leads.length }) };
    }
    const data = await store.get('latest', { type: 'json' });
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data || { leads: [] }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ leads: [], error: String(e && e.message || e) }) };
  }
};
