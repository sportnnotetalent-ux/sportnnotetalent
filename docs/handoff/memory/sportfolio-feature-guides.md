---
name: sportfolio-feature-guides
description: "Every shipped feature gets a public step-by-step guide page on sportnnote.in/guides/, written in parallel by content/designer sub-agents"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-09T07:09:10.664Z
---

The user wants a public help article for every feature: one guide per feature at `sportnnote.in/guides/<slug>/`, explaining the feature with a step-by-step guide. A content agent writes it while the feature is being developed, in parallel, and a website designer agent owns the look of the pages.

**Why:** anyone, including organisers, parents and scorers who aren't users yet, should be able to land on a page, understand a feature and follow it. Help content must keep pace with shipping.

**How to apply:**
- When building a feature, for example in the [[sportfolio-cricheroes-parity]] queue, also spawn a content sub-agent. It writes or updates `website/guides/<slug>.md` per the contract in `website/guides/README.md`: front matter, allowed categories, Markdown subset, and labels grep-verified against `src/`.
- Design and renderer changes belong to `scripts/build-website.mjs` and `website/styles.css`.
- The site (Cloudflare Workers, static) deploys only from `main`. Pushing just the feature branch leaves sportnnote.in unchanged; on 2026-10-09 the user chose to fast-forward main to the feature branch.
- The first batch was 25 guides for parity items 01–25, started 2026-10-09.

Related: [[sportfolio-devlog]].
