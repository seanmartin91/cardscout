// CardScout — eBay lot photo puller (no API key needed)
// Fetches an eBay listing's HTML server-side and returns its full-size photo URLs.
// GET /.netlify/functions/lotpull?url=<listing url OR item id>
//  -> { images:[ "https://i.ebayimg.com/images/g/<id>/s-l1600.jpg", ... ], title, count }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=600'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const q = event.queryStringParameters || {};
  let u = (q.url || '').trim();
  const idm = u.match(/(\d{9,})/);
  if (!/^https?:\/\//i.test(u) && idm) u = 'https://www.ebay.ca/itm/' + idm[1];
  if (!/^https?:\/\//i.test(u)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Give an eBay listing link or item number.' }) };

  try {
    const r = await fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-CA,en;q=0.9'
      }
    });
    const html = await r.text();
    const ids = new Set();
    const re = /i\.ebayimg\.com\/images\/g\/([A-Za-z0-9~_-]+)\/s-l\d+/g;
    let m; while ((m = re.exec(html)) !== null) ids.add(m[1]);
    const images = [...ids].slice(0, 24).map(id => 'https://i.ebayimg.com/images/g/' + id + '/s-l1600.jpg');
    const tm = html.match(/<title>([^<]+)<\/title>/i);
    const title = tm ? tm[1].replace(/\s*\|\s*eBay.*/i, '').replace(/^Details about\s*/i, '').trim() : '';
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ images, title, count: images.length }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
