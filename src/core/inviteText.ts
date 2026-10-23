/** Invite / share text for every invite type — pure (no React Native) so the exact
 *  wording is unit-tested (tests/invite-share.test.mts). invite.ts re-exports the
 *  builders that used to live there, so existing imports keep working.
 *
 *  SD-108: each message names what the record IS before its name — "Join Team L&H",
 *  "Enter your team in Tournament Open Cup", "manage Team X at Tournament Y" — so a
 *  short name like "L&H" isn't confusing in a WhatsApp chat. */
import { SHARE_BASE } from './shareText.ts';

/** What a shared record is, as the reader sees it. */
export type InviteKind = 'Team' | 'Club' | 'Tournament' | 'Organisation' | 'Match';

/** "Team L&H" — the kind word before the name, unless the name already says it
 *  ("Team Titans" stays "Team Titans", "Hyderabad Open Tournament" stays as is). */
export function inviteLabel(kind: InviteKind, name: string): string {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!n) return kind;
  const word = kind === 'Organisation' ? 'organi[sz]ation' : kind.toLowerCase();
  return new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, 'i').test(n) ? n : `${kind} ${n}`;
}

/** The invite/accept link for a provisional (added-by-number) player. */
export const joinLink = (id: string) => `${SHARE_BASE}/i/${id}`;
/** "This isn't me" for a provisional player (no app/account needed). */
export const reportLink = (playerId: string) => `${SHARE_BASE}/i/${playerId}?notme=1`;

/** A CLUB (multi-sport team) invite: the web app's Join screen. This https link is
 *  also what the invite QR encodes — a phone camera opens it in the browser, which
 *  offers "Open in the SportnNote app" on Android (see androidIntentUrl). */
export const clubJoinLink = (token: string) => `${SHARE_BASE}/join-club/${token}`;
/** The in-app deep link that opens the redeem screen straight away once installed. */
export const clubJoinDeepLink = (token: string) => `sportnnote://join-club/${token}`;

/** Extract a club invite code from a scanned/typed value — the deep link
 *  (sportnnote://join-club/CODE), the https link (…/join-club?c=CODE or
 *  …/join-club/CODE), or a bare code. Returns the upper-cased code, or null. */
export function parseClubToken(scanned: string): string | null {
  const s = scanned.trim();
  if (!s) return null;
  const q = s.match(/[?&]c=([A-Za-z0-9-]{3,40})/);
  if (q) return q[1].toUpperCase();
  const p = s.match(/join-club\/([A-Za-z0-9-]{3,40})/i);
  if (p) return p[1].toUpperCase();
  if (/^[A-Za-z0-9-]{3,40}$/.test(s)) return s.toUpperCase();
  return null;
}

/** "Invited (…1234)" is a placeholder until the person joins — never greet it. */
export const realName = (name?: string) => (name && !/^Invited \(/.test(name.trim()) ? name.trim() : '');

/** The message shared to invite someone to a club (team). Carries the code + link.
 *  The inviter is the sender's profile name exactly as they entered it. */
export function clubInviteMessage(opts: { clubName: string; inviterName: string; token: string }): string {
  return `Join ${inviteLabel('Team', opts.clubName)} on SportnNote! ${opts.inviterName} invited you 🛡️\n\nOpen this to join: ${clubJoinLink(opts.token)}\n\nOr in the app, go to Join a team and enter code: ${opts.token}`;
}

/** SD-152: the short privacy notice every invite to a person an organiser added
 *  carries (legal audit L21) — the policy says what "data an organiser adds
 *  about you" covers, and the person can see/remove it when they join. */
export const PRIVACY_NOTICE_URL = `${SITE_URL}/privacy/`;
export const privacyNoticeLine = (): string => `How we handle your details: ${PRIVACY_NOTICE_URL}`;

/** The install/join message for a provisional (added-by-phone) player. */
export function provisionalInviteMessage(opts: { name: string; playerId: string; teamName: string; captain?: boolean }): string {
  const who = realName(opts.name) || 'there';
  const team = inviteLabel('Team', opts.teamName);
  const link = joinLink(opts.playerId);
  const report = reportLink(opts.playerId);
  return opts.captain
    ? `Hi ${who}! You're the captain of ${team} on SportnNote 🧢\n\nTap the link and sign up with this mobile number (1 minute, no password) to confirm your spot, add your teammates and set the squad:\n${link}\n\nNot you / didn't expect this? Tell us (no app needed): ${report}\n${privacyNoticeLine()}`
    : `Hi ${who}! You've been added to ${team} on SportnNote 🏆\n\nTap the link and sign up with this mobile number (1 minute, no password) to confirm your spot and track your stats:\n${link}\n\nNot you / didn't expect this? Tell us (no app needed): ${report}\n${privacyNoticeLine()}`;
}

/** What someone is being invited to do — co-host an event (default) or manage a team. */
export type InviteRole = 'co-host' | 'manage';
const inviteVerb = (role?: InviteRole) => (role === 'manage' ? 'manage' : 'co-host');

/** The co-host / team-manager invite (email / WhatsApp / SMS). `context` is already
 *  labelled by the caller ("Tournament Open Cup", "Team X at Tournament Y"). */
export function inviteMessage(opts: { name: string; inviterName: string; link: string; context?: string; role?: InviteRole; reportUrl?: string }): string {
  const who = realName(opts.name) || 'there';
  const what = opts.context ? ` ${opts.context}` : '';
  const base = `Hi ${who}! ${opts.inviterName} invited you to ${inviteVerb(opts.role)}${what} on SportnNote 🏆 Install the app and register with this number/email to join:\n${opts.link}`;
  return opts.reportUrl
    ? `${base}\n\nNot you / didn’t expect this? Tell us (no app needed): ${opts.reportUrl}\n${privacyNoticeLine()}`
    : `${base}\n\n${privacyNoticeLine()}`;
}

export const inviteSubject = (inviterName: string, role?: InviteRole) =>
  `${inviterName} invited you to ${role === 'manage' ? 'manage a team' : 'co-host'} on SportnNote`;

/** Context for a team-manager invite: "Team X at Tournament Y". */
export const teamAtTournament = (teamName: string, tournamentName?: string) =>
  `${inviteLabel('Team', teamName)}${tournamentName ? ` at ${inviteLabel('Tournament', tournamentName)}` : ''}`;

/** Scorer / official / host of ONE match (#11 PersonPicker on the scoring screen). */
export function matchRoleInviteText(opts: { role: 'scorer' | 'host' | 'official'; name?: string; inviterName?: string; home: string; away: string; when?: string; link: string }): string {
  const who = opts.inviterName?.trim() || 'A friend';
  const as = opts.role === 'scorer' ? 'the scorer' : opts.role === 'official' ? 'an official' : 'a host';
  const todo = opts.role === 'scorer' ? 'score it live' : opts.role === 'official' ? 'follow the match' : 'manage the match';
  const when = opts.when ? ` (${opts.when})` : '';
  return `Hi${opts.name ? ` ${opts.name}` : ''}! ${who} added you as ${as} for Match ${opts.home} vs ${opts.away}${when} on SportnNote 🏅\n\n`
    + `Open this link and sign in with this mobile number to ${todo}:\n${opts.link}`;
}

/** Host / official (referee, umpire, …) of a TOURNAMENT. */
export function tournamentRoleInviteText(opts: { role: string; name?: string; inviterName?: string; tournamentName?: string; link: string }): string {
  const who = opts.inviterName?.trim() || 'A friend';
  const t = opts.tournamentName?.trim() ? inviteLabel('Tournament', opts.tournamentName) : 'a tournament';
  const hi = `Hi${opts.name ? ` ${opts.name}` : ''}! `;
  return opts.role === 'host'
    ? `${hi}${who} added you as a host of ${t} on SportnNote 🏆\n\nOpen this link and sign in with this mobile number to help run it:\n${opts.link}`
    : `${hi}${who} added you as a ${opts.role} for ${t} on SportnNote 🏆\n\nOpen this link and sign in with this mobile number:\n${opts.link}`;
}

/** A person added as a PLAYER by their mobile number — a singles opponent, a
 *  doubles partner, a golf group, an Americano field, a club member: signing up
 *  with that number makes the entry (and its results) theirs. Sent before the
 *  pending player exists (the chat app opens inside the tap), so it carries no
 *  per-person link. `context` is already labelled ("Tournament Open Cup"). */
export function playerInviteText(opts: { name?: string; inviterName?: string; sportName?: string; context?: string; link: string }): string {
  const who = opts.inviterName?.trim() || 'A friend';
  const name = realName(opts.name);
  const sport = opts.sportName?.trim() ? `${opts.sportName.trim()} ` : '';
  const where = opts.context?.trim() ? ` in ${opts.context.trim()}` : '';
  return `Hi${name ? ` ${name}` : ''}! ${who} added you as a ${sport}player${where} on SportnNote 🏅\n\n`
    + `Open this link and sign up with this mobile number (1 minute, no password) so your matches and stats land on your profile:\n${opts.link}\n\n`
    + privacyNoticeLine();
}

/* ------------------------------ open in the app ------------------------------ */

export const ANDROID_PACKAGE = 'in.sportnnote.app';
export const APP_SCHEME = 'sportnnote';
/** Where "Open in the app" lands when the app isn't installed: the website's
 *  "Get the app" section (Android APK download + iPhone steps). */
export { INSTALL_PAGE_URL } from './hosts.ts';
import { INSTALL_PAGE_URL, SITE_URL } from './hosts.ts';

export type WebDevice = 'android' | 'ios' | 'other';
/** Which phone a browser is on (iPadOS 13+ reports "Macintosh" + touch). */
export function webDevice(ua: string | undefined, maxTouchPoints = 0): WebDevice {
  const s = ua ?? '';
  if (/Android/i.test(s)) return 'android';
  if (/iPhone|iPad|iPod/i.test(s) || (/Macintosh/i.test(s) && maxTouchPoints > 1)) return 'ios';
  return 'other';
}

/* ------------------------------- a friend -------------------------------- */

/** "Join me on SportnNote" (2026-10-23): the inviter's personal link. It opens
 *  the GetApp screen — the right steps for the friend's phone (Android app or
 *  the web app on iPhone) — and once they have an account they follow the
 *  inviter (data/referral.ts). */
export const friendInviteLink = (inviterPlayerId: string) => `${SHARE_BASE}/get/${inviterPlayerId}`;

/** The WhatsApp / SMS message that carries it. */
export function friendInviteText(opts: { link: string; inviterName?: string; friendName?: string }): string {
  const friend = realName(opts.friendName);
  const me = (opts.inviterName ?? '').trim();
  return `${friend ? `Hi ${friend}! ` : 'Hi! '}${me ? `It's ${me}. ` : ''}I'm using SportnNote to score our games and run tournaments 🏆 `
    + `It's free while it's new. Join me here (Android or iPhone):\n${opts.link}`;
}

/** An Android Chrome intent link that opens the installed app on `path`
 *  (e.g. "join-club/JOIN-ABC") via the sportnnote:// scheme, or — when the app
 *  isn't installed — goes to `fallbackUrl`. Works with the current APK (the scheme
 *  is registered by Expo); no App Links verification needed. */
export function androidIntentUrl(path: string, fallbackUrl: string = INSTALL_PAGE_URL): string {
  const p = path.replace(/^\/+/, '');
  return `intent://${p}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
}

/* ---------------------------------- QR ---------------------------------- */

/** What an invite QR encodes: the same https link the message carries (a phone
 *  camera opens it; the in-app scanner reads the code out of it). */
export function inviteQrPayload(kind: 'club' | 'tournament', token: string): string {
  return kind === 'club' ? clubJoinLink(token) : `${SHARE_BASE}/join-tournament/${token}`;
}

/** File name for the shared QR image: "sportnnote-team-l-h-JOIN-ABC.png". */
export function inviteQrFileName(kind: 'club' | 'tournament', name: string, token: string): string {
  const slug = (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `sportnnote-${kind === 'club' ? 'team' : 'tournament'}${slug ? `-${slug}` : ''}-${token}.png`;
}
