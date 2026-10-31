---
name: sportfolio-international
description: Founder decisions 2026-10-12 on taking SportnNote international — market order, one DB, new sports incl. NFL, .com, store accounts before Dec
metadata:
  type: project
---

The founder wants SportnNote to work for users worldwide. Decisions as of 2026-10-11/12:

- **Market order:** Gulf (UAE, Qatar) → UK → Singapore/Malaysia → Australia → US.
- **Company + Play Store / App Store accounts:** the founder sets these up before December 2026. Meanwhile, do every international item that doesn't depend on them.
- **Data:** one database (Supabase ap-south-1, Mumbai) for all markets to start.
- **New sports to add:** rugby (union + sevens), baseball/softball, ice hockey, netball, and American football (NFL). This reverses the earlier "skip NFL/rugby for now".
- **Domain:** the founder wants a .com; they need to buy it. sportnnote.in stays.
- **Languages:** English only, no other languages for now (2026-10-11).

**Why:** go global after the India pilot; the sport layer is already federation-standard, so the gaps are distribution, auth/phone, legal, locale and school structures.

**How to apply:** audit + plan in docs/international/. Keep India behaviour unchanged while making defaults come from the device/country. Related: [[sportfolio-sports-policy]], [[sportfolio-organiser-rules-principle]].

**Status 2026-10-12:** I-0, I-1, I-2, I-3 and I-4 shipped. The five new sports are live: netball, rugby union + sevens, ice hockey, baseball/softball, American football (flag first). That makes 29 sports. Remaining: I-5 (store listings, native phone sign-in, App Links, legal registrations / DPO / UK rep, school DPAs, COPPA vendor, payments), which waits for the company and store accounts (before Dec 2026).
