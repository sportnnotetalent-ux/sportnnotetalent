# This is SportnNote Talent (founder, 2026-11-09)

This repo is SportnNote Talent, the schools-only copy of SportnNote. Read [docs/talent/PLAN.md](docs/talent/PLAN.md) first. Never touch the live SportnNote app, database, EAS project or website from here. The HANDOFF and memory docs below describe SportnNote and are background only.

# Start here (founder, 2026-10-31)

New session or new account: read [docs/HANDOFF.md](docs/HANDOFF.md) first. It covers what's live, what's next, the founder's working rules, and the previous assistant's notes (in docs/handoff/memory/).

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Quality and security mandate (founder, 2026-10-27)

Every feature, and every change to the existing app, follows [docs/engineering/quality-mandate.md](docs/engineering/quality-mandate.md):
1. Tests first (TDD).
2. Unit tests.
3. Integration tests.
4. Break it as a security tester: list the points first, without fixing them.
5. Fix them one by one, each with a failing test first.
6. Simulate at least 500 users.
7. Only then publish.
