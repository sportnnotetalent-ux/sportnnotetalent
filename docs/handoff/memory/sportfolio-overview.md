---
name: sportfolio-overview
description: "Sportfolio — Expo/RN multi-sport scoring app (\"CricHeroes for every sport\"); school sports meets in India"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-08-16T06:25:12.653Z
---

**Renamed 2026-08-10: the product is now "SportnNote"** (tagline "Play a Sport, Make a Note.") — "Sportfolio" was taken. The repo dir is still `sportfolio/` and these memory slugs stay `sportfolio-*`, but all user-facing text/branding is SportnNote. Dedicated inbox `sportnnote@gmail.com`; brand domain will be `sportnnote.app` (not yet registered as of the rename). See [[sportfolio-repo]] and [[sportfolio-devlog]].

SportnNote lives at `/Users/macbookpro/Desktop/rudy/sportfolio`. Expo/React Native + TypeScript multi-sport tracking & scoring app — "CricHeroes for every sport." First target: school/college **annual sports meet** in India (schedules, teams, live scores, player profiles, stats) for students & parents, across 6+ sports.

Architecture: shared core platform + per-sport **plugins** (`src/sports/`) implementing one contract (`types.ts`) — a pure reducer + UI. Generic `LiveScoringScreen` looks up the plugin by sport. Adding a sport never touches core. Data layer: `src/data/repos.ts` (Supabase ↔ demo fallback), `demoStore`, `src/core/supabase.ts`. Boots in **demo mode** against local sample data (no backend). Going live needs Supabase env vars.

User types: organizer/scorer, teacher, parent, fan, student.

Run it: `sportfolio-demo` launch config (root `.claude/launch.json`) → `npx expo start --web --port 8091`. Note port 8081 (`sportfolio-web`) is often held by another chat session, so a separate `sportfolio-demo` entry on 8091 was added. Node v26.4.0 IS installed (via homebrew) despite the older [[teachbridge-environment]] note.

Related: [[sportfolio-product-mandate]]
