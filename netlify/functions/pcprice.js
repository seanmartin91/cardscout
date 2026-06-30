// CardScout — PriceCharting proxy
// Graded (PSA 9/10, CGC, BGS), ungraded & sealed prices from PriceCharting.
// Token is read from the PRICECHARTING_TOKEN env var (never exposed to the browser).
//
// GET /.netlify/functions/pcprice?q=<query>
// ->  { enabled:true, best:{...prices}, alternatives:[...] }   (prices in GBP-ready USD numbers)
//     { enabled:false }   when no token is configured yet.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600'
};
const TOKEN = process.env.PRICECHARTING_TOKEN || '';
const cents = v => (v || v === 0) ? Math.round(v) / 100 : null; // PriceCharting returns pennies (USD)

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!TOKEN) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: false }) };

  const q = (event.queryStringParameters || {}).q || '';
  if (!q.trim()) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing ?q=' }) };

  try {
    // 1) search for matching products
    const sr = await fetch(`https://www.pricecharting.com/api/products?t=${TOKEN}&q=${encodeURIComponent(q)}`);
    const sj = await sr.json();
    const list = (sj.products || []).slice(0, 6);
    if (!list.length) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, best: null, alternatives: [] }) };

    // 2) full price detail for the top match
    const top = list[0];
    const dr = await fetch(`https://www.pricecharting.com/api/product?t=${TOKEN}&id=${top.id}`);
    const d = await dr.json();

    const best = {
      id: d.id || top.id,
      name: d['product-name'] || top['product-name'],
      set: d['console-name'] || top['console-name'],
      ungraded: cents(d['loose-price']),       // raw / ungraded
      psa9:     cents(d['graded-price']),        // PSA 9
      psa10:    cents(d['manual-only-price']),   // PSA 10
      cgc10:    cents(d['condition-17-price']),  // CGC 10
      bgs95:    cents(d['box-only-price']),      // BGS 9.5
      bgs10:    cents(d['bgs-10-price'])         // BGS 10
    };
    const alternatives = list.map(p => ({ id: p.id, name: p['product-name'], set: p['console-name'] }));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, best, alternatives }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
