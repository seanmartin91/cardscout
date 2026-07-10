// CardScout — read the signed-in user's credit balance.
// GET /.netlify/functions/credits   (Authorization: Bearer <supabase access token>)
//   -> { enabled, credits, email }
// Verifies the Supabase JWT, then reads profiles.credits with the service-role key.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const URL = process.env.SUPABASE_URL || '';
  const ANON = process.env.SUPABASE_ANON_KEY || '';
  const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!(URL && ANON && SVC)) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: false }) };

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'not signed in' }) };

  try {
    const ur = await fetch(URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
    const user = await ur.json();
    if (!ur.ok || !user || !user.id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'invalid session' }) };

    const pr = await fetch(URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=credits', { headers: { apikey: SVC, Authorization: 'Bearer ' + SVC } });
    const rows = await pr.json();
    const credits = (Array.isArray(rows) && rows[0]) ? rows[0].credits : null;
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, credits, email: user.email }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: true, credits: null, error: String(e && e.message || e) }) };
  }
};
