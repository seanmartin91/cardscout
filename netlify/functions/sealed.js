// CardScout — sealed-product pricing proxy
// Reads TCGCSV (free TCGplayer market data, server-side only — no browser CORS)
// and returns sealed pack/box prices for a given set, with CORS enabled.
//
// GET /.netlify/functions/sealed?set=<name>&type=<optional product type>
// ->  { matched, groupId, items:[{ productId, name, image, market, low, mid }] }

const CAT = 3; // TCGplayer category id for Pokemon

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600'
};

const j = (url) => fetch(url, { headers: { 'User-Agent': 'CardScout/1.0' } }).then(r => r.json());
const arr = (x) => Array.isArray(x) ? x : (x && Array.isArray(x.results) ? x.results : []);

const SEALED_RE = /booster box|elite trainer|trainer box|booster bundle|booster pack|sleeved booster|\bbox\b|\betb\b|\btin\b|collection|premium|case|blister|bundle/i;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const q = event.queryStringParameters || {};
  const term = (q.set || '').toLowerCase().trim();
  const typeWanted = (q.type || '').toLowerCase().trim();
  if (!term) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing ?set=' }) };

  try {
    // 1) find the matching set/group
    const groups = arr(await j(`https://tcgcsv.com/tcgplayer/${CAT}/groups`));
    const norm = s => (s || '').toLowerCase();
    let cands = groups.filter(g => {
      const n = norm(g.name); if (!n || n.length < 2) return false;
      return term === n || term.includes(n) || n.includes(term);
    });
    if (!cands.length) {
      const toks = term.split(/\s+/).filter(w => w.length > 1);
      cands = groups
        .map(g => ({ g, score: toks.filter(w => norm(g.name).includes(w)).length }))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.g);
    }
    cands.sort((a, b) => (norm(b.name).length - norm(a.name).length)
      || (new Date(b.publishedOn || 0) - new Date(a.publishedOn || 0)));
    if (!cands.length) return { statusCode: 200, headers: CORS, body: JSON.stringify({ matched: null, items: [] }) };
    const group = cands[0];

    // 2) products + prices for that group
    const [products, prices] = await Promise.all([
      j(`https://tcgcsv.com/tcgplayer/${CAT}/${group.groupId}/products`).then(arr),
      j(`https://tcgcsv.com/tcgplayer/${CAT}/${group.groupId}/prices`).then(arr)
    ]);

    const priceMap = {};
    for (const p of prices) {
      const id = p.productId;
      const m = p.marketPrice ?? p.midPrice ?? p.lowPrice ?? null;
      if (m == null) continue;
      // keep the highest market entry per product (covers normal/foil rows)
      if (!priceMap[id] || (m > priceMap[id].market)) priceMap[id] = { market: m, low: p.lowPrice ?? null, mid: p.midPrice ?? null };
    }

    let items = products
      .filter(p => SEALED_RE.test(p.name || ''))
      .map(p => ({ productId: p.productId, name: p.name, image: p.imageUrl || null, ...(priceMap[p.productId] || {}) }))
      .filter(x => x.market != null && x.market > 0);

    if (typeWanted) {
      const key = typeWanted.split(/\s+/)[0];
      const f = items.filter(x => (x.name || '').toLowerCase().includes(key));
      if (f.length) items = f;
    }
    items.sort((a, b) => (b.market || 0) - (a.market || 0));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ matched: group.name, groupId: group.groupId, count: items.length, items: items.slice(0, 12) }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
