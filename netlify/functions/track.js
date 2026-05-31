// netlify/functions/track.js
// Receives anonymous events from the app and increments daily counters
// stored in Netlify Blobs. Zero PII — only event names + small prop strings.

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
    try { return ALLOWED_ORIGINS.includes(new URL(referer).origin); } catch (e) {}
  }
  return false;
}

// Allowed event names — anything else is dropped silently
const ALLOWED_EVENTS = new Set([
  'page_view',
  'generation_started',
  'generation_completed',
  'generation_failed',
  'voice_generated',
  'video_created',
  'document_downloaded',
  'feedback_submitted',
  'tutorial_opened',
  'demo_limit_hit',
  'own_key_used',
]);

// Allowed prop keys with max value length — keeps payload small + safe
const ALLOWED_PROPS = {
  page:       30,
  type:       20,
  length:     20,
  tone:       30,
  provider:   20,
  aspect:     10,
  quality:    10,
  format:     10,
  rating:     2,
  ref:        40,
  country:    8,
  device:     12,
};

function sanitizeProps(p) {
  if (!p || typeof p !== 'object') return {};
  const clean = {};
  for (const k of Object.keys(p)) {
    if (ALLOWED_PROPS[k]) {
      const v = String(p[k] || '').replace(/[^\w.\-:/]/g, '').slice(0, ALLOWED_PROPS[k]);
      if (v) clean[k] = v;
    }
  }
  return clean;
}

function today() {
  // YYYY-MM-DD in UTC
  return new Date().toISOString().slice(0, 10);
}

function jsonResp(statusCode, body, extra) {
  return {
    statusCode,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }, extra || {}),
    body: JSON.stringify(body),
  };
}

exports.handler = async (event, context) => {
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
    return jsonResp(405, { error: 'Method Not Allowed' });
  }
  if (!isAllowedOrigin(event)) {
    return jsonResp(403, { error: 'Origin not allowed' });
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {
    return jsonResp(400, { error: 'Invalid JSON' });
  }
  const eventName = String(payload.event || '').slice(0, 40);
  if (!ALLOWED_EVENTS.has(eventName)) {
    return jsonResp(200, { ok: true, skipped: true }); // silently drop unknown events
  }
  const props = sanitizeProps(payload.props);
  const date = today();

  // Attach country from request headers if present (no PII, no IP stored)
  const country = event.headers['x-country'] || event.headers['x-nf-geo']?.split(',')[0] || '';
  if (country && !props.country) props.country = String(country).slice(0, 8).toUpperCase();

  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'analytics', consistency: 'strong' });

    // Aggregate counter: events:YYYY-MM-DD -> { event_name: count, "event_name:prop=val": count }
    const key = 'events:' + date;
    let agg = (await store.get(key, { type: 'json' })) || {};
    agg[eventName] = (agg[eventName] || 0) + 1;
    // Also count per-prop slice for charts (e.g. generation_started:type=essay)
    Object.keys(props).forEach((k) => {
      const sliceKey = `${eventName}:${k}=${props[k]}`;
      agg[sliceKey] = (agg[sliceKey] || 0) + 1;
    });
    await store.setJSON(key, agg);

    return jsonResp(200, { ok: true });
  } catch (err) {
    // Don't fail the user-facing call if storage hiccups
    console.warn('track storage error:', err && err.message);
    return jsonResp(200, { ok: true, warning: 'logged-locally-only' });
  }
};
