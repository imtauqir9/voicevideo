# VoiceVideo — Security Runbook

How the app is hardened, what to monitor, and what to do if something goes wrong.

---

## What's already in place

### 1. Keys never reach the browser
- All API keys (`CLAUDE_API_KEY`, `ELEVENLABS_API_KEY`, `BRAVE_SEARCH_KEY`, `GITHUB_TOKEN`, `RESEND_API_KEY`) live in Netlify's encrypted environment variables
- Netlify Functions inject them at runtime only — they never appear in the HTML, in network responses, or in client-side JavaScript
- "Contains secret values" is enabled on all sensitive keys, so even Netlify UI hides them from view after creation

### 2. Per-IP rate limits
| Function | Limit | Window |
|---|---|---|
| `claude` | 3 generations | 24h (env `DEMO_LIMIT`) |
| `eleven` | 3 voice generations | 24h |
| `search` | 20 web searches | 24h (env `SEARCH_DEMO_LIMIT`) |
| `feedback` | 5 submissions | 24h (env `FEEDBACK_RATE_LIMIT`) |

Counter is in-memory per function container; recycles when Netlify rotates the container. Good enough for free-demo abuse prevention. For production-grade, swap for [Netlify Blobs](https://docs.netlify.com/blobs/overview/).

### 3. Origin check on all functions
Functions only accept requests where `Origin` or `Referer` matches an allowlisted domain (production: `voicevideo.io`; dev: `localhost:8765`, `localhost:8888`). Direct curl / scraping from random sites hits a `403`.

### 4. Feedback spam protection
- **Honeypot field**: a hidden input that bots auto-fill but humans don't. If non-empty, submission is silently dropped (200 OK is returned to confuse the bot).
- **Time-on-form check**: submissions in under 2 seconds are silently dropped.
- **Spam phrase regex**: blocks the obvious bad-actor terms (viagra, casino, forex signals, etc.).
- **URL cap**: more than 2 URLs in a comment is treated as spam.
- **Length floor / repeated-character check**: rejects empty/spammy submissions.
- **HTML/JS stripping**: tags and `javascript:` scheme are stripped from all stored text.

### 5. HTTP security headers (set in `netlify.toml`)
- `X-Frame-Options: SAMEORIGIN` — no embedding in malicious frames
- `X-Content-Type-Options: nosniff` — no MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — minimal referrer leakage
- `Strict-Transport-Security: max-age=31536000` — force HTTPS for 1 year
- `Permissions-Policy` — disables geolocation, camera, payment, USB
- `Content-Security-Policy` — locks `connect-src` to known AI/API providers; blocks third-party scripts

---

## Spend caps (do this once, in each provider dashboard)

These are your last line of defence against a bug or successful abuse running up a bill. Set them low to start, raise as needed.

### Anthropic
1. https://console.anthropic.com → **Settings** → **Limits**
2. Set a monthly spend cap (e.g. `$10/month` while testing)
3. Add an email alert at 50% and 80%

### ElevenLabs
1. https://elevenlabs.io → **Profile** → **Subscription**
2. Free tier auto-caps at 10K characters/month — no surprise charges possible
3. If you upgrade, set hard cap in subscription settings

### Brave Search
1. https://api.search.brave.com/ → **Plans** → **Free**
2. Free tier hard-caps at 2,000 queries/month
3. No surprise charges possible

### GitHub
1. Personal access token used by feedback function has `repo` scope (broad). To narrow:
   - Replace with a **fine-grained token** (https://github.com/settings/personal-access-tokens/new)
   - Repository access: **Only select repositories → voicevideo**
   - Permissions: `Contents: Read and write` only
   - Expiration: 90 days, set calendar reminder to rotate

---

## Monitoring

### What to check daily/weekly
- **Netlify Functions log** (Functions → click a function → Function log) — watch for `403`, `429`, `500` patterns
- **GitHub commit history** (https://github.com/imtauqir9/voicevideo/commits/main) — sudden spike of `chore(feedback)` commits = bot wave
- **Anthropic usage** (https://console.anthropic.com → Usage) — unusual spend
- **ElevenLabs usage** (Profile → Subscription) — character count vs expected

### What to set up if traffic grows
- **Uptime monitor**: free tier on https://uptimerobot.com — ping `voicevideo.io/app.html` every 5 min
- **Error tracking**: Sentry free tier wraps the browser JS and Netlify Functions
- **Anomaly alerts**: Netlify → Site configuration → Notifications → Slack/Email on deploy failures

---

## Incident playbook

### If you spot a leaked key in your repo, files, or logs
1. **Immediately revoke** the key at the provider (Anthropic console / ElevenLabs / Brave / GitHub)
2. Generate a new key
3. Update the Netlify env var with the new value
4. Trigger redeploy
5. Audit: search the leaked key on https://search.shodan.io (might already be indexed by abusers)

### If you see a bot wave on `feedback` (lots of fake commits)
1. Open the Function log to confirm — look for many requests with same User-Agent
2. Add the User-Agent / IP pattern to a blocklist in `feedback.js`
3. Lower `FEEDBACK_RATE_LIMIT` (e.g. to `1`)
4. Revert offending commits on GitHub history if needed
5. Consider adding Cloudflare Turnstile (free CAPTCHA) — see Phase 2 below

### If demo quota is being drained suspiciously fast
1. Lower `DEMO_LIMIT` and `SEARCH_DEMO_LIMIT` env vars on Netlify
2. Trigger redeploy
3. If still abusive, set both to `0` temporarily and add a notice on the landing page that demo is paused

### If Anthropic / ElevenLabs spend spikes
1. Check usage dashboards to see what model + endpoint
2. Most likely abuse path: someone bypassing rate limit by rotating IPs
3. Short-term: pause function by removing `CLAUDE_API_KEY` from Netlify env vars (function returns 500, no API calls happen)
4. Investigate via Netlify Function logs which IPs are responsible

---

## Phase 2 hardening (do these when traffic justifies it)

These add real friction but are overkill for a launch.

- **Cloudflare in front of Netlify** — DDoS protection, bot scoring, free CAPTCHA. https://cloudflare.com → free tier.
- **Cloudflare Turnstile on feedback** — invisible CAPTCHA, no UX cost. ~5 lines of HTML + 5 lines of server check.
- **Netlify Blobs for persistent rate limits** — current limits are in-memory; bot can wait for container recycle to reset. Blobs make it survive recycles.
- **Bot account for GitHub token** — instead of using your own user's token, create `voicevideo-bot` GitHub account with write-only access to one repo. Commits are clearly bot-authored and don't pollute your contribution graph.
- **Cloudflare R2 + Stripe** if you want to add paid tier — keys go in encrypted Stripe metadata, gated by paid status.

---

## File layout for security

```
SECURITY.md                      ← this file (the runbook)
netlify.toml                     ← HTTP security headers
netlify/functions/*.js           ← origin checks, rate limits, sanitization
.env.example                     ← env var template, no real secrets
.gitignore                       ← keeps .env out of repo
```

Last reviewed: 2026-05-30
