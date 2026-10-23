/** Turn picked spots (EntrantPicker) into a side — demo and live alike, through
 *  the repos. The roster holds the PLAYER ids of the real people, which is what
 *  makes the match theirs ("mine": team rosters in getMyScope) and puts its
 *  results on their one profile. */
import { createReplacementPlayer, createTeam } from './repos';
import { allLinked, entryName, entryShortName, findEntryFor, slotId, slotName, type EntrantPerson, type EntrantSlot } from './participantEntry';
import type { SportId } from '../core/types';

/** The players behind the spots: a picked person is themselves; a name-only
 *  spot (the last resort) becomes a provisional player — not linked to anyone's
 *  account until someone adds their mobile number to it. `houseName` lets a
 *  name-only partner resolve by the pair's name, as before. */
export async function resolveEntrants(slots: EntrantSlot[], sport: SportId, houseName?: string): Promise<EntrantPerson[]> {
  return Promise.all(slots.map(async (s) => {
    if (s.kind === 'person') return s.person;
    const p = await createReplacementPlayer(slotName(s), sport, houseName);
    return { id: p.id, fullName: p.fullName };
  }));
}

/** The side for these spots in this sport: when every spot is a linked person
 *  and one of `teams` already has exactly them on its roster, that entry is
 *  reused; otherwise a new one- or two-person team is made with them as its
 *  roster. Returns its id and name. */
export async function sideForEntrants(
  slots: EntrantSlot[],
  opts: { sport: SportId; teams: { id: string; name: string; roster?: string[] }[]; colorHex: string; adhoc?: boolean; orgId?: string },
): Promise<{ id: string; name: string; created: boolean }> {
  const names = slots.map(slotName);
  const name = entryName(names);
  if (allLinked(slots)) {
    const existing = findEntryFor(opts.teams, slots.map((s) => slotId(s)!));
    if (existing) return { id: existing.id, name: existing.name, created: false };
  }
  const people = await resolveEntrants(slots, opts.sport, slots.length > 1 ? name : undefined);
  const team = await createTeam({
    name, shortName: entryShortName(names), sport: opts.sport, colorHex: opts.colorHex,
    adhoc: opts.adhoc, orgId: opts.orgId, roster: people.map((p) => p.id),
  });
  return { id: team.id, name: team.name, created: true };
}
