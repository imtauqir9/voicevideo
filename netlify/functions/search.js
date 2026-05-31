// netlify/functions/search.js
// Proxies Brave Search API so BRAVE_SEARCH_KEY stays on the server.
// Returns top 3 web results trimmed to {title, url, snippet}.
//
// Requires Netlify env var: BRAVE_SEARCH_KEY
// Sign up free at https://api.search.brave.com/  (2,000 queries/month)

const cache = new Map();         // {q: {ts, data}}
const CACHE_TTL = 10 * 60 * 1000; // 10 min cache to be friendly to free tier

const usage = new Map();          // per-IP simple ceiling
const DEMO_LIMIT = parseInt(process.env.SEARCH_DEMO_LIMIT || '20', 10);
const WINDOW_MS = 24 * 60 * 60 * 1000;

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
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (!isAllowedOrigin(event)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Origin not allowed.' } }),
    };
  }

  const apiKey = process.env.BRAVE_SEARCH_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Server missing BRAVE_SEARCH_KEY env var. Get a free key at api.search.brave.com.' } }),
    };
  }

  let q = '';
  let count = 3;
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    q = (params.q || '').toString().trim();
    count = Math.max(1, Math.min(5, parseInt(params.count || '3', 10)));
  } else {
    try {
      const body = JSON.parse(event.body || '{}');
      q = (body.q || '').toString().trim();
      count = Math.max(1, Math.min(5, parseInt(body.count || '3', 10)));
    } catch (e) {}
  }
  if (!q) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Query "q" is required' } }),
    };
  }

  // Rate-limit
  const ip = clientIp(event);
  const rec = getUsage(ip);
  if (rec.count >= DEMO_LIMIT) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Daily web-search limit reached for this IP (' + DEMO_LIMIT + ' / 24h).' } }),
    };
  }

  // Cache check
  const cacheKey = q.toLowerCase() + '|' + count;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts < CACHE_TTL)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cache': 'HIT' },
      body: JSON.stringify({ query: q, results: cached.data, cached: true }),
    };
  }

  try {
    const url = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(q) + '&count=' + count + '&safesearch=moderate&result_filter=web';
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'Brave Search ' + resp.status + ': ' + errText.substring(0, 200) } }),
      };
    }
    const data = await resp.json();
    const items = ((data.web && data.web.results) || []).slice(0, count).map(r => ({
      title:   r.title || '',
      url:     r.url || '',
      snippet: (r.description || r.snippet || '').replace(/<[^>]+>/g, '').substring(0, 280),
      site:    r.profile && r.profile.name || (r.url ? (new URL(r.url)).hostname.replace(/^www\./,'') : ''),
    }));

    rec.count += 1;
    usage.set(ip, rec);
    cache.set(cacheKey, { ts: Date.now(), data: items });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
        'X-Demo-Used': String(rec.count),
        'X-Demo-Limit': String(DEMO_LIMIT),
      },
      body: JSON.stringify({ query: q, results: items, cached: false }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Proxy error: ' + (err && err.message ? err.message : String(err)) } }),
    };
  }
};
