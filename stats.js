// netlify/functions/stats.js
// Admin endpoint. Reads analytics.json from the GitHub repo (via API) and
// returns the last 30 days of aggregated event counts.
// Requires ?key=STATS_ADMIN_KEY to access.

function jsonResp(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const adminKey = process.env.STATS_ADMIN_KEY;
  if (!adminKey) return jsonResp(500, { error: 'Server missing STATS_ADMIN_KEY' });
  const params = event.queryStringParameters || {};
  if ((params.key || '') !== adminKey) return jsonResp(403, { error: 'Forbidden' });

  const days = Math.max(1, Math.min(90, parseInt(params.days || '30', 10)));

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'imtauqir9';
  const repo  = process.env.GITHUB_REPO  || 'voicevideo';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path  = process.env.ANALYTICS_FILE || 'analytics.json';

  if (!token) return jsonResp(500, { error: 'Server missing GITHUB_TOKEN' });

  // Read analytics.json from repo
  let allEvents = {};
  try {
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const resp = await fetch(api, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'voicevideo-stats' },
    });
    if (resp.ok) {
      const meta = await resp.json();
      const text = Buffer.from(meta.content || '', 'base64').toString('utf-8');
      try {
        const parsed = JSON.parse(text);
        allEvents = (parsed && parsed.events) || {};
      } catch (e) {
        allEvents = {};
      }
    } else if (resp.status === 404) {
      // No analytics file yet — empty data
      allEvents = {};
    } else {
      const t = await resp.text();
      return jsonResp(resp.status, { error: `GitHub read failed: ${t.substring(0, 200)}` });
    }
  } catch (err) {
    return jsonResp(500, { error: `Stats read error: ${err && err.message}` });
  }

  // Build date window
  const today = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const byDay = {};
  const totals = {};
  for (const date of dates) {
    const agg = allEvents[date] || {};
    byDay[date] = agg;
    for (const k of Object.keys(agg)) {
      totals[k] = (totals[k] || 0) + agg[k];
    }
  }

  const dailySeries = {};
  const SIMPLE_EVENTS = [
    'page_view', 'generation_started', 'generation_completed', 'generation_failed',
    'voice_generated', 'video_created', 'feedback_submitted', 'tutorial_opened',
    'demo_limit_hit', 'own_key_used', 'document_downloaded',
  ];
  SIMPLE_EVENTS.forEach((ev) => {
    dailySeries[ev] = dates.map((d) => (byDay[d] && byDay[d][ev]) || 0);
  });

  const fLast7 = (ev) => dates.slice(-7).reduce((s, d) => s + ((byDay[d] && byDay[d][ev]) || 0), 0);
  const funnel = {
    visits: fLast7('page_view'),
    generation_started: fLast7('generation_started'),
    generation_completed: fLast7('generation_completed'),
    voice_generated: fLast7('voice_generated'),
    video_created: fLast7('video_created'),
  };

  return jsonResp(200, {
    ok: true,
    windowDays: days,
    dates,
    dailySeries,
    totals,
    funnel,
    generatedAt: new Date().toISOString(),
  });
};
