/**
 * Security Wave 2b — the reads and writes behind "Requests to confirm" and
 * "verify your number to link" (W1-2b). The wording and parsing are pure:
 * data/requests.ts. Server: migration 20261028160000_security_wave2b and the
 * edge function verify-phone-firebase (channel 'claim'). Demo mode has no
 * other people, so nothing is ever waiting.
 */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { fnPath } from '../core/functionPath';
import { confirmPhoneCode, firebasePhoneAvailable, sendPhoneCode } from '../core/firebasePhone';
import { takeSms } from '../core/smsBudget';
import { setCurrentPlayerId } from '../core/notifications';
import { myPlayerIdMemo } from './myPlayerIdMemo';
import { getMyPlayerId } from './repos';
import {
  answerError, toDeclinedLink, toLinkReport, toPendingFriendly, toPendingLink,
  type ClaimOutcome, type DeclinedLink, type LinkReport, type PendingFriendly, type PendingLink,
} from './requests';

const live = () => isSupabaseConfigured && !!supabase;

/** Links someone else made to my side that nobody on my side confirmed yet. */
export async function getPendingLinks(): Promise<PendingLink[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('my_pending_links');
  if (error || !Array.isArray(data)) return [];
  return data.map(toPendingLink).filter((x): x is PendingLink => !!x);
}

/** Friendlies set up against a team I manage that I haven't answered. */
export async function getPendingFriendlies(): Promise<PendingFriendly[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('my_pending_friendlies');
  if (error || !Array.isArray(data)) return [];
  return data.map(toPendingFriendly).filter((x): x is PendingFriendly => !!x);
}

/** Confirm, or "Not us" (the player leaves the group). Throws a plain message. */
export async function answerLink(l: PendingLink, accept: boolean): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('answer_link', { p_kind: l.kind, p_group: l.groupId, p_player: l.playerId, p_accept: accept });
  if (error) throw new Error(answerError(error));
}

export async function answerFriendly(f: PendingFriendly, accept: boolean): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('answer_friendly', { p_match: f.matchId, p_team: f.teamId, p_accept: accept });
  if (error) throw new Error(answerError(error));
}

/** The number typed at sign-up (private to me), and the one on my own profile. */
export async function getClaimNumbers(myPlayerId: string | null): Promise<{ signUpPhone: string | null; profilePhone: string | null }> {
  if (!live()) return { signUpPhone: null, profilePhone: null };
  const [{ data: priv }, own] = await Promise.all([
    supabase!.rpc('my_profile_private'),
    myPlayerId ? supabase!.from('players').select('phone').eq('id', myPlayerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const signUpPhone = ((priv as { phone: string | null }[] | null)?.[0]?.phone) ?? null;
  const profilePhone = ((own.data as { phone: string | null } | null)?.phone) ?? null;
  return { signUpPhone, profilePhone };
}

export const phoneClaimAvailable = (): boolean => live() && firebasePhoneAvailable();

/** Text a code to the number (Firebase SMS, under the SMS spend cap). */
export async function beginPhoneClaim(phone: string): Promise<void> {
  if (!phoneClaimAvailable()) throw new Error('SMS codes aren’t available here yet.');
  await takeSms(phone);
  await sendPhoneCode(phone);
}

/** Check the code; the server links the profile a coach made under the number. */
export async function confirmPhoneClaim(code: string, profileId: string): Promise<ClaimOutcome> {
  const idToken = await confirmPhoneCode(code);
  const { data, error } = await supabase!.functions.invoke(fnPath('verify-phone-firebase'), { body: { channel: 'claim', idToken } });
  const d = data as { verified?: boolean; outcome?: string; reason?: string } | null;
  if (error || !d?.verified) throw new Error(d?.reason ?? 'Couldn’t verify the number — try again.');
  const outcome: ClaimOutcome = d.outcome === 'linked' || d.outcome === 'support' ? d.outcome : 'none';
  if (outcome === 'linked') {
    // My player is now the coach-made one: forget the old id everywhere it's
    // held (W2bB-16) — screens re-read it on focus; pushes need it set.
    myPlayerIdMemo.clear();
    void getMyPlayerId(profileId).then(setCurrentPlayerId).catch(() => {});
  }
  return outcome;
}

/* ---------------- Wave 3F: waiting, declined, reports ---------------- */

/** A team's managers: the players whose side hasn't confirmed yet (else []). */
export async function getWaitingPlayerIds(teamId: string): Promise<string[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('team_waiting_player_ids', { p_team: teamId });
  return error || !Array.isArray(data) ? [] : (data as string[]);
}

export async function getDeclinedLinks(): Promise<DeclinedLink[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('my_declined_links');
  if (error || !Array.isArray(data)) return [];
  return data.map(toDeclinedLink).filter((x): x is DeclinedLink => !!x);
}

export async function undoDecline(d: DeclinedLink): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('undo_decline', { p_kind: d.kind, p_group: d.groupId, p_player: d.playerId });
  if (error) throw new Error(answerError(error));
}

/** Report a request to support (it also counts as "Not us"). */
export async function reportLink(l: PendingLink, reason = ''): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('report_link', { p_kind: l.kind, p_group: l.groupId, p_player: l.playerId, p_reason: reason });
  if (error) throw new Error(/too many/i.test(error.message) ? error.message : answerError(error));
}

/** Support console: open reports. */
export async function getLinkReports(): Promise<LinkReport[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('support_link_reports');
  if (error || !Array.isArray(data)) return [];
  return data.map(toLinkReport).filter((x): x is LinkReport => !!x);
}

export async function handleLinkReport(id: string): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('support_handle_link_report', { p_id: id });
  if (error) throw new Error(error.message);
}
