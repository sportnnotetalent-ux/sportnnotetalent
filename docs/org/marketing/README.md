# Marketing division

**Mission:** make SportnNote known and used: more people scoring games, sharing live links and coming back. Measured per post, per platform and per type of content.

Charter: [../README.md](../README.md). House rules for every post, demo data and handles: [docs/marketing/README.md](../../marketing/README.md). The 7 Dec 2026 – 14 Mar 2027 plan: [docs/marketing/content-calendar.md](../../marketing/content-calendar.md).

## Team
| Role | Agent | Does |
|---|---|---|
| Director | `mkt-director` | runs the division, the queue and the reports; hand-offs |
| Strategist | `mkt-strategist` | roadmap, weekly plan, calendar |
| Writer | `mkt-writer` | post copy and scripts |
| Visual producer | `mkt-visual` | visual briefs; asks Design for assets |
| Editor | `mkt-editor` | fact, house-rule and voice check |
| Growth analyst | `mkt-analyst` | stats log, what works |
| *Later:* Community & posting | — | posts directly and drafts replies, once the founder moves from the queue to direct posting |

## How a post gets out (the queue)

`draft` → `edited` (mkt-editor) → `privacy ok` (Security) → **`awaiting founder`** → `approved` (founder) → `posted` (founder publishes; adds the link) → `measured` (mkt-analyst, after 7 days)

Every post is a file in `docs/marketing/posts/` and a row in [queue.md](queue.md). **The founder approves every post and publishes it** (2026-11-05). To approve: change the row's status to `approved`, or say "approve <post>" in chat. After posting, paste the post's link into the row (or tell the Director).

## Voice
Plain, warm and specific, from someone who plays. The moment, not the feature list: the close game, the score link in the group chat, the stats that built themselves. Short sentences. No hype words, no claims we can't prove, one call to action.

## Platforms (post on all; founder 2026-11-05)
| Platform | Role | Formats |
|---|---|---|
| Instagram | the main stage: moments and quick how-tos | Reels, carousels, Stories |
| Facebook | reshares; reaches parents and local clubs | Reels, image posts |
| LinkedIn | founder story, product progress, organisers | text + image, document posts |
| YouTube | how-tos and Shorts | Shorts, 1–3 min how-tos |
| X | short updates, live-match moments | text + image |
| Threads | conversational updates | text + image |

## Stats
Until analytics are connected, the founder exports each platform's numbers weekly into `stats/inbox/` (about 10 minutes). The analyst logs them in [stats/log.md](stats/log.md). Connections planned (each needs the founder's sign-in; agents never sign in):
| Platform | How | Cost |
|---|---|---|
| Instagram, Facebook, Threads | Meta Graph / Threads API via a Meta developer app on the business portfolio | free |
| LinkedIn page | Community Management API (application needed) | free |
| YouTube | YouTube Analytics API | free |
| X | API Basic tier for reads | about $200/month, founder decides; until then a monthly export |

App results come from the usage dashboard (Support console → 📈 Usage): sign-ups by source and links shared → views → sign-ups.

## Cadence
- **Daily (08:30 IST):** `mkt-director` moves the queue, logs any new numbers, writes `reports/YYYY-MM-DD.md`.
- **Monday:** results → next week's plan → 5–7 drafts → editor → Security → queue.
- Budget: held by `mkt-director`; one line of usage in every report.

## Works with
- **Design:** visuals and recordings (hand-off to `des-director`).
- **Engineering:** fact checks; each release can become a post.
- **Security:** a privacy check on every post before it reaches the founder.

## Files
[roadmap.md](roadmap.md) · [backlog.md](backlog.md) · [queue.md](queue.md) · [decisions.md](decisions.md) · [stats/log.md](stats/log.md) · `reports/`
