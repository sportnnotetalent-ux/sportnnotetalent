/**
 * Rugby league voice / typed commands. PURE: the same actions (and credits)
 * the buttons dispatch, null when unsure (the shared panel confirms first).
 *   "try Rao" / "try Rao assist Khan" / "penalty try home"
 *   "conversion good Rao" / "conversion missed" (no side → the last try's side)
 *   "penalty goal Rao" / "penalty goal missed Rao"
 *   "field goal Rao" / "drop goal Rao" / "one pointer Rao" / "two point field goal Rao" (with the NRL option on)
 *   "sin bin Rao" / "send off Rao" / "on report Rao"
 *   with six-tackle sets: "tackle", "six again", "knock on" / "error", "kick"
 *   "end half" / "full time" (full time only when it really is — `leagueVoiceEnds`)
 */
import type { ScoreAction, VoiceContext, VoiceEnding } from '../types';
import type { Player } from '../../core/types';
import { deburr, resolveSide, matchPlayer, withoutTeams } from '../voiceMatch.ts';
import * as lg from './engine.ts';

type Side = 'home' | 'away';
const TRACKED: string[] = [...lg.LIVE_KEYS];
const vid = (now: number) => `v${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const END_WORDS = /\b(full ?time|final (whistle|siren)|end (of )?(the )?(match|game))\b/;
const PERIOD_WORDS = /\b(end (of )?(the )?(half|period|h[12]|golden point)|half ?time)\b/;
const POINTER = /\b(one|two|1|2) ?-? ?point(er)?s?\b/gi;
const COMMANDS = /\b(send ?off|sent off|sin ?bin(ned)?|on report|field goal|drop ?(goal|kick)|penalty (goal|kick|try)|conver(t|sion|ted)|good|miss(ed)?)\b/gi;
const MISS = /\b(miss(ed)?|wide|no good|short|hit the post|astray)\b/;

/** Is the period in play the match's last (as the Full time button reads it)? */
export function leagueLast(s: lg.LeagueState): boolean {
  return s.period >= s.plan.length && !(lg.levelAtEnd(s) && lg.nextPlan(s).length > 0);
}

export function leagueVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as lg.LeagueState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const now = ctx.now ?? Date.now();
  const stamp = () => ({ uid: vid(now), at: now, sec: lg.matchSec(s, now), psec: lg.periodSec(s, now), period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!lg.periodStarted(s)) return null;
    if (END_WORDS.test(q) && !leagueLast(s)) return null;
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  if (!lg.periodStarted(s)) return null;
  // six-tackle sets: exact phrases only (with a set running) — "six" isn't a shirt number
  const open = s.setLog ? lg.currentSet(s) : null;
  if (open) {
    if (/^tackle$/.test(q)) return [{ type: 'TACKLE', payload: stamp() }];
    if (/^(six again|set restart)$/.test(q)) return [{ type: 'SET_END', payload: { how: 'restart', ...stamp() } }];
    if (/^(knock ?on|error|forward pass)$/.test(q)) return [{ type: 'SET_END', payload: { how: 'error', ...stamp() } }];
    if (/^(kick|last tackle kick)$/.test(q)) return [{ type: 'SET_END', payload: { how: 'kick', ...stamp() } }];
  }
  // the command words never name a player ("send off" ⊃ "Sen"; "two point field goal Rao": the 2 isn't a shirt number)
  const twoSaid = /\b(two|2) ?-? ?point(er)?s?\b/i.test(q);
  const said = resolveSide(text.replace(POINTER, ' ').replace(COMMANDS, ' '), ctx);
  const lastTry = [...s.events].reverse().find((e) => e.type === 'try' || e.type === 'pentry');
  const credit = (e: Parameters<typeof lg.eventCredits>[0]) => {
    const cr = lg.eventCredits(e);
    return { attribution: lg.creditAttribution(cr.first, 1, TRACKED), attribution2: lg.creditAttribution(cr.second, 1, TRACKED) };
  };
  const roster = (sd: Side): Player[] => (sd === 'home' ? ctx.homeRoster : ctx.awayRoster);
  if (/\bpenalty try\b/.test(q)) return said.side ? [{ type: 'PENALTY_TRY', side: said.side, payload: stamp() }] : null;
  if (/\bconver(t|sion|ted)\b/.test(q)) {
    const side = said.side ?? lastTry?.side;
    if (!side) return null;
    const made = !MISS.test(q);
    const kicker = said.player ?? matchPlayer(q, roster(side));
    return [{ type: 'KICK', side, payload: { kick: 'conv', made, ...stamp() }, ...credit({ type: 'kick', kick: 'conv', made, playerId: kicker?.id, playerName: kicker?.fullName }) }];
  }
  const side = said.side;
  if (!side) return null;
  const player = said.player;
  if (/\b(field goal|drop ?(goal|kick)|(one|two|1|2) ?-? ?pointer)\b/.test(q)) {
    const made = !MISS.test(q);
    const two = made && s.fg2 && twoSaid;
    return [{ type: 'KICK', side, payload: { kick: 'fg', made, ...(two ? { two: true } : {}), ...stamp() }, ...credit({ type: 'kick', kick: 'fg', made, two, playerId: player?.id, playerName: player?.fullName }) }];
  }
  if (/\bpenalty (goal|kick)\b/.test(q)) {
    const made = !MISS.test(q);
    return [{ type: 'KICK', side, payload: { kick: 'pen', made, ...stamp() }, ...credit({ type: 'kick', kick: 'pen', made, playerId: player?.id, playerName: player?.fullName }) }];
  }
  const sanction: lg.Sanction | null = /\bsin ?bin(ned)?\b/.test(q) ? 'sinBin' : /\b(send ?off|sent off)\b/.test(q) ? 'sendOff' : /\bon report\b/.test(q) ? 'report' : null;
  if (sanction) {
    return [{ type: 'SANCTION', side, payload: { sanction, ...stamp() }, ...credit({ type: 'sanction', sanction, playerId: player?.id, playerName: player?.fullName }) }];
  }
  if (/\btry\b|\bscores?\b/.test(q)) {
    const m = /\b(assist(?:ed)?(?: by)?|pass from|from)\b(.*)$/.exec(deburr(q));
    const scorer = m ? matchPlayer(q.slice(0, m.index), roster(side)) : player;
    const assist = m ? matchPlayer(m[2], roster(side).filter((p) => p.id !== scorer?.id)) : undefined;
    return [{ type: 'TRY', side, payload: stamp(), ...credit({ type: 'try', playerId: scorer?.id, playerName: scorer?.fullName, secondId: assist?.id, secondName: assist?.fullName }) }];
  }
  return null;
}

export function leagueVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as lg.LeagueState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return leagueLast(s) ? { action: 'fullTime', score } : { action: 'endPeriod', period: lg.periodName(s, s.period), score };
}
