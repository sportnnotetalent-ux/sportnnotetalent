/**
 * Security Wave 2b — "Requests to confirm" (pure: unit-tested in
 * tests/requests.test.mts). When someone else adds my player — or my child, or
 * a player I added — to their team, club, community or event, the link reveals
 * nothing until my side confirms it (Wave 2a). The same for a friendly another
 * team's host sets up against a team I manage. The reads and writes are in
 * requestsStore.ts; the server is migration 20261028160000_security_wave2b.
 */
import type { ConfirmCopy } from '../core/matchSafety';
import { phoneKey } from '../core/phone.ts';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export type LinkKind = 'team' | 'club' | 'org' | 'field_event';
const KINDS: readonly LinkKind[] = ['team', 'club', 'org', 'field_event'];

export interface PendingLink {
  kind: LinkKind;
  groupId: string;
  groupName: string;
  playerId: string;
  playerName: string;
  /** the group's creator */
  addedBy: string;
  at?: string;
}

export interface PendingFriendly {
  matchId: string;
  /** my team in it */
  teamId: string;
  teamName: string;
  otherTeam: string | null;
  sport: string;
  startsAt: string | null;
  status: string;
  hostName: string | null;
}

/** verify-phone-firebase, channel 'claim' (W1-2b). */
export type ClaimOutcome = 'linked' | 'none' | 'support';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const NOUN: Record<LinkKind, string> = { team: 'team', club: 'club', org: 'community', field_event: 'event' };

export function toPendingLink(row: unknown): PendingLink | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const kind = str(r.kind) as LinkKind;
  if (!KINDS.includes(kind) || !str(r.group_id) || !str(r.player_id)) return null;
  return {
    kind, groupId: str(r.group_id), groupName: str(r.group_name) || `a ${NOUN[kind]}`,
    playerId: str(r.player_id), playerName: str(r.player_name) || 'your player', addedBy: str(r.added_by) || 'Someone',
    ...(str(r.at) ? { at: str(r.at) } : {}),
  };
}

export function toPendingFriendly(row: unknown): PendingFriendly | null {
  const r = (row ?? {}) as Record<string, unknown>;
  if (!str(r.match_id) || !str(r.team_id)) return null;
  return {
    matchId: str(r.match_id), teamId: str(r.team_id), teamName: str(r.team_name) || 'your team',
    otherTeam: str(r.other_team) || null, sport: str(r.sport), startsAt: str(r.starts_at) || null,
    status: str(r.status), hostName: str(r.host_name) || null,
  };
}

const first = (name: string) => name.split(/\s+/)[0] || name;

/** "Coach Shah added Asha Rao to the team Shah U12" (`isMe`: "…added you…"). */
export function linkTitle(l: PendingLink, isMe: boolean): string {
  const who = isMe ? 'you' : l.playerName;
  return l.kind === 'field_event'
    ? `${l.addedBy} entered ${who} in the event ${l.groupName}`
    : `${l.addedBy} added ${who} to the ${NOUN[l.kind]} ${l.groupName}`;
}

/** What Confirm and Not us do, in one or two lines. */
export function linkConsequence(l: PendingLink, isMe: boolean): string {
  const whose = isMe ? 'your' : `${first(l.playerName)}'s`;
  const who = isMe ? 'you' : first(l.playerName);
  const confirm = `Confirm lets the ${NOUN[l.kind]}'s people see ${whose} full name and profile.`;
  return l.kind === 'field_event'
    ? `${confirm} Not us: the entry stays for its results, but shows only initials.`
    : `${confirm} Not us takes ${who} off the ${NOUN[l.kind]}.`;
}

export function notUsCopy(l: PendingLink, isMe: boolean): ConfirmCopy {
  const who = isMe ? 'you' : l.playerName;
  return {
    title: isMe ? 'Not you?' : `Not ${l.playerName}?`,
    message: l.kind === 'field_event'
      ? `The entry in ${l.groupName} stays for its results, but only initials show. You won't be asked again.`
      : `This takes ${who} off ${l.groupName}. You won't be asked again.`,
    yesLabel: 'Yes, not us',
    noLabel: 'No, keep it',
    tone: 'danger',
  };
}

const when = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : ` · ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
};

/** "Coach Iyer set up a friendly: Home XI v Away XI · 30 Oct". */
export function friendlyTitle(f: PendingFriendly): string {
  return f.hostName && f.otherTeam
    ? `${f.hostName} set up a friendly: ${f.otherTeam} v ${f.teamName}${when(f.startsAt)}`
    : `A friendly against ${f.teamName}${f.otherTeam ? ` (${f.otherTeam})` : ''}${when(f.startsAt)}`;
}

export const FRIENDLY_CONSEQUENCE = 'Accept lets its host and scorers see your players’ full names and profiles.';

export function declineFriendlyCopy(f: PendingFriendly): ConfirmCopy {
  return {
    title: 'Decline this friendly?',
    message: `${f.teamName}'s players stay private to its host and scorers. You won't be asked again.`,
    yesLabel: 'Yes, decline',
    noLabel: 'No, go back',
    tone: 'danger',
  };
}

export function requestsHeading(links: number, friendlies: number): string {
  const n = links + friendlies;
  return `${n} ${n === 1 ? 'request' : 'requests'} to confirm`;
}

export function answerError(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? '';
  if (/only the player/i.test(m)) return 'Only the player, their parent or the person who added them can answer this.';
  if (/only the team.?s manager/i.test(m)) return 'Only the team’s manager can answer this.';
  if (/nothing to confirm|isn.?t playing/i.test(m)) return 'This was already changed — pull down to refresh.';
  if (/only owner/i.test(m)) return 'This player is the only owner of that community — contact support.';
  if (/does not exist|schema cache/i.test(m)) return 'This needs an app update — try again after updating.';
  if (/fetch|network/i.test(m)) return 'No connection — try again.';
  return 'Couldn’t save your answer — try again.';
}

export function claimOutcomeText(o: ClaimOutcome): string {
  switch (o) {
    case 'linked': return 'Done — the matches and teams a coach added under this number are now on your profile.';
    case 'none': return 'Your number is verified. No profile was waiting under it.';
    case 'support': return 'We found a profile under this number, but it needs a person to check before it’s linked. Contact support from Settings.';
  }
}

/** "+91 •••••••001": the country code and the last three digits. */
export function maskPhone(raw: string): string {
  const k = phoneKey(raw);
  if (!k) return '';
  const p = parsePhoneNumberFromString(k);
  const cc = p?.countryCallingCode ?? '';
  const national = p ? String(p.nationalNumber) : k.slice(1);
  return `${cc ? `+${cc} ` : ''}${'•'.repeat(Math.max(0, national.length - 3))}${national.slice(-3)}`;
}

/** W1-2b: the number typed at sign-up isn't on the account's own profile —
 *  a coach-added profile already has it (uq_players_phone). */
export function showClaimCard(a: { signUpPhone: string | null; profilePhone: string | null; smsAvailable: boolean }): boolean {
  return a.smsAvailable && !!phoneKey(a.signUpPhone ?? '') && !phoneKey(a.profilePhone ?? '');
}

/* ---------------- Wave 3F: declined requests, reports ---------------- */

export interface DeclinedLink { kind: LinkKind; groupId: string; groupName: string; playerId: string; playerName: string; at?: string }

export function toDeclinedLink(row: unknown): DeclinedLink | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const kind = str(r.kind) as LinkKind;
  if (!KINDS.includes(kind) || !str(r.group_id) || !str(r.player_id)) return null;
  return {
    kind, groupId: str(r.group_id), groupName: str(r.group_name) || `a ${NOUN[kind]}`,
    playerId: str(r.player_id), playerName: str(r.player_name) || 'your player',
    ...(str(r.at) ? { at: str(r.at) } : {}),
  };
}

/** "Asha Rao — Shah U12 (team)". */
export function declinedLine(d: DeclinedLink, isMe: boolean): string {
  return `${isMe ? 'You' : d.playerName} — ${d.groupName} (${NOUN[d.kind]})`;
}

export function reportCopy(l: PendingLink, isMe: boolean): ConfirmCopy {
  const who = isMe ? 'you' : l.playerName;
  return {
    title: 'Report this to SportnNote?',
    message: `SportnNote support will look at who added ${who} to ${l.groupName}. It also counts as Not us: it takes ${who} off ${l.groupName}.`,
    yesLabel: 'Yes, report it',
    noLabel: 'No, go back',
    tone: 'danger',
  };
}

export interface LinkReport { id: string; kind: LinkKind; groupId: string; groupName: string; creatorName: string; creatorReports: number; reason: string; at?: string }

export function toLinkReport(row: unknown): LinkReport | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const kind = str(r.kind) as LinkKind;
  if (!str(r.id) || !KINDS.includes(kind)) return null;
  const n = Number(r.creator_reports);
  return {
    id: str(r.id), kind, groupId: str(r.group_id), groupName: str(r.group_name) || '(deleted)',
    creatorName: str(r.creator_name) || 'Someone', creatorReports: Number.isFinite(n) ? n : 0,
    reason: str(r.reason), ...(str(r.at) ? { at: str(r.at) } : {}),
  };
}
