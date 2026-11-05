# Engineering division

**Mission:** make the MVP loop perfect (set up → score → share → follow → result, `docs/product/MVP.md`) and keep the live app safe, correct and fast. Zero wrong scores. Nothing ships that the founder hasn't approved.

Director: `eng-director`. The shared charter is [../README.md](../README.md); it wins if anything here disagrees.

## Roles
| Role | File | Does | Model |
|---|---|---|---|
| Director | `.claude/agents/eng-director.md` | plans, assigns, hand-offs, daily report | default |
| Product Manager | `eng-pm.md` | founder input → specs + backlog; fact checks for Marketing | sonnet |
| Mobile / Web Engineer | `eng-app.md` | screens, scoring engines, client code, test-first | default |
| Backend Engineer | `eng-backend.md` | migrations, RPCs, RLS, edge functions; files only, founder runs SQL | default |
| QA Engineer | `eng-qa.md` | tests first, PGlite, 500+ user sims, suite + tsc, demo check | sonnet |
| Sports Rules Expert | `eng-sports-rules.md` | each sport vs its federation rulebook | sonnet |
| Release Engineer | `eng-release.md` | auth smoke, publish from the branch tip, DEVLOG release entry | sonnet |

Only the Director starts roles. One role per task. The role that builds never writes the break-it list.

## Definition of done (the quality mandate, `docs/engineering/quality-mandate.md`)
A change is done only when all of these are true, in order:
1. **Spec → failing tests** (`eng-pm`, `eng-qa`).
2. **Unit tests** pass (`tests/*.test.mts`).
3. **Integration tests** pass (PGlite, `tests/helpers/pgdb.mts`); anything not covered is named in DEVLOG.
4. **Break-it list** written by Security (`docs/security/breaks/<feature>.md`), not by the builder, without fixes.
5. **Each point fixed** with its own failing test first, or accepted with a reason.
6. **500+ user simulation** (`tests/sim-*.test.mts`); full suite + `tsc` green; demo check with screenshots.
7. **Design review** done for any new or changed screen.
8. **DEVLOG entry** (tests, breaks, simulation), then **ask the founder to publish**. On a yes, `eng-release` publishes and writes the "Release:" entry.

Scoring changes also: old saved matches replay exactly as before.

## Working with the other divisions (standing hand-offs from the charter)
| When | To | What |
|---|---|---|
| A change touches data, sign-in, children, payments or permissions | Security | break-it review before it ships; Security can block |
| A new or changed screen | Design | design review before release, with demo screenshots |
| A DEVLOG "Release:" entry | Marketing | they may write about it; facts from DEVLOG |
| Marketing asks for a fact check | (from Marketing) | `eng-pm` answers from DEVLOG: live or not, since when |
| Security finding needs code | (from Security) | a backlog item with the finding id and severity |
| Design change needs code | (from Design) | a spec with screens, states, motion notes |

Hand-off files live in `docs/org/handoffs/`. The Director answers each one in its next run.

## Cadence
- **Daily, 08:30 IST**, only when there is work: Director reads, assigns one or two items, writes `reports/YYYY-MM-DD.md` (done, next, blocked, needs the founder, usage).
- **Weekly, Monday:** Director updates `roadmap.md` and `backlog.md`, opens hand-offs.
- **Releases:** whenever the founder says "publish". Several sessions publish; always check the newest DEVLOG release entry first.
- Schedules start only after the founder has reviewed the role files.

## Files here
`roadmap.md` (4–12 weeks) · `backlog.md` (work items) · `decisions.md` (founder decisions) · `reports/` · `specs/` (made by `eng-pm` when needed).

## Existing docs to use
- `docs/HANDOFF.md` (live state, rules §5) · `DEVLOG.md` (what shipped, newest first)
- `docs/engineering/quality-mandate.md` · `docs/product/MVP.md` · `docs/mvp/` (MVP audits)
- `docs/sport-expert/` (rulebook audits, `PLAN.md`) · `docs/sport-depth/`
- `docs/security/breaks/` · `docs/launch/` (store steps) · `docs/perf/audit.md`
- Scripts: `scripts/publish-web.sh`, `scripts/publish-android-ota.sh`, `scripts/auth-smoke.mjs`, `scripts/error-triage.mjs`
