// CardScout v2 — Stripe webhook. On checkout.session.completed, credits the user's account.
// Verifies the Stripe signature (no SDK). Maps amount paid -> credits. Identifies the user via
// client_reference_id (the app appends the Supabase user id to the Payment Link URL).
// Env: STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional CREDIT_TIERS json.

const crypto = require('crypto');

const WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const SB_URL = process.env.SUPABASE_URL || '';
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// cents(CAD) -> credits. Adjust if you change pack prices.
const TIERS = (() => { try { return JSON.parse(process.env.CREDIT_TIERS || ''); } catch (_) { return { '700': 60, '1400': 150, '2800': 400 }; } })();

function verify(payload, sigHeader, secret) {
  try {
    const parts = Object.fromEntries(sigHeader.split(',').map(kv => kv.split('=')));
    const signed = crypto.createHmac('sha256', secret).update(parts.t + '.' + payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(parts.v1));
  } catch (_) { return false; }
}
async function rpc(fn, args) {
  return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC },
    body: JSON.stringify(args)
  });
}

exports.handler = async (event) => {
  if (!WH_SECRET || !SB_URL || !SB_SVC) return { statusCode: 200, body: 'not configured' };
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const payload = event.body || '';
  if (!sig || !verify(payload, sig, WH_SECRET)) return { statusCode: 400, body: 'bad signature' };

  let evt; try { evt = JSON.parse(payload); } catch (_) { return { statusCode: 400, body: 'bad json' }; }
  if (evt.type !== 'checkout.session.completed') return { statusCode: 200, body: 'ignored' };

  const s = evt.data.object;
  const userId = s.client_reference_id;                      // Supabase user id, set by the app on the pay link
  const cents = String(s.amount_total || '');
  const credits = TIERS[cents] || 0;
  if (!userId || !credits) return { statusCode: 200, body: 'no user or unknown tier' };

  const r = await rpc('credit_purchase', { p_user: userId, p_amount: credits, p_ref: s.id });
  return { statusCode: r.ok ? 200 : 500, body: r.ok ? 'credited' : 'credit failed' };
};
