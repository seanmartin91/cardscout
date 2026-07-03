// CardScout — shared Box-Deals store (in-stock sealed products the scout finds; syncs across devices).
// GET  /.netlify/functions/boxdeals               -> { deals:[...], updated }
// POST /.netlify/functions/boxdeals {deals:[...]}  -> { ok:true, count }
// Each deal: { product, set, retailer, region, price, currency, inStock, url, ev, margin, verdict, note, date }
// Backed by Netlify Blobs (same pattern as lots.js).

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
      store = getStore({ name: 'cardscout-boxdeals', siteID: process.env.NETLIFY_BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    } else {
      store = getStore('cardscout-boxdeals');
    }
  }
  catch (e) { return { statusCode: 200, headers: CORS, body: JSON.stringify({ deals: [], error: 'store: ' + String(e && e.message || e) }) }; }

  try {
    if (event.httpMethod === 'POST') {
      let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) {}
      const deals = Array.isArray(body.deals) ? body.deals.slice(0, 80) : [];
      await store.setJSON('latest', { deals, updated: Date.now() });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, count: deals.length }) };
    }
    const data = await store.get('latest', { type: 'json' });
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data || { deals: [] }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ deals: [], error: String(e && e.message || e) }) };
  }
};
