---
name: sportfolio-deep-stats-wave
description: Founder 2026-10-22 — broadcast-depth stats for every sport as OPTIONAL "stats to track" toggles + live commentary; build all at once with recommended defaults, review doubts after
metadata:
  type: feedback
---

On 2026-10-22 the founder shared ATP Grand Slam Match Stats screenshots (service / winners & errors / points won / serve & return / rally panels with forehand–backhand × shot type) and the point-by-point commentary (Set · Game blocks, "Point to X · 2:18", "Y loses the point with a Backhand Forced Error", server-first score). They asked for that depth in tennis and then in **every** sport.

**Why:** depth of scoring is the core of the product ([[sportfolio-sport-equality]]). They also want users to choose how much they track.

**How to apply:**
- All new depth is **optional capture**, off by default. Each sport gets "Stats to track" toggles; scoring stays one tap. Old logs replay identically, and nothing untracked shows as 0.
- Each sport gets a live **commentary** feed in its natural unit, a broadcast-style stats panel, and career keys.
- Working style: they said "update all these at once … go ahead with your recommended options where you are unsure" and "we can discuss outstanding queries later to push back changes I might not like". So build in bulk with sensible defaults, and log every judgement call as a decision or open question. Each family's notes go in docs/sport-depth/deep-wave/<family>.md.
- Built by parallel worktree agents, one per sport family. Racket sports other than tennis come after the tennis merge, because they share pointDetail / serveStats / MatchStatsPanel.

- The founder answers in a Claude Docs review doc with "Your call" dropdowns: https://claude.ai/artifact/2k7KeVbK84zeCM7jXGoCXE (doc id 0e1e043b-1863-4636-91d1-c8905d86bac5; dropdown enum 06b0a75e-087e). Check it for new answers before building the next round.
- Status: round 1 (SD-157…168) committed 158b1a7. Round 2 (SD-169: five match tabs Info · Commentary · Stats · Summary · Scoring for every sport, no info repeated; SD-170: their answers built, plus rugby league as its own sport) shipped 2026-10-22: commit af818fa pushed, `notify-followers` deployed, Android OTA e6b15e76, web published; no migration. The founder answered all 16 round-2 questions "Keep" (no changes needed). APK 39 (versionCode 39, commit aa5a0c6, build e7253e7c) built 2026-10-22 with everything incl. keyboard/forms fixes; QR in docs/qr/apk-39-android.png. Notes in docs/sport-depth/deep-wave/*-round2.md; tab contract in match-tabs.md.

Related: [[sportfolio-organiser-rules-principle]], [[sportfolio-parallel-agent-commits]].
