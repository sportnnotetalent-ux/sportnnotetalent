/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md, founder 2026-10-24) —
 * kabaddi's names, put back when something is shown. PURE (node tests load it).
 *
 * The match state and events are public, so a new kabaddi log names players
 * by id only (engine.ts): raider, tackler, defenders touched, the player at
 * fault / carded, both players of a substitution. These read them for the
 * viewer through a `NameOf` (players_view: circle full names, everyone else
 * initials, an open dispute "X"). An older log that stored names still reads
 * exactly as before: the stored name is only the fallback, and with no lookup
 * (`legacyNameOf`) the text is the stored text.
 *
 * Name keys an older log may carry (the close-out's server safety net and
 * clean-up): action payload `raiderName`, `tacklerName`, `touched[].name`,
 * `playerName` (TECH_POINT / CARD), `offName` / `onName` (SUB);
 * `attribution.playerName` / `attribution2.playerName`; state `raids[].raider`,
 * `raids[].tackler`, `raids[].touched[].name`, `orphanRaids[]` (same),
 * `extras[].playerName`, `extras[].who` (a name when no id), `subbedOff`
 * (names), `events[].playerName`, `events[].detail` (a name, or
 * "On ⬆  Off ⬇"), `events[].ret` (a name).
 */
import { FALLBACK_NAME, legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import { whoName, withRosters, type RosterLike } from '../racketNames.ts';
import { extrasOf, type ExtraEntry, type KabaddiEvent, type KabaddiState, type RaidEntry, type TouchedRef } from './engine.ts';

export { legacyNameOf, whoName, withRosters };
export type { NameOf, RosterLike };

/** The raider of a raid for this viewer (undefined = nobody named). */
export const raiderName = (nameOf: NameOf, r: Pick<RaidEntry, 'raiderId' | 'raider'>): string | undefined => whoName(nameOf, r.raiderId, r.raider);
/** The tackler of a raid for this viewer (undefined = nobody named). */
export const tacklerName = (nameOf: NameOf, r: Pick<RaidEntry, 'tacklerId' | 'tackler'>): string | undefined => whoName(nameOf, r.tacklerId, r.tackler);
/** A defender touched on a raid, for this viewer. */
export const touchedName = (nameOf: NameOf, t: TouchedRef): string | undefined => whoName(nameOf, t.id, t.name);
/** The player at fault (technical point) / carded, for this viewer. */
export const extraName = (nameOf: NameOf, x: Pick<ExtraEntry, 'playerId' | 'playerName'>): string | undefined => whoName(nameOf, x.playerId, x.playerName);

/** A substitution's players for this viewer: `on` comes on, `off` goes off.
 *  An older log names them only inside `detail` ("On ⬆  Off ⬇"). */
export function subPlayers(e: KabaddiEvent, nameOf: NameOf = legacyNameOf): { on: string; off: string } | null {
  if (e.kind !== 'sub') return null;
  if (e.playerId || e.secondId) {
    return { on: whoName(nameOf, e.secondId) ?? FALLBACK_NAME, off: whoName(nameOf, e.playerId) ?? FALLBACK_NAME };
  }
  const m = /^(.*?)\s*⬆\s+(.*?)\s*⬇$/.exec(e.detail ?? '');
  return m ? { on: nameOf(undefined, m[1]), off: nameOf(undefined, m[2]) } : null;
}

/**
 * A timeline line's player text for this viewer — what an older log stored
 * in `detail`: the raider (a raid, a raider's line-out), the tackler, the
 * player at fault / carded (or "Team official"), "On ⬆  Off ⬇" for a
 * substitution, the credited player of a one-tap point. Undefined when the
 * line names nobody. With `legacyNameOf` an older log's text is unchanged.
 */
export function kabaddiEventDetail(s: KabaddiState, e: KabaddiEvent, nameOf: NameOf = legacyNameOf): string | undefined {
  if (e.kind === 'sub') {
    if (!(e.playerId || e.secondId)) return e.detail;
    const p = subPlayers(e, nameOf);
    return p ? `${p.on} ⬆  ${p.off} ⬇` : e.detail;
  }
  if (e.group != null) {
    const raid = (s.raids ?? []).find((r) => r.eid === e.group) ?? (s.orphanRaids ?? []).find((r) => r.eid === e.group);
    if (raid) {
      if (e.kind === 'raid') return raiderName(nameOf, raid);
      // a raider's line-out (the point goes to the defence) names the raider
      if (e.kind === 'lineout') return e.side !== raid.side ? raiderName(nameOf, raid) : e.detail;
      if (e.kind === 'tackle') return tacklerName(nameOf, raid);
      return e.detail;
    }
    const x = extrasOf(s).find((y) => y.eid === e.group);
    if (x) {
      if (e.id !== x.eid) return e.detail; // a card's technical-point line
      return x.official ? 'Team official' : extraName(nameOf, x);
    }
    return e.detail;
  }
  if (e.playerId || e.playerName) return whoName(nameOf, e.playerId, e.playerName) ?? e.detail;
  return e.detail;
}
