# Netlify Environment Variables — VoiceVideo

Quick reference for setting up the free demo + integrations on Netlify.

## Where to add them

1. Open your site at https://app.netlify.com
2. Click **Site configuration** in the left sidebar
3. Click **Environment variables**
4. Click **Add a variable** for each row below
5. After all are added, go to **Deploys → Trigger deploy → Deploy site** so they take effect

---

## Variables

| Key | Value | Required? | Purpose |
|---|---|---|---|
| `CLAUDE_API_KEY` | your `sk-ant-api03-...` key | **yes** | Powers the free demo. Get one at https://console.anthropic.com → API Keys |
| `ELEVENLABS_API_KEY` | your ElevenLabs API key | **yes** | Powers voice synthesis in the demo. Get one at https://elevenlabs.io → Profile → API Key |
| `DEMO_LIMIT` | `3` | optional | Number of free generations per IP per 24h. Default is 3. Tweak as you like. |
| `ELEVENLABS_VOICE_ID` | `kmiDQH3kczbRzoifN5Qv` | optional | Locks the demo to a specific voice. Defaults to the one above. |
| `BRAVE_SEARCH_KEY` | get free key at https://api.search.brave.com/ | optional | Powers the "Ground with web search" toggle. Free tier: 2,000 queries/month, no card required. Without this, the toggle simply does nothing instead of breaking. |
| `SEARCH_DEMO_LIMIT` | `20` | optional | Number of web searches per IP per 24h. Default is 20. |
| `GITHUB_TOKEN` | `ghp_...` from https://github.com/settings/tokens with `repo` scope | optional | Powers the in-app feedback widget. Without this, the widget shows an error. |
| `GITHUB_OWNER` | `imtauqir9` | optional | Used by feedback widget. |
| `GITHUB_REPO` | `voicevideo` | optional | Used by feedback widget. |
| `GITHUB_BRANCH` | `main` | optional | Defaults to `main`. |
| `FEEDBACK_FILE` | `backlog.md` | optional | Path of the file the widget appends to. |
| `FEEDBACK_RATE_LIMIT` | `5` | optional | Feedback submissions per IP per 24h. |

---

## After adding

- **Deploys → Trigger deploy → Deploy site**
- Wait ~60 seconds for the build to finish
- Open your Netlify URL in a private window and test the studio

## Safety notes

- All values are stored encrypted by Netlify
- Keys are injected into the serverless functions at runtime only
- They are **never** sent to the browser
- Set spend caps in your Anthropic and ElevenLabs dashboards as a backstop
- If you ever see suspicious usage, rotate the keys at the provider and update them here — no code changes needed
