// CardScout — eBay Browse API proxy (deal finder + lot photo puller)
// Keys read from env vars EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (never exposed to browser).
// Marketplace defaults to EBAY_GB (UK); override with EBAY_MARKETPLACE.
//
// GET /.netlify/functions/ebay?mode=search&q=<query>&limit=24
//      -> { enabled, items:[{title,price,currency,image,url,id}] }
// GET /.netlify/functions/ebay?mode=item&id=<itemId or eBay URL>
//      -> { enabled, item:{title,price,currency,url,images:[...]} }   (images = all listing photos)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json'
};
const ID = process.env.EBAY_CLIENT_ID || '';
const SECRET = process.env.EBAY_CLIENT_SECRET || '';
const MKT = process.env.EBAY_MARKETPLACE || 'EBAY_GB';

let cache = { token: null, exp: 0 };
async function getToken() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  const basic = Buffer.from(`${ID}:${SECRET}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(j.error_description || 'eBay auth failed (check keys / production keyset)');
  cache = { token: j.access_token, exp: Date.now() + ((j.expires_in || 7200) - 60) * 1000 };
  return cache.token;
}
const legacyId = s => { const m = String(s || '').match(/(\d{9,})/); return m ? m[1] : String(s || ''); };
const num = v => v != null ? parseFloat(v) : null;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!ID || !SECRET) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: false }) };

  const q = event.queryStringParameters || {};
  const mode = q.mode || 'search';
  try {
    const tok = await getToken();
    const H = { 'Authorization': 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': (q.mkt || MKT), 'Content-Type': 'application/json' };

    if (mode === 'item') {
      const id = legacyId(q.id);
      const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(id)}`, { headers: H });
      const d = await r.json();
      if (d.errors) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, item: null, error: d.errors[0] && d.errors[0].message }) };
      const images = [d.image && d.image.imageUrl, ...((d.additionalImages || []).map(i => i.imageUrl))].filter(Boolean);
      // Pull the seller's own words — title + description + condition + item specifics — a lot listing usually names every card here.
      const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
      const aspects = (d.localizedAspects || []).map(a => `${a.name}: ${a.value}`).join('; ');
      const desc = (strip(d.shortDescription) + ' ' + strip(d.description)).trim().slice(0, 4000);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, item: { title: d.title, price: num(d.price && d.price.value), currency: d.price && d.price.currency, url: d.itemWebUrl, images, condition: d.condition || null, conditionDescription: strip(d.conditionDescription) || null, aspects, description: desc } }) };
    }

    const term = q.q || '';
    if (!term.trim()) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing ?q=' }) };
    const limit = Math.min(parseInt(q.limit || '24', 10) || 24, 50);
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(term)}&limit=${limit}&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}&sort=price`;
    const r = await fetch(url, { headers: H });
    const d = await r.json();
    const items = (d.itemSummaries || []).map(it => ({
      title: it.title, price: num(it.price && it.price.value), currency: it.price && it.price.currency,
      image: it.image && it.image.imageUrl, url: it.itemWebUrl, id: it.itemId,
      shipping: (it.shippingOptions && it.shippingOptions[0] && it.shippingOptions[0].shippingCost) ? num(it.shippingOptions[0].shippingCost.value) : null
    }));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, total: d.total || items.length, items }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
