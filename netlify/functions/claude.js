// netlify/functions/claude.js
// Proxies Claude API requests so CLAUDE_API_KEY stays on the server.
// Enforces a per-IP demo limit so visitors can try a few generations before
// being asked to bring their own key.

// In-memory counter — resets when the function container cycles.
// For production-grade limits, swap for Netlify Blobs or an external store.
const usage = new Map();
const DEMO_LIMIT = parseInt(process.env.DEMO_LIMIT || '3', 10);
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h rolling window

function clientIp(event) {
  const xff = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  if (xff) return xff.split(',')[0].trim();
  return event.headers['client-ip'] || 'unknown';
}

function getUsage(ip) {
  const now = Date.now();
  const rec = usage.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) {
    const fresh = { count: 0, start: now };
    usage.set(ip, fresh);
    return fresh;
  }
  return rec;
}

const ALLOWED_ORIGINS = [
  'https://voicevideo.io',
  'https://www.voicevideo.io',
  'http://localhost:8765',
  'http://localhost:8888',
  'http://127.0.0.1:8765',
];
function isAllowedOrigin(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const referer = event.headers.referer || event.headers.Referer || '';
  if (origin && ALLOWED_ORIGINS.includes(origin)) return true;
  if (referer) {
    try { return ALLOWED_ORIGINS.includes(new URL(referer).origin); } catch(e){}
  }
  return false;
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: { message: 'Method Not Allowed' } }) };
  }

  if (!isAllowedOrigin(event)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Origin not allowed.' } }),
    };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Server missing CLAUDE_API_KEY env var' } }),
    };
  }

  // Rate-limit by IP
  const ip = clientIp(event);
  const rec = getUsage(ip);
  if (rec.count >= DEMO_LIMIT) {
    const resetIn = Math.max(0, WINDOW_MS - (Date.now() - rec.start));
    const hours = Math.ceil(resetIn / (60 * 60 * 1000));
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Retry-After': String(Math.ceil(resetIn / 1000)),
      },
      body: JSON.stringify({
        error: {
          type: 'demo_limit',
          message: `Free demo limit reached (${DEMO_LIMIT} generations / 24h). Resets in ~${hours}h. Enter your own Claude API key to continue without limits.`,
        },
      }),
    };
  }

  // Forward request to Anthropic
  try {
    const body = event.body || '{}';
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });
    const text = await resp.text();

    // Only count successful generations against the demo quota
    if (resp.ok) {
      rec.count += 1;
      usage.set(ip, rec);
    }

    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Demo-Used': String(rec.count),
        'X-Demo-Limit': String(DEMO_LIMIT),
        'X-Demo-Remaining': String(Math.max(0, DEMO_LIMIT - rec.count)),
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Proxy error: ' + (err && err.message ? err.message : String(err)) } }),
    };
  }
};
