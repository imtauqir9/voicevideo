// netlify/functions/track.js
// Anonymous event tracker. Stores aggregated counters as a JSON file
// (analytics.json) in your GitHub repo via the GitHub API.
// Uses the SAME GITHUB_TOKEN you already configured for feedback.js — no
// new env vars, no @netlify/blobs, no separate database.

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

const ALLOWED_EVENTS = new Set([
  'page_view', 'generation_started', 'generation_completed', 'generation_failed',
  'voice_generated', 'video_created', 'document_downloaded', 'feedback_submitted',
  'tutorial_opened', 'demo_limit_hit', 'own_key_used',
]);

const ALLOWED_PROPS = {
  page: 30, type: 20, length: 20, tone: 30, provider: 20,
  aspect: 10, quality: 10, format: 10, rating: 2, ref: 40, country: 8, device: 12,
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

function today() { return new Date().toISOString().slice(0, 10); }

function jsonResp(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

// ── In-memory queue + batched commit ─────────────────────────────
// Single function-container memory. Multiple events arriving close together
// get batched into one GitHub commit (saves API quota and avoids race conditions).
const PENDING = new Map(); // date -> { event:'count', ... }
let flushTimer = null;
let flushing = false;

function bump(eventName, props) {
  const date = today();
  if (!PENDING.has(date)) PENDING.set(date, {});
  const agg = PENDING.get(date);
  agg[eventName] = (agg[eventName] || 0) + 1;
  Object.keys(props || {}).forEach((k) => {
    const sliceKey = `${eventName}:${k}=${props[k]}`;
    agg[sliceKey] = (agg[sliceKey] || 0) + 1;
  });
}

async function flushToGithub() {
  if (flushing || PENDING.size === 0) return;
  flushing = true;
  const snapshot = new Map(PENDING);
  PENDING.clear();

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'imtauqir9';
  const repo  = process.env.GITHUB_REPO  || 'voicevideo';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path  = process.env.ANALYTICS_FILE || 'analytics.json';

  if (!token) {
    flushing = false;
    console.warn('track: GITHUB_TOKEN missing, dropping batch of', snapshot.size, 'days');
    return;
  }

  try {
    // 1. Fetch current analytics.json (or start fresh if 404)
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const getResp = await fetch(api, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'voicevideo-track' },
    });
    let existing = { events: {} };
    let sha = null;
    if (getResp.ok) {
      const meta = await getResp.json();
      sha = meta.sha;
      try { existing = JSON.parse(Buffer.from(meta.content || '', 'base64').toString('utf-8')); } catch (e) { existing = { events: {} }; }
      if (!existing.events) existing.events = {};
    } else if (getResp.status !== 404) {
      console.warn('track: GitHub GET failed', getResp.status);
      // Restore pending so it's retried
      for (const [d, a] of snapshot) {
        if (!PENDING.has(d)) PENDING.set(d, {});
        for (const k of Object.keys(a)) PENDING.get(d)[k] = (PENDING.get(d)[k] || 0) + a[k];
      }
      flushing = false;
      return;
    }

    // 2. Merge snapshot into existing
    for (const [date, agg] of snapshot) {
      if (!existing.events[date]) existing.events[date] = {};
      for (const k of Object.keys(agg)) {
        existing.events[date][k] = (existing.events[date][k] || 0) + agg[k];
      }
    }
    existing.updatedAt = new Date().toISOString();

    // 3. PUT it back
    const putBody = {
      message: `analytics: ${snapshot.size} day(s) updated`,
      content: Buffer.from(JSON.stringify(existing, null, 2), 'utf-8').toString('base64'),
      branch: branch,
    };
    if (sha) putBody.sha = sha;

    const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'voicevideo-track',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    });
    if (!putResp.ok) {
      const t = await putResp.text();
      console.warn('track: GitHub PUT failed', putResp.status, t.substring(0, 200));
      // Restore pending so next event triggers retry
      for (const [d, a] of snapshot) {
        if (!PENDING.has(d)) PENDING.set(d, {});
        for (const k of Object.keys(a)) PENDING.get(d)[k] = (PENDING.get(d)[k] || 0) + a[k];
      }
    }
  } catch (err) {
    console.warn('track: flush error', err && err.message);
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToGithub();
  }, 5000); // batch up to 5 seconds of events into one commit
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return jsonResp(405, { error: 'Method Not Allowed' });
  if (!isAllowedOrigin(event)) return jsonResp(403, { error: 'Origin not allowed' });

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {
    return jsonResp(400, { error: 'Invalid JSON' });
  }

  const eventName = String(payload.event || '').slice(0, 40);
  if (!ALLOWED_EVENTS.has(eventName)) {
    return jsonResp(200, { ok: true, skipped: true });
  }
  const props = sanitizeProps(payload.props);
  bump(eventName, props);
  scheduleFlush();

  return jsonResp(200, { ok: true });
};
