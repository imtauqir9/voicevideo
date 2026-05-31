# VoiceVideo Feedback Backlog

Every entry below is one piece of user feedback received via the in-app feedback widget on https://voicevideo.io/. Newest at the top.

Format is fixed so an AI agent (or you) can parse it programmatically. Each entry is a fenced block with YAML-style metadata, followed by free-text comment, followed by a closing `---`.

To triage: change the `status:` line from `new` to `triaged`, `in-progress`, `done`, or `wont-fix`. Add a brief reply under `## Response:` if needed.

---

## How to run a Claude agent against this file

Open Claude (claude.ai or the CLI) and paste:

```
Read backlog.md from https://github.com/imtauqir9/voicevideo and:
  1. Group the open feedback (status: new) by theme
  2. For each theme, summarize the user pain in one sentence
  3. Suggest a concrete action (bug fix, copy change, new feature)
  4. Rank actions by impact (high/medium/low) and effort (S/M/L)
  5. Output a prioritised plan as a markdown table
```

You'll get a triaged plan back in seconds.

---

## Open feedback (status: new)

*No feedback yet. Entries will land here automatically once visitors start submitting.*

---

## Recently closed (status: done | wont-fix)

*Empty.*

---

## Entry format reference (do not edit)

```
### 2026-05-20T14:32:11Z — bug — voicevideo.io
status: new
rating: 2
email: tester@example.com
ip: hidden

## Comment
The Generate button disappeared after I clicked Run verification.

## Response
(empty until triaged)
---
```
