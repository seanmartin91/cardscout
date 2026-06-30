// CardScout — simple shared-passcode gate.
// Set an APP_PASSCODE env var in Netlify to turn the gate on. If unset, the app is open.
//
// GET  /.netlify/functions/login            -> { enabled: <bool> }
// POST /.netlify/functions/login {code}     -> { ok: <bool> }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json'
};
const PASS = process.env.APP_PASSCODE || '';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ enabled: !!PASS }) };
  }
  let code = '';
  try { code = (JSON.parse(event.body || '{}').code || '').trim(); } catch (e) {}
  const ok = !!PASS && code === PASS;
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok }) };
};
