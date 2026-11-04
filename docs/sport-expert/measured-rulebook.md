# Measured sports: rulebook pass (2026-11-05)

Shooting, archery, athletics, golf, swimming, rowing, canoe sprint and cycling (26th–33rd sports). Weightlifting has its own file. Earlier depth: `docs/sport-expert/measured.md`.

## Sources

| Sport | Document | Link |
|---|---|---|
| Shooting | ISSF: changes with the 2026 Rulebook (in force 1 Jan 2026) | https://www.issf-sports.org/news/4878 |
| Shooting | ISSF: LA28 final formats confirmed | https://www.issf-sports.org/news/5086 |
| Archery | World Archery Rule Books (2026-01-27 / 2026-03-13 versions) | https://documents.worldarchery.sport/Rules/Rule_Book_versions/2026-03-13/EN/EN-Book_3_-_2026-03-13_Version.pdf |
| Athletics | World Athletics Competition and Technical Rules, 2026 edition | https://worldathletics.org/download/download?filename=acdec6c6-1261-4c7f-96d2-92f712707e99.pdf&urlslug=Competition+and+Technical+Rules+%E2%80%93+2026+Edition |
| Golf | R&A: new and updated Model Local Rules for 2026 | https://www.randa.org/en/articles/new-and-updated-model-local-rules-for-2026 |
| Swimming | World Aquatics Competition Regulations (Feb 2026) | https://resources.fina.org/fina/document/2026/02/18/e6815ecc-06d9-4f0b-98e9-4c441cf5e6a3/2026-02-18_World-Aquatics_CR-Final.pdf |
| Rowing | World Rowing: 2026 changes to the Rules of Racing (approved 17 Feb 2026) | https://worldrowing.com/wp-content/uploads/2026/03/2026-Rules-Update-Clinic-Online-20260301.pdf |
| Cycling | UCI regulations and amendments 2026–2027 | https://www.uci.org/regulations/3MyLDDrwJCJJ0BGGOFzOat |

## Findings

| # | Priority | Sport | Rule | Gap | Status |
|---|---|---|---|---|---|
| MS-1 | P2 | Rowing | 2026 Rules of Racing: progression **ranks crews by placing and time** (not placing alone). Rule 64 option D reallocates lanes from the previous round's ranking. App. R7: a "snake" spread of qualifiers into quarter- and semi-finals. Rule 65: dead heats and re-rows. | Our rowing progression qualifies by place (plus fastest losers). Multi-round regattas with time-ranked progression and the new lane rules aren't modelled. | Open (M). Single-race and heat→final regattas are unaffected. |
| MS-2 | P2 | Shooting | 2026 Rulebook: new finals for **50 m Rifle 3 Positions** and **25 m Rapid Fire Pistol** (debuted at the 2025 World Cup Final). All individual finals have 8 shooters (RFP, trap and skeet up from 6). | Our 3P final is the Paris 2024 format (45 shots, elimination from 40). The shot-by-shot 2026 format isn't in the news posts. | Open: read the 2026 ISSF Rulebook finals section, then update `R3P_FINAL` / add an RFP final. 10 m air rifle / pistol finals are unchanged (Paris format, as built). ✓ |
| MS-3 | P3 | Athletics | 2026 edition; the long-jump take-off zone is a trial at lower-level meets only | — | Watch. |
| MS-4 | P3 | Golf | Rules of Golf 2023 still current; 2026 brought only new Model Local Rules (internal out of bounds, embedded ball, damaged clubs). A new edition is being prepared (USGA workshops for the next Rules). | — | Watch for the new edition's date. |

## No scoring changes found

- **Archery:** set system (recurve), cumulative (compound), shoot-off closest to centre.
- **Swimming:** results by time, DQ codes.
- **Canoe sprint:** results by time.
- **Cycling:** amendments are organisational, road and equipment; track results unchanged.

These were checked from the federations' document indexes and change notices only, not clause by clause.
