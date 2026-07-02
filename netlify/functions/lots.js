// CardScout — shared Best-Lots store (syncs the list across devices).
// GET  /.netlify/functions/lots            -> { lots:[...], updated }
// POST /.netlify/functions/lots {lots:[...]} -> { ok:true, count }
// Backed by Netlify Blobs (no DB to manage).

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
      store = getStore({ name: 'cardscout-lots', siteID: process.env.NETLIFY_BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    } else {
      store = getStore('cardscout-lots');
    }
  }
  catch (e) { return { statusCode: 200, headers: CORS, body: JSON.stringify({ lots: [], error: 'store: ' + String(e && e.message || e) }) }; }

  try {
    if (event.httpMethod === 'POST') {
      let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) {}
      const lots = Array.isArray(body.lots) ? body.lots.slice(0, 100) : [];
      await store.setJSON('latest', { lots, updated: Date.now() });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, count: lots.length }) };
    }
    const data = await store.get('latest', { type: 'json' });
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data || { lots: [] }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ lots: [], error: String(e && e.message || e) }) };
  }
};
