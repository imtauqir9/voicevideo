// netlify/functions/stats.js
// Admin endpoint. Returns 30 days of aggregated event counts.
// Requires ?key=STATS_ADMIN_KEY (set in Netlify env vars).

function jsonResp(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const adminKey = process.env.STATS_ADMIN_KEY;
  if (!adminKey) {
    return jsonResp(500, { error: 'Server missing STATS_ADMIN_KEY' });
  }
  const params = event.queryStringParameters || {};
  if ((params.key || '') !== adminKey) {
    return jsonResp(403, { error: 'Forbidden' });
  }

  const days = Math.max(1, Math.min(90, parseInt(params.days || '30', 10)));
  const today = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'analytics', consistency: 'strong' });

    const byDay = {};
    const totals = {};

    for (const date of dates) {
      const agg = (await store.get('events:' + date, { type: 'json' })) || {};
      byDay[date] = agg;
      for (const k of Object.keys(agg)) {
        totals[k] = (totals[k] || 0) + agg[k];
      }
    }

    // Build a few convenience aggregates
    const dailySeries = {};
    const SIMPLE_EVENTS = [
      'page_view', 'generation_started', 'generation_completed', 'generation_failed',
      'voice_generated', 'video_created', 'feedback_submitted', 'tutorial_opened',
      'demo_limit_hit', 'own_key_used', 'document_downloaded',
    ];
    SIMPLE_EVENTS.forEach((ev) => {
      dailySeries[ev] = dates.map((d) => (byDay[d] && byDay[d][ev]) || 0);
    });

    // Conversion funnel for last 7 days
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
  } catch (err) {
    return jsonResp(500, { error: 'Stats read failed: ' + (err && err.message) });
  }
};
