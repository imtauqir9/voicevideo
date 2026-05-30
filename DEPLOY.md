# VoiceVideo — Free Demo Deploy (Netlify)

This guide sets up the **free demo** so visitors can try the app a few times without entering their own API keys. Your keys live encrypted on Netlify and are never exposed in the HTML.

---

## What's in the repo

```
index.html              ← your landing page (don't change)
app.html                ← the studio (calls /.netlify/functions/* in demo mode)
netlify.toml            ← Netlify config (functions live in netlify/functions/)
netlify/functions/
  claude.js             ← proxies Claude API + per-IP rate limit
  eleven.js             ← proxies ElevenLabs API + per-IP rate limit
.nojekyll
```

---

## Step 1 — Get your API keys

- **Claude** → https://console.anthropic.com → API Keys → starts with `sk-ant-api03-...`
- **ElevenLabs** → https://elevenlabs.io → Profile → API Key

Don't paste them into any file. You'll add them to Netlify directly in Step 3.

---

## Step 2 — Connect this repo to Netlify

1. Sign in at https://app.netlify.com
2. Click **Add new site → Import an existing project**
3. Pick **GitHub**, authorise, and choose `imtauqir9/voicevideo`
4. Build settings: leave **Build command** empty, set **Publish directory** to `.` (just a dot)
5. Click **Deploy**

The first deploy will succeed but the demo proxy won't work yet because the keys aren't set. Continue to Step 3.

---

## Step 3 — Add your keys to Netlify (encrypted env vars)

1. In your new site dashboard, go to **Site configuration → Environment variables**
2. Click **Add a variable** and add these three:

   | Key | Value |
   |---|---|
   | `CLAUDE_API_KEY` | your `sk-ant-api03-...` key |
   | `ELEVENLABS_API_KEY` | your ElevenLabs key |
   | `DEMO_LIMIT` | `3`  *(generations allowed per IP per 24h — tweak as you like)* |
   | `BRAVE_SEARCH_KEY` | your Brave Search API key  *(optional — only needed if you want the "Ground with web search" toggle to work)* |
   | `SEARCH_DEMO_LIMIT` | `20`  *(optional — web searches per IP per 24h, defaults to 20)* |

3. (Optional) Add `ELEVENLABS_VOICE_ID` if you want to lock the demo to a specific voice. Defaults to `kmiDQH3kczbRzoifN5Qv`.

4. (Optional, for web grounding) Get a **free Brave Search API key** at https://api.search.brave.com/ — 2,000 queries/month free, no credit card. Paste it as `BRAVE_SEARCH_KEY`. Without this key, the "Ground with web search" toggle in the form will simply do nothing instead of breaking.

4. Go to **Deploys → Trigger deploy → Deploy site** so the env vars take effect.

---

## Step 4 — Test the demo

1. Open your Netlify URL (e.g. `https://voicevideo.netlify.app/app.html`)
2. **Leave the Claude and ElevenLabs key fields empty**
3. Pick a content type, enter a topic, hit **Generate**
4. You should see the amber **Free demo · 2 / 3 generations left** banner appear
5. After hitting the limit you'll get a clear message telling visitors to bring their own keys

---

## How the rate limit works

- One in-memory counter per IP, resets every 24h
- Counter only ticks up on **successful** generations (errors don't burn quota)
- Default is 3 generations / 24h — change `DEMO_LIMIT` in env vars any time

The counter lives inside the function container's memory. Netlify recycles containers periodically, so the count may reset earlier than 24h — that's fine for a free demo. If you want stricter, persistent limits, swap the `usage` Map in `netlify/functions/claude.js` for a [Netlify Blobs](https://docs.netlify.com/blobs/overview/) store.

---

## How users go from demo to unlimited

When a visitor pastes their own API key into either field, the app stops using your demo proxy entirely and calls the API directly from their browser with their key. No further charges to you.

---

## Safety notes

- Your `CLAUDE_API_KEY` and `ELEVENLABS_API_KEY` are **never** sent to the browser
- Set spend caps in your Anthropic and ElevenLabs dashboards as a backstop
- Watch the Netlify **Functions → Logs** tab for suspicious traffic
- If you ever see abuse, rotate the keys in the providers' dashboards and update them in Netlify env vars — no code changes needed
