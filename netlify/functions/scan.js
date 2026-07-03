// CardScout v2 — auth + credit-gated scan (single card).
// Flow: verify Supabase JWT -> debit 1 credit -> structured vision extraction -> return.
// On AI failure: auto-refund. Uses Supabase REST (no SDK dependency).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json'
};

const SB_URL  = process.env.SUPABASE_URL || '';
const SB_ANON = process.env.SUPABASE_ANON_KEY || '';
const SB_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AI_KEY  = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const SCAN_COST = 1;

const EXTRACT_PROMPT =
  'You are identifying ONE Pokemon card from images (full card + a zoomed crop of the bottom strip). ' +
  'Return STRICT JSON only, no prose, with keys: name (string), collector_number (e.g. "4/102","SV049","TG12/TG30", else ""), ' +
  'set_symbol_description (string), language ("en"|"jp"|other), finish ("holo"|"reverse_holo"|"non_holo"|"unknown"), ' +
  'stamps (array of strings like "1st edition","shadowless"), is_graded_slab (boolean), confidence (0..1), ' +
  'visible_condition_flags (array of short strings). Read the collector number from the crop precisely — it is the most important field. ' +
  'Do NOT guess a price or a set you cannot support. JSON only.';

async function sbUser(jwt) {
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + jwt, apikey: SB_ANON } });
  if (!r.ok) return null;
  const u = await r.json(); return u && u.id ? u : null;
}
async function rpc(fn, args) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC },
    body: JSON.stringify(args)
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { ok: r.ok, status: r.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!SB_URL || !SB_SVC || !AI_KEY) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: false, error: 'Not configured yet (needs Supabase + AI_API_KEY env vars).' }) };

  const auth = (event.headers.authorization || event.headers.Authorization || '');
  const jwt = auth.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Sign in to scan.' }) };
  const user = await sbUser(jwt);
  if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Session expired — sign in again.' }) };

  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) {}
  const images = (Array.isArray(body.images) ? body.images : []).filter(Boolean).slice(0, 2);
  if (!images.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No image.' }) };

  const ref = 'scan_' + Date.now();
  // 1) debit first (atomic; blocks if insufficient)
  const deb = await rpc('debit_credits', { p_user: user.id, p_amount: SCAN_COST, p_reason: 'scan', p_ref: ref });
  if (!deb.ok) {
    const insufficient = /INSUFFICIENT_CREDITS/.test(JSON.stringify(deb.data));
    if (insufficient) return { statusCode: 402, headers: CORS, body: JSON.stringify({ error: 'Out of credits.', needCredits: true }) };
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Credit check failed.' }) };
  }
  const creditsLeft = typeof deb.data === 'number' ? deb.data : (Array.isArray(deb.data) ? deb.data[0] : null);

  // 2) run the vision extraction
  try {
    const content = images.map(u => {
      let source; if (u.startsWith('data:')) source = { type: 'base64', media_type: u.substring(5, u.indexOf(';')), data: u.split(',')[1] };
      else source = { type: 'url', url: u };
      return { type: 'image', source };
    });
    content.push({ type: 'text', text: EXTRACT_PROMPT });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, temperature: 0, messages: [{ role: 'user', content }] })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'AI error');
    const raw = j.content[0].text;
    const m = raw.match(/\{[\s\S]*\}/);
    const extracted = m ? JSON.parse(m[0]) : null;
    if (!extracted) throw new Error('Could not read the card. Try a clearer, glare-free photo.');
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, extracted, creditsLeft, ref }) };
  } catch (e) {
    // 3) refund on hard failure
    await rpc('refund_credits', { p_user: user.id, p_amount: SCAN_COST, p_ref: ref });
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e), refunded: true }) };
  }
};
