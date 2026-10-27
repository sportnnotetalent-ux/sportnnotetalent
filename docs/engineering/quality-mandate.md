# Quality and security mandate

**Founder, 2026-10-27.** This applies to every feature from now on, and to the whole existing app through the hardening programme below. The product must keep getting stronger, more secure, and better at learning from its own breaks.

## Definition of done: every feature
A feature is done only when all seven steps are done, in this order.

1. **Test first (TDD).** Turn the spec into tests before writing the code: every rule, edge case, failure path and permission. Run them and watch them fail, then build until they pass.
2. **Unit tests.** Pure logic is tested in `tests/*.test.mts` (`npm test`). No feature ships without them.
3. **Integration tests.** Test the feature through its real joins. Until the integration harness exists (see Infrastructure), use what's available and say in the DEVLOG which parts weren't covered:
   - the database: functions, RLS, triggers and grants;
   - edge functions;
   - the screen in the demo preview;
   - read-only checks on live.
4. **Break it.** Once it works, act as a security tester and attacker. List every way to break or abuse the feature as numbered points, **without fixing them yet**, in `docs/security/breaks/<feature>.md`. Check at least:
   - **Who can call it:** anon, a signed-in stranger, a member, a child, an old app version.
   - **Children's data:** names, dates of birth, contacts, photos.
   - **Inputs:** size, encoding, injection, malformed files.
   - **Cost:** SMS, email and push spam; rate limits.
   - **Timing:** double submits, races, replays, retries, offline and outbox.
   - **Access:** IDOR, privilege escalation, enumeration and scraping.
   - **Availability:** denial of service.
   - **The data itself:** integrity, and what happens on partial failure.
5. **Fix the points one by one.** Each fix starts with a failing test that reproduces the point. Mark each point *fixed* (with the commit), or *accepted* with the reason.
6. **Simulate hundreds of users.** Run a seeded simulation of at least 500 users (schools, scorers, players, parents) with random and adversarial input, checking the feature's invariants (`tests/sim-*.test.mts`). Where the database is involved, also run it concurrently against staging once staging exists.
7. **Publish.** Only after steps 1–6. The DEVLOG entry lists the tests added, the breaks found and fixed, and the simulation run.

Agents get these steps in their brief. When several agents work at once:
- each works in its own worktree;
- commits name explicit files;
- one agent builds, a different one breaks.

## The existing app: hardening programme
The app is gone through area by area, using the same steps 4–6: list the breaks first (`docs/security/audit-2026-10-27/<area>.md`), then fix them one by one with tests, then simulate.

1. **Database:** RLS, `security definer` functions, triggers, grants.
2. **Edge functions:** auth, rate limits, input checks, email / SMS / push abuse.
3. **App and web client:** auth flows, children's data on screen and in links, deep links, the demo / live split, outbox / retry.
4. **Scoring engines and replay:** determinism, malformed events, the old-version safety net.
5. **Tournaments, orgs and verification flows:** permissions and lifecycle edge cases.

Areas without unit tests get them first (characterisation tests of today's behaviour), then breaks and fixes.

## Infrastructure (needs the founder)
- **Integration harness:** PGlite, Postgres compiled to run inside the Node tests (an npm dev dependency). It runs every migration and exercises SQL, RLS and triggers in `npm test`, offline.
- **Staging:** a second Supabase project (free plan), never live data. Migrations and edge functions are deployed there first. End-to-end tests and the hundreds-of-users concurrency runs go there, never against live.
