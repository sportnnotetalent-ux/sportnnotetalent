# SportnNote agent organisation

Founder decision (2026-11-05): run SportnNote with divisions of Claude agents, each with its own role, working on a regular schedule. The founder sits at the top, monitors, and gives input to the Directors. This folder is the organisation's shared memory: agents remember nothing between runs, so **everything an agent needs to know next time is written here.**

## Structure

```
Founder (CEO): sets direction, approves, reads the daily report
 └─ Chief of Staff (cos): daily report + weekly digest, routes the founder's input, keeps the board
     ├─ Marketing      (mkt-director)  docs/org/marketing/
     ├─ Engineering    (eng-director)  docs/org/engineering/
     ├─ Security       (sec-director)  docs/org/security/
     └─ Design & Motion (des-director) docs/org/design/
```

Role files live in `.claude/agents/<id>.md` (one per role). A Director decides which of its roles run and gives them their tasks; roles never start themselves.

| Division | Director | Roles |
|---|---|---|
| Chief of Staff | `cos` | — |
| Marketing | `mkt-director` | `mkt-strategist`, `mkt-writer`, `mkt-visual`, `mkt-editor`, `mkt-analyst` |
| Engineering | `eng-director` | see [engineering/README.md](engineering/README.md) |
| Security | `sec-director` | see [security/README.md](security/README.md) |
| Design & Motion | `des-director` | see [design/README.md](design/README.md) |

## Each division's folder

Every division keeps the same files, so any agent (and the founder) knows where to look:

| File | What |
|---|---|
| `README.md` | The division's mission, roles, cadence, what "done" means, and links to its existing docs |
| `roadmap.md` | Goals for the next 4–12 weeks, in priority order, with dates |
| `backlog.md` | Work items: id, title, owner role, status (`todo` / `doing` / `review` / `blocked` / `awaiting founder` / `done`), links |
| `reports/YYYY-MM-DD.md` | One short report per run: done, next, blocked, needs the founder |
| `decisions.md` | Decisions the founder made for this division, dated, newest first |
| `specs/`, `assets/` | Specs and drafts handed to another division (Engineering and Design use these) |

**Shared files:** [publishing.md](publishing.md) is the publish lock (one publish at a time across all sessions). An item marked "check" is re-verified against `DEVLOG.md` by the division that owns it at its next weekly run. DEVLOG entries can carry dates later than today (the log's own sequence); trust the order of entries, not the calendar.

## Working in tandem: hand-offs

Divisions ask each other for work through **hand-off files** in [handoffs/](handoffs/), one file per request: `handoffs/YYYY-MM-DD-<from>-to-<to>-<slug>.md`.

```markdown
# <short title>
- From: mkt-director   To: des-director   Opened: 2026-11-05
- Status: open | accepted | done | declined
- Needed by: <date or "next weekly run">
## What and why
## Done when
## Reply (the receiving Director writes here)
```

The receiving Director checks `handoffs/` at the start of every run, accepts or declines (with a reason), adds the item to its own backlog, and marks the hand-off `done` with a link to the result. The Chief of Staff lists every hand-off open for more than 3 days in the daily report.

Standing hand-offs (no file needed, just do it):

| When | From → To | What |
|---|---|---|
| A feature ships (a DEVLOG "Release:" entry) | Engineering → Marketing | Marketing may write about it; check facts against DEVLOG |
| Any change touches data, sign-in, children, payments or permissions | Engineering → Security | A break-it review (`docs/security/breaks/`) before it ships |
| Any new or changed screen | Engineering → Design | A design review before release |
| A post needs a visual, video or screenshot | Marketing → Design | Brand-kit assets, screens recorded from the demo |
| A post shows the app, a number or a claim | Marketing → Engineering | Fact check: the feature is live, the number is real |
| Every post before it reaches the founder | Marketing → Security | Privacy check: no children's faces or names without consent, no personal data, no secrets in screenshots |
| A security finding needs code | Security → Engineering | A backlog item with the finding's id and severity |
| A design change needs code | Design → Engineering | A spec with screens, states and motion notes |
| Store screenshots, website visuals | Design → Security | Privacy check, same as posts |
| A post's claim rests on safety or privacy ("safe for kids") | Security → Marketing | Approve or reword the claim |

**Who breaks it:** for anything touching data, sign-in, children or permissions, Security (`sec-appsec`) writes the break-it list, not the role that builds the feature ("one builds, a different one breaks").

**A Security block:** the hand-off or backlog item gets the status `blocked` and a first line `BLOCK: <reason> — sec-director <date>`. It stays until Security clears it or the founder overrides it in writing.

**Urgent:** a hotfix can get a same-day Security review (open the hand-off with `Needed by: today`). A leaked secret, active abuse or a data exposure goes to the founder **at once** in chat, not in the next daily report.

## Approval gates (the founder decides; no agent overrides these)

Nothing below happens without the founder's explicit yes, given in chat or written into the item as `Approved by founder <date>`:

1. **Anything public:** posting on social media, publishing web or app updates, emails to users, website changes. Marketing works as a **queue**: agents prepare, the founder approves **every post** and publishes it (founder decision 2026-11-05; direct posting comes later).
2. **Money and builds:** paid promotion, subscriptions, API plans (e.g. X API), build credits, new native or store builds, edge-function deploys.
3. **The live database:** agents read only (`npx supabase db query --remote=byjuxrajzvfjpnqvzwzv --read-only "…"`), **counts and aggregates only, never rows of personal data**; the founder runs every SQL change.
4. **Accounts and credentials:** agents never create accounts, sign in, or handle passwords, keys or tokens. The founder does those.
5. **Security can block** a release or a post. Only the founder can override a block.

## Standing rules (from docs/HANDOFF.md §5, AGENTS.md, and the founder)

- **Quality mandate** for every code change ([docs/engineering/quality-mandate.md](../engineering/quality-mandate.md)): break-it list, failing tests first, unit + integration (PGlite) tests, a 500+ user simulation, the full suite + tsc, a demo check, a DEVLOG entry, then ask to publish.
- **Commits:** explicit file lists only, never `git commit -a`. Never commit `docs/cricheroes-parity/`, `docs/qr/`, `*.tar.gz.enc`, or anything in `.claude/` **except** `.claude/agents/*.md` (the role files are committed, so every session and schedule sees them). Several agents work in one checkout, so touch only your own files and check `git status` first.
- **Publishing:** take the lock in [publishing.md](publishing.md) first and release it after. From a clean worktree at the **branch tip** (other sessions publish too — read the newest DEVLOG release entry first; never publish from an older commit). Run `node scripts/auth-smoke.mjs` before every publish. Never publish over-the-air from the `sdk57` branch.
- **Secrets:** never print, commit or paste `.env.local*`, keys, tokens or the reviewer test number.
- **Privacy:** under-18s are protected everywhere: no names or faces of children in public content without written guardian consent plus the school's permission; analytics link only consenting adults.
- **Plain language** in everything the founder reads: short sentences, no jargon.
- **Product principles:** every sport equal (international-standard scoring and stats), organiser-chosen rules with standard defaults, the MVP loop first (set up → score → share → follow → result; docs/product/MVP.md).

## Cadence

| When | Who | Output |
|---|---|---|
| Daily, 08:30 IST | each Director that has work, then `cos` | Division report in `<division>/reports/`; `cos` writes the founder's **short daily report** in [reports/](reports/) (5–10 lines: what moved, what needs the founder, anything red) |
| Weekly, Monday | each Director | Plans the week: updates `roadmap.md` and `backlog.md`, assigns roles, opens hand-offs, and adds any **connector** that would help its work to [connectors.md](connectors.md) (every role may suggest one; only the founder connects) |
| Weekly, Sunday | `cos` | **Weekly digest**: each division's results, the numbers, decisions needed |

Schedules are set up only after the founder has reviewed the role files.

## Usage budget

Budgets are per division, held by its Director (founder decision 2026-11-05). A Director keeps runs small: one role per task, the cheapest model that does the job well, and no run when there's nothing to do. Every report ends with a one-line usage note. The first budget review is two weeks after the schedules start.

## The founder's input

Write to a Director in chat, or add a line to that division's `decisions.md` / `backlog.md`. `cos` collects input given anywhere and routes it to the right Director.
