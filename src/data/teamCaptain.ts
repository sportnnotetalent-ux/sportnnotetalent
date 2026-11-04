/**
 * A new team gets its captain (founder 2026-11-06,
 * docs/security/breaks/pick-tournament-teams.md PK5/PK8): the captain is a real
 * person found or invited by mobile number, set as captain, and handed their
 * own join link — signing up with that number claims the captaincy, so they can
 * add the players. The team code is the fallback for a different number.
 */
import { createInvite, createTeam, invitePerson, setTeamLeaders } from './repos';
import { joinLink } from '../core/invite';
import type { SportId, Team } from '../core/types';

export interface CaptainInvite { teamId: string; teamName: string; captainName: string; phone: string; link: string; code: string }

/** Make an existing team's captain this person and return the invite to share. */
export async function inviteCaptain(teamId: string, teamName: string, captainName: string, phone: string, sport?: SportId): Promise<CaptainInvite> {
  const { player } = await invitePerson({ name: captainName.trim(), phone: phone.trim(), sport });
  await setTeamLeaders(teamId, { captainId: player.id });
  const invite = await createInvite(teamId, teamName, 'captain');
  return { teamId, teamName, captainName: player.fullName, phone: phone.trim(), link: joinLink(player.id), code: invite.token };
}

const shortFrom = (name: string) => {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();
  return ((initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'TM').slice(0, 4);
};

/** A brand-new team (a real record, not a one-off side) with its captain invited. */
export async function createTeamWithCaptain(input: { name: string; sport: SportId; captainName: string; captainPhone: string; colorHex?: string; orgId?: string }): Promise<{ team: Team; invite: CaptainInvite }> {
  const team = await createTeam({ name: input.name.trim(), shortName: shortFrom(input.name), sport: input.sport, colorHex: input.colorHex ?? '#4DA3FF', orgId: input.orgId });
  const invite = await inviteCaptain(team.id, team.name, input.captainName, input.captainPhone, input.sport);
  return { team, invite };
}
