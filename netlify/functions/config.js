// CardScout — public client config. Serves ONLY the publishable Supabase values (safe in the browser).
// GET /.netlify/functions/config -> { enabled, supabaseUrl, supabaseAnonKey }
// The service-role key is NEVER exposed here.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({ enabled: !!(supabaseUrl && supabaseAnonKey), supabaseUrl, supabaseAnonKey })
  };
};
