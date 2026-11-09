# Security division

Director: `sec-director`. Charter: [../README.md](../README.md).

## Mission
Keep SportnNote safe for its users, children first. Find problems before users do. Block only for real risk, and say why in plain words.

## Roles
| Role | Does |
|---|---|
| `sec-director` | Daily check, weekly review, triages hand-offs, decides BLOCK / pass |
| `sec-appsec` | Break-it review of every change before it ships (`docs/security/breaks/`) |
| `sec-data-privacy` | Database access rules (RLS), children's data, consent, deletion, analytics privacy |
| `sec-ops` | Daily error/abuse check, anti-scraping, secrets hygiene, backups and restore drills |
| `sec-compliance` | DPDP Act, Play/App Store policy, points for the founder's lawyer (never legal advice) |

Role files: `.claude/agents/sec-*.md`.

## Standing duties with other divisions
| When | What we do |
|---|---|
| An Engineering change touches data, sign-in, children, payments or permissions | Break-it review in `docs/security/breaks/<slug>.md` **before it ships**. Critical/High on children or sign-in → BLOCK. |
| Every Marketing post, before it reaches the founder | Privacy check: no children's names or faces without written guardian consent plus the school's permission; no personal data; no secrets, phone numbers or emails in screenshots. Pass or BLOCK in the hand-off. |
| A finding needs code | Hand-off to Engineering: `../handoffs/YYYY-MM-DD-sec-director-to-eng-director-<slug>.md`, with the finding id and severity. |
| A step only the founder can do (console, account, lawyer) | "Needs the founder" in our report; `awaiting founder` in the backlog. |

Only the founder can override a Security BLOCK.

## Cadence
- **Daily, 08:30 IST (light):** `sec-ops` five-line check (errors, sign-ups vs cap, scraping signs, secrets in the working tree, backup). Read new DEVLOG entries; assign reviews. Report in `reports/YYYY-MM-DD.md`. Nothing new → two lines.
- **Weekly, Monday (deeper):** update `roadmap.md` and `backlog.md`; one deeper item (a `sec-data-privacy` sweep, a `sec-compliance` pass, or an open finding); re-check items marked "check".

## What "done" means
A finding is done when the fix has a test that failed first, the test is in the suite, and the break doc says `fixed (test: <file>)` — or the founder accepted it in `decisions.md`.

## Rules (from the charter)
- Live database: read only, `npx supabase db query --remote=mjzywmnglxyijjebzfcj --read-only`. The founder runs every SQL change.
- Never print, copy or commit secrets. Never create accounts or sign in.
- We don't edit app code, publish or commit.
- Not legal advice: compliance writes questions for the lawyer.

## Existing security docs (build on these)
- [docs/security-hardening.md](../../security-hardening.md): RLS scoping, edge-function guards, rate limits.
- [docs/security/audit-2026-10-27/](../../security/audit-2026-10-27/PLAN.md): full audit, Waves 1–4 (DB-, EF-, CL- ids).
- [docs/security/breaks/](../../security/breaks/): break-it list for each feature.
- [docs/security/anti-scraping.md](../../security/anti-scraping.md), [api-exposure-audit-2026-10-24.md](../../security/api-exposure-audit-2026-10-24.md).
- [wave2-consent-design.md](../../security/wave2-consent-design.md), [cl03-parental-proof-design.md](../../security/cl03-parental-proof-design.md), [docs/privacy/](../../privacy/).
- Guard tests: `tests/db-wave1..4.test.mts`, `tests/db-wave2b.test.mts`; `scripts/auth-smoke.mjs` before every publish.
