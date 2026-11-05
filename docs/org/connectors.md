# Connectors: what we have, what agents propose

Founder 2026-11-05: every agent should think about and suggest connectors (Claude integrations with other tools) that would help its work. Directors add proposals here in their Monday run. **Only the founder connects one** (it means signing in and granting access); an agent never connects, signs in or pays.

How to propose: add a row under "Proposed" with the division, the connector, the job it does, the access it needs (read-only where possible), cost, and the risk. Keep proposals concrete: "saves the founder the weekly export" beats "might be useful".

## Connected now
| Connector | Used by | For |
|---|---|---|
| Canva | Marketing, Design | post visuals from the brand kit |
| Figma | Design | design context, screenshots, diagrams |
| Supabase | Engineering, Security | project info; the live database stays read-only, writes go through the founder |
| Firecrawl | Engineering (sports rules), Marketing (research) | reading federation rulebooks and public web pages |
| Built-in browser / Claude in Chrome | QA, Design | demo checks, screenshots |

## Proposed (founder to decide)
| # | Division | Connector | Job | Access | Cost | Notes |
|---|---|---|---|---|---|---|
| C-01 | Marketing | **Metricool** | stats for Instagram, Facebook, LinkedIn, YouTube, X, Threads in one place (best time to post too); later, scheduling posts | analytics read now; scheduling only when the founder moves to direct posting | free plan for 1 brand; paid tiers for more | Could replace most of the custom stats script (analytics-setup.md) and its per-platform API setup. Check which platforms the free plan's analytics include |
| C-02 | Marketing | Windsor.ai for Social Media | the same idea (stats from Instagram, Facebook, YouTube, LinkedIn) | read | paid after trial | Alternative to C-01; pick one |
| C-03 | Marketing | Typefully | drafts for X, LinkedIn, Threads, kept as drafts for the founder to publish | drafts only | free tier | Only useful once there are many text posts |
| C-04 | Engineering, Security | **Sentry** | crash and error tracking with stack traces, beyond today's own client_errors table | read | free tier | Needs adding Sentry to the app (an Engineering item with a Security review) |
| C-05 | All | Slack | the daily report and urgent alerts land in a Slack channel instead of a file | post to one channel | free | Optional: the founder may prefer files or email |
| C-06 | All | Notion | a board view of all divisions' backlogs | read/write one workspace | free tier | Only if the founder prefers a board to the repo files; the repo stays the source of truth |
| C-07 | Marketing, CoS | Gmail | read support@/social@ replies and draft answers for the founder | drafts only, never send | free | Drafts only; every send stays with the founder |

## Recommendation (Chief of Staff, 2026-11-05)
Start with **C-01 Metricool** (connects every platform's stats in one sign-in, instead of four developer apps) and **C-04 Sentry** later with the 1.1.0 build. Hold the others until there's a clear need.
