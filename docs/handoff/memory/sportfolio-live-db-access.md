---
name: sportfolio-live-db-access
description: "How to read the live SportnNote DB from here (supabase CLI db query), that writes go through the founder, and that the Supabase MCP connector can't reach it"
metadata:
  node_type: memory
  type: reference
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-09T18:31:39.309Z
---

- **The only project:** live SportnNote is Supabase project `mpgbvbylmkwasjgupsbq`, named "sportfolio-staging". There is no separate staging project.
- **Read-only queries work:** `npx supabase db query --linked --project-ref mpgbvbylmkwasjgupsbq "<sql>"` uses the CLI login. Output is JSON with a `rows` array.
- **Writes to live:** the auto-mode classifier blocks them (an INSERT was denied 2026-10-09). Give the founder SQL to paste into Supabase → SQL Editor, then verify with read-only queries.
- **The Supabase MCP connector** in these sessions only sees the `sredu-os` projects, not SportnNote.
- **Pasting keys:** a JWT pasted from chat into the dashboard arrived masked (••). To set the Vault `functions_anon_key`, copy it inside SQL from `cron.job` (jobname `notify-upcoming`) instead of pasting.

Related: [[sportfolio-push-notifications]], [[sportfolio-cricheroes-parity]].
