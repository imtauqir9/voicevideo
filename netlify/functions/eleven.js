// netlify/functions/eleven.js
// Proxies ElevenLabs text-to-speech so ELEVENLABS_API_KEY stays on the server.
// Shares the same per-IP demo limit as the Claude proxy.

const usage = new Map();
const DEMO_LIMIT = parseInt(process.env.DEMO_LIMIT || '3', 10);
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-Voice-Id',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: { message: 'Method Not Allowed' } }) };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Server missing ELEVENLABS_API_KEY env var' } }),
    };
  }

  // Default voice can be overridden via env, then via X-Voice-Id header, then via JSON body.voice_id
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID || 'kmiDQH3kczbRzoifN5Qv';
  let voiceId = event.headers['x-voice-id'] || event.headers['X-Voice-Id'] || defaultVoice;

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { /* ignore */ }
  if (payload.voice_id) {
    voiceId = payload.voice_id;
    delete payload.voice_id;
  }

  // Rate-limit
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
          message: `Free demo limit reached (${DEMO_LIMIT} voice generations / 24h). Resets in ~${hours}h. Enter your own ElevenLabs API key to continue without limits.`,
        },
      }),
    };
  }

  try {
    const resp = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'ElevenLabs ' + resp.status + ': ' + errText } }),
      };
    }

    rec.count += 1;
    usage.set(ip, rec);

    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'X-Demo-Used': String(rec.count),
        'X-Demo-Limit': String(DEMO_LIMIT),
        'X-Demo-Remaining': String(Math.max(0, DEMO_LIMIT - rec.count)),
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Proxy error: ' + (err && err.message ? err.message : String(err)) } }),
    };
  }
};
