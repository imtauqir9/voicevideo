# VoiceVideo — Feedback System

Two ways for users to send feedback. Pick one or run both.

---

## Option A — Modern, agent-friendly (already built)

This is what's wired up in the app. A floating amber **pencil button** in the bottom-right of every studio page opens a small modal. Users pick a rating, type, and write a comment. On submit, a Netlify Function appends a formatted entry to `backlog.md` in this repo via the GitHub API.

### One-time setup

Add these env vars on Netlify (Site configuration → Environment variables):

| Key | Value | Required? |
|---|---|---|
| `GITHUB_TOKEN` | a personal access token with `repo` scope | **yes** |
| `GITHUB_OWNER` | `imtauqir9` | yes |
| `GITHUB_REPO` | `voicevideo` | yes |
| `GITHUB_BRANCH` | `main` | optional (defaults to `main`) |
| `FEEDBACK_FILE` | `backlog.md` | optional (defaults to `backlog.md`) |
| `FEEDBACK_RATE_LIMIT` | `5` | optional (per-IP cap per 24h) |

### How to make the `GITHUB_TOKEN`

1. Open https://github.com/settings/tokens
2. Click **Generate new token → Generate new token (classic)**
3. Note: `voicevideo-feedback-writer`
4. Expiration: pick whatever you like (90 days is fine)
5. Scopes: tick **only** `repo` (everything under it)
6. Click **Generate token**
7. Copy the token (starts with `ghp_...`) — you can only see it once
8. Paste it into the Netlify env var `GITHUB_TOKEN`

Then go to **Deploys → Trigger deploy → Clear cache and deploy site** so the function picks up the new env vars.

### What users see

A small amber pencil button bottom-right. Click → modal → 5-star rating, type pill (bug / idea / praise / confusion / other), comment textarea, optional email. Submit → "Thanks — got it" → modal closes. Behind the scenes, an entry like this gets appended to `backlog.md`:

```
### 2026-05-30T18:24:11Z — idea — https://voicevideo.io/app.html
status: new
rating: 5
email: someone@example.com
ua: Mozilla/5.0 (Macintosh; Intel Mac OS X ...

## Comment
Loved the donuts but the Cross-check provider field was hidden until I scrolled. Could it move above the topic?

## Response
(empty until triaged)
---
```

### How to triage with a Claude agent

When you want to clear the backlog, open Claude (claude.ai, the CLI, or the API) and paste:

```
Read backlog.md from https://github.com/imtauqir9/voicevideo and:
  1. Group the open entries (status: new) by theme
  2. For each theme, summarise the user pain in one sentence
  3. Suggest a concrete action (bug fix, copy tweak, new feature)
  4. Rank by impact (High/Medium/Low) and effort (S/M/L)
  5. Output a prioritised plan as a markdown table I can act on this week
```

You'll get a triaged plan back in seconds. From there:

- For each item, manually update `status:` in `backlog.md` to `triaged`, `in-progress`, `done`, or `wont-fix`
- Optionally, add a one-line **Response** in the entry

A second agent prompt for follow-up:

```
Look at the closed entries in backlog.md (status: done) in the last 30 days. Write a release note paragraph thanking testers for the specific feedback that shipped.
```

You now have a public, transparent backlog AND an audit trail of what users said vs what changed.

---

## Option B — No-code alternative: Google Form

If you'd rather not maintain a backend, use a Google Form. Slower to triage but zero setup.

### Set up

1. Open https://forms.google.com → blank form
2. Title: **VoiceVideo Feedback**
3. Add these questions:
   - **Short answer**: "What did you try?" (required)
   - **Multiple choice**: "Type" with options Bug / Idea / Praise / Confusion / Other (required)
   - **Linear scale 1–5**: "How was it?" (1 = bad, 5 = loved it)
   - **Paragraph**: "Tell us more" (required)
   - **Short answer**: "Email (optional)"
4. Click **Send** (top right) → copy the share link (shortlink is fine)

### Embed in VoiceVideo

Open `app.html`, find the bottom of the file (just before `</body>`), and add this small bar:

```html
<a href="PASTE_YOUR_GOOGLE_FORM_LINK_HERE" target="_blank" rel="noopener"
   style="position:fixed;right:22px;bottom:22px;z-index:200;padding:12px 18px;
          background:#E8A020;color:#1A0F00;font-family:'DM Sans',sans-serif;
          font-weight:700;border-radius:999px;text-decoration:none;
          box-shadow:0 8px 24px -8px rgba(232,160,32,.7)">
  Send feedback &rarr;
</a>
```

Replace the in-app widget (delete the `<!-- FEEDBACK WIDGET -->` block) if you go this route — keep one channel, not two.

### Read responses

In the Form, click **Responses** tab → **Link to Sheets**. All responses land in a Google Sheet. Download as CSV or paste into Claude with a prompt like:

```
Here's a CSV of the last week of user feedback. Group by theme, suggest a triaged backlog.
```

---

## Option C — Run both

The in-app widget + a Google Form link. Heavy users (testers, friends) submit through the widget for speed. Anonymous visitors who prefer not to share a comment in-app can use the Google Form via a "Or send via Google Form" link in the widget footer. Most projects don't bother — pick one.

---

## File layout

```
backlog.md                      ← markdown backlog (auto-updated by widget)
FEEDBACK.md                     ← this file
netlify/functions/feedback.js   ← receives widget submissions, writes to backlog
app.html                        ← contains the floating widget UI + script
```
