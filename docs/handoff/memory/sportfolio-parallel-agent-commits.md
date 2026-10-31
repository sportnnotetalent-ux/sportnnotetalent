---
name: sportfolio-parallel-agent-commits
description: When background agents are editing the tree, commit with explicit file lists only — never `git commit -a` / `add -A`; publish from a clean worktree at HEAD
metadata:
  type: feedback
---

While parallel build agents are working in the sportfolio tree, only stage explicit paths (or `git add -A` with exclusions after checking `git status` right before). Never `git commit -a`/`-am` — on 2026-10-11 a docs commit with `-am` swept the road/XC agent's half-built athletics files onto main (reverted in d900f1f).

**Why:** agents' work-in-progress files compile only together with their untracked new files; a partial commit breaks main and gets pushed by the release step.

**How to apply:** publish web/OTA from a scratch worktree at HEAD (`git worktree add --detach <scratchpad>/pubtree HEAD`, symlink node_modules, copy .env.local.bak); set the worktree path variable before any `&&` chain that could fail — an empty variable once created a stray `./HEAD` worktree. Shared files with mixed agents' edits → wait and commit both together. Related: [[sportfolio-sport-equality]].
