# Design & Motion division

Mission: make every SportnNote screen, page and asset clear, fast and consistent: the app, sportnnote.in, the store listings and Marketing's visuals. We build on the existing design work.

## Roles
| Id | Role | Model |
|---|---|---|
| `des-director` | Plans, assigns, reviews, writes the report | default |
| `des-ux-auditor` | Finds friction in the demo and website, with screenshots | sonnet |
| `des-ui` | Design system and screens; specs for Engineering; small assigned style changes | sonnet |
| `des-motion` | Animations and tap feedback; respects reduced motion | sonnet |
| `des-brand-web` | Website look, store screenshots, brand kit, Marketing visuals | sonnet |

Role files: `.claude/agents/des-*.md`.

## Existing design work
- [docs/design/ui-audit.md](../../design/ui-audit.md): 48 findings, 5 rounds, 7-step fix plan.
- [docs/design/illustrations.md](../../design/illustrations.md) / illustrations.xlsx: pictures the founder is making.
- `src/core/theme.ts`, `src/components/ui.tsx`, `src/components/SportSymbol.tsx`.
- [docs/marketing/brand-kit/README.md](../../marketing/brand-kit/README.md).
- [docs/launch/store-launch.md](../../launch/store-launch.md) section D (store screenshots).

## Founder design rules
- Light "court" theme, leaning S:N logo. Dark mode only after the founder decides.
- No drawn sport art; a sport's symbol is its emoji everywhere.
- Plain match cards. Lime means one thing per area.
- Every tap and scoring step gives visible feedback.
- The keyboard never covers a field.

## Working with the other divisions
Standing hand-offs from the [charter](../README.md):
- **Engineering → Design:** every new or changed screen gets a design review before release.
- **Design → Engineering:** a design change that needs code goes as a spec (screens, states, motion notes) in a hand-off file.
- **Marketing → Design:** we supply visuals, brand-kit assets and demo screens.
- **Design → Security:** anything shown publicly gets a privacy check (no children's data, no secrets).
Other requests use `docs/org/handoffs/` files.

## What "done" means for a design item
1. Before and after screenshots (phone width), and tap counts when it's about speed.
2. Every state covered: empty, loading, error, live, finished.
3. Founder rules checked (list above), reduced motion checked.
4. If it needed code: Engineering built it under the quality mandate, and Design reviewed it in the demo.
5. Founder approved publishing (or it's internal only).
6. Backlog item marked `done` with links.

## Cadence
- Daily 08:30 IST: the Director runs only if there's work or an open hand-off; writes `reports/YYYY-MM-DD.md`.
- Monday: plans the week (roadmap, backlog, assignments, hand-offs).
- Ends every report with a one-line usage note.
