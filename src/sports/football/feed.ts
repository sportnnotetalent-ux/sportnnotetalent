/**
 * Deep wave — football's minute-by-minute COMMENTARY (BBC / ESPN live-text
 * style, ../invasion/feed.ts) and match facts. PURE: derived from the event
 * log every time, so an edit, a removal or an undo re-writes the sentences
 * and every later running score.
 *
 *   "Goal! India 1, Japan 0. Rahul (India) right-footed shot from inside the
 *    box. Assisted by Dev."
 *   "Attempt saved. Kenji (Japan) shot from outside the box is saved by
 *    Gurpreet. Assisted by Daichi."
 *   "Foul by Sandesh (India). Kaoru (Japan) wins a free kick."
 *   "Kenji (Japan) is shown the yellow card for dissent."
 *
 * A keeper's save, a defender's block and a key pass that the controls log
 * right after their shot read on the shot's line (as broadcast text does).
 * Minutes use FIFA notation (45+2'); the feed is grouped by half, then
 * extra time, then the penalty shoot-out.
 */
import { SHOOTOUT_PERIOD, groupByScorer, emptyFacts, scoreText, type FeedItem, type MatchFacts, type Score } from '../invasion/feed.ts';
import { minuteText, eventHalf, halfTimeText, backfillKicks, penScore, type FootballState, type MinuteFormat } from './engine.ts';
import { CARD_REASON_PHRASE, NO_GOAL_LABEL, type CardReason, type FootballEvent, type NoGoalReason, type StatEvent } from './events.ts';
import { footballPossession } from './depth.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

type Side = 'home' | 'away';
type Names = { home: string; away: string };
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Section headings: "First half", "Second half", "Extra time — first half"… */
export const FOOTBALL_PERIOD_LABEL = (p: number): string =>
  p === SHOOTOUT_PERIOD ? 'Penalty shoot-out'
    : p === 1 ? 'First half' : p === 2 ? 'Second half' : p === 3 ? 'Extra time — first half' : 'Extra time — second half';

const zonePhrase = (z?: 'box' | 'out') => (z === 'box' ? ' from inside the box' : z === 'out' ? ' from outside the box' : '');

/** "right-footed shot from inside the box" / "header" / "converts the penalty". */
function goalPhrase(e: FootballEvent): string {
  if (e.goalType === 'penalty') return 'converts the penalty';
  if (e.goalType === 'freekick') return `scores direct from a free kick${zonePhrase(e.zone)}`;
  const head = e.goalType === 'header' || e.bodyPart === 'head';
  const strike = head ? 'header' : e.bodyPart === 'left' ? 'left-footed shot' : e.bodyPart === 'right' ? 'right-footed shot' : e.bodyPart === 'chest' ? 'finish off the chest' : '';
  return strike ? `${strike}${zonePhrase(e.zone)}` : `scores${zonePhrase(e.zone)}`;
}

/** The sentence for a goal-list event (goal, card, sub …). */
export function footballEventSentence(e: FootballEvent, names: Names, score: Score): { icon: string; text: string; major?: boolean; tone?: FeedItem['tone'] } {
  const team = names[e.side];
  const who = (n?: string, t = team) => (n ? `${n} (${t})` : t);
  const line = `${names.home} ${score.home}, ${names.away} ${score.away}`;
  switch (e.type) {
    case 'goal': {
      const body = e.playerName ? `${who(e.playerName)} ${goalPhrase(e)}.` : `${team} score.`;
      return { icon: '⚽', text: `Goal! ${line}. ${body}${e.secondName ? ` Assisted by ${e.secondName}.` : ''}${e.bigChance ? ' A big chance taken.' : ''}`, major: true, tone: 'goal' };
    }
    case 'owngoal':
      return { icon: '🥅', text: `Own goal by ${who(e.playerName, names[other(e.side)])}. ${line}.`, major: true, tone: 'goal' };
    case 'yellow': {
      if (e.official) return { icon: '🟨', text: `${e.playerName ?? 'A team official'}, ${team} official, is shown the yellow card.`, major: true, tone: 'yellow' };
      const why = e.reason ? CARD_REASON_PHRASE[e.reason as CardReason] : '';
      return { icon: '🟨', text: `${who(e.playerName)} is shown the yellow card${why ? ` for ${why}` : ''}.`, major: true, tone: 'yellow' };
    }
    case 'red': {
      if (e.official) return { icon: '🟥', text: `${e.playerName ?? 'A team official'}, ${team} official, is sent off.`, major: true, tone: 'red' };
      if (e.secondYellow) return { icon: '🟥', text: `Second yellow card to ${who(e.playerName)} — sent off. ${team} are a player down.`, major: true, tone: 'red' };
      const why = e.reason ? CARD_REASON_PHRASE[e.reason as CardReason] : '';
      return { icon: '🟥', text: `Red card! ${who(e.playerName)} is sent off${why ? ` for ${why}` : ''}.`, major: true, tone: 'red' };
    }
    case 'sub':
      return { icon: '🔄', text: `Substitution, ${team}. ${e.secondName || 'A substitute'} replaces ${e.playerName || 'a team-mate'}.`, major: true };
    case 'stoppage': {
      const r = e.playerName;
      return { icon: '⏸️', text: r === 'injury' ? 'Delay in match because of an injury.' : r === 'var' ? 'VAR check in progress.' : r === 'cooling' ? 'Cooling break.' : 'Delay in match.' };
    }
    case 'sinbin':
      return { icon: '⏱️', text: `${who(e.playerName)} is sin-binned${e.suspendMinutes ? ` for ${e.suspendMinutes} minutes` : ''}.`, major: true, tone: 'yellow' };
    case 'timeout':
      return { icon: '⏸️', text: `Time-out, ${team}.` };
    case 'nogoal': {
      const why = e.reason && e.reason in NO_GOAL_LABEL ? NO_GOAL_LABEL[e.reason as NoGoalReason].toLowerCase() : '';
      return { icon: '🚫', text: `Goal ruled out for ${team}${e.playerName ? ` (${e.playerName})` : ''}${why && why !== 'other' ? ` — ${why}` : ''}${e.review ? ', after a VAR review' : ''}.`, major: true, tone: 'chance' };
    }
  }
}

/** The sentence for a stat event (shot, foul, corner …). `extra` = what the
 *  next taps added: the keeper who saved it, the blocker, the key passer. */
export function footballStatSentence(e: StatEvent, names: Names, extra: { saver?: string; blocker?: string; passer?: string; victim?: string } = {}): { icon: string; text: string; major?: boolean; tone?: FeedItem['tone'] } {
  const team = names[e.side];
  const who = (n?: string) => (n ? `${n} (${team})` : team);
  const assisted = extra.passer ? ` Assisted by ${extra.passer}.` : '';
  const big = e.bigChance ? ' A big chance.' : '';
  switch (e.kind) {
    case 'shot': {
      const shot = `shot${zonePhrase(e.zone)}`;
      if (e.woodwork) return { icon: '🥅', text: `${who(e.playerName)} hits the woodwork with a ${shot}!${assisted}${big}`, major: true, tone: 'chance' };
      if (e.blocked) return { icon: '🧱', text: `Attempt blocked. ${who(e.playerName)} ${shot} is blocked${extra.blocker ? ` by ${extra.blocker}` : ''}.${assisted}${big}`, ...(e.bigChance ? { major: true, tone: 'chance' as const } : {}) };
      if (e.onTarget) return { icon: '🧤', text: `Attempt saved. ${who(e.playerName)} ${shot} is saved${extra.saver ? ` by ${extra.saver}` : ''}.${assisted}${big}`, ...(e.bigChance ? { major: true, tone: 'chance' as const } : {}) };
      return { icon: '↗️', text: `Attempt missed. ${who(e.playerName)} ${shot} misses the target.${assisted}${e.bigChance ? ' A big chance missed.' : ''}`, ...(e.bigChance ? { major: true, tone: 'chance' as const } : {}) };
    }
    case 'foul':
      return { icon: '🟫', text: `Foul by ${who(e.playerName)}.${e.secondName ? ` ${e.secondName} (${names[other(e.side)]}) wins a free kick.` : ''}` };
    case 'corner':
      return { icon: '⛳', text: `Corner, ${team}.` };
    case 'offside':
      return { icon: '🚩', text: `Offside, ${team}.${e.playerName ? ` ${e.playerName} is caught offside.` : ''}` };
    case 'tackle':
      return { icon: '🛡️', text: `Tackle won by ${who(e.playerName)}.` };
    case 'interception':
      return { icon: '✋', text: `Interception by ${who(e.playerName)}.` };
    case 'save':
      return { icon: '🧤', text: `Save by ${who(e.playerName)}.` };
    case 'pass':
      return { icon: '➡️', text: `Pass ${e.complete ? 'completed' : 'misplaced'} by ${who(e.playerName)}.` };
    case 'cross':
      return { icon: '↗️', text: `Cross from ${who(e.playerName)}.` };
    case 'dribble':
      return { icon: '🏃', text: `${who(e.playerName)} takes on the defender and gets past.` };
    case 'handball':
      return { icon: '🤾', text: `Hand ball by ${who(e.playerName)}.` };
    case 'attackContribution':
      return { icon: '⚡', text: `Attacking play by ${who(e.playerName)}.` };
    case 'defenceContribution':
      return { icon: '🧱', text: `Defensive play by ${who(e.playerName)}.` };
    case 'penaltyWon':
      return { icon: '⚖️', text: `Penalty ${team}. ${e.playerName ?? 'A player'} wins a penalty.`, major: true, tone: 'chance' };
    case 'penaltyMissed':
      return { icon: '🚫', text: extra.saver ? `Penalty saved! ${who(e.playerName)} fails to score — saved by ${extra.saver}.` : `Penalty missed! ${who(e.playerName)} fails to score.`, major: true, tone: 'chance' };
    case 'block':
      return { icon: '🧱', text: `Block by ${who(e.playerName)}.` };
    case 'keyPass':
      return { icon: '🔑', text: `Key pass by ${who(e.playerName)}.` };
    case 'clearance':
      return { icon: '🦶', text: `Clearance by ${who(e.playerName)}.` };
    case 'goalKick':
      return { icon: '🥅', text: `Goal kick, ${team}.` };
    case 'throwIn':
      return { icon: '🙌', text: `Throw-in, ${team}.` };
  }
}

/** The whole match as commentary items (oldest first; Commentary groups them).
 *  IDs-only scoring: players are named by id for this viewer (`nameOf`). */
export function footballFeed(s0: FootballState, names: Names, nameOf: NameOf = legacyNameOf): FeedItem[] {
  const s = withNames(s0, nameOf);
  const f: MinuteFormat = { halfMinutes: s.halfMinutes, etMinutes: s.etMinutes };
  const stats = s.stats ?? [];
  const byId = new Map(stats.map((st) => [st.id, st]));
  // fold the follow-up taps into their shot's line
  const absorbed = new Set<number>();
  const extra = new Map<number, { saver?: string; blocker?: string; passer?: string }>();
  for (const st of stats) {
    // a penalty not scored is also a shot: its "Penalty saved / missed" line says it
    if (st.kind === 'shot' && st.pen) { absorbed.add(st.id); continue; }
    if (st.kind !== 'shot' && st.kind !== 'penaltyMissed') continue;
    const next = byId.get(st.id + 1);
    const x: { saver?: string; blocker?: string; passer?: string } = {};
    if (next && next.side !== st.side) {
      if (next.kind === 'save' && (st.kind === 'penaltyMissed' || (st.onTarget && !st.blocked))) { x.saver = next.playerName; absorbed.add(next.id); }
      else if (next.kind === 'block' && st.blocked) { x.blocker = next.playerName; absorbed.add(next.id); }
    }
    extra.set(st.id, x);
  }
  for (const st of stats) {
    if (st.kind !== 'keyPass' || st.ref === undefined) continue;
    const shot = byId.get(st.ref);
    if (shot && shot.kind === 'shot') { extra.set(shot.id, { ...extra.get(shot.id), passer: st.playerName }); absorbed.add(st.id); }
  }
  type Row = { half: number; minute: number; id: number; ev?: FootballEvent; st?: StatEvent };
  const rows: Row[] = [
    ...(s.events ?? []).map((e) => ({ half: eventHalf(e, f), minute: e.minute, id: e.id, ev: e })),
    ...stats.filter((st) => !absorbed.has(st.id)).map((st) => ({ half: eventHalf(st, f), minute: st.minute, id: st.id, st })),
  ].sort((a, b) => a.half - b.half || a.minute - b.minute || a.id - b.id);
  const score: Score = { home: 0, away: 0 };
  const out: FeedItem[] = [];
  rows.forEach((r, n) => {
    if (r.ev && (r.ev.type === 'goal' || r.ev.type === 'owngoal')) score[r.ev.side] += 1;
    const d = r.ev ? footballEventSentence(r.ev, names, score) : footballStatSentence(r.st!, names, extra.get(r.st!.id));
    // an own goal's row is the side it counted for; its player is the other side's
    const lead = r.ev ? (r.ev.official || r.ev.type === 'stoppage' || r.ev.type === 'owngoal' ? (r.ev.type === 'owngoal' && r.ev.playerId ? { id: r.ev.playerId } : {}) : r.ev.type === 'sub' ? { id: r.ev.secondId, name: r.ev.secondName } : { id: r.ev.playerId, name: r.ev.playerName }) : { id: r.st!.playerId, name: r.st!.playerName };
    out.push({
      id: r.ev ? `e${r.id}` : `s${r.id}`, period: r.half, t: n,
      stamp: minuteText(r.minute, (r.ev ?? r.st)!.half, f), icon: d.icon, text: d.text,
      side: r.ev ? r.ev.side : r.st!.side, score: { ...score },
      ...(d.major ? { major: true } : {}), ...(d.tone ? { tone: d.tone } : {}),
      ...(lead.id ? { playerId: lead.id } : {}), ...(lead.name ? { playerName: lead.name } : {}),
    });
  });
  // the shoot-out, kick by kick (older logs: the dots, takers unknown)
  if (s.shootout) {
    const kicks = s.shootout.kicks ?? backfillKicks(s.shootout);
    const so = { home: 0, away: 0 };
    const count = { home: 0, away: 0 };
    kicks.forEach((k, j) => {
      count[k.side] += 1;
      if (k.scored) so[k.side] += 1;
      const by = k.takerName ? `${k.takerName} (${names[k.side]})` : names[k.side];
      const how = k.scored ? 'scores' : k.outcome === 'saved' ? `has the penalty saved${k.keeperName ? ` by ${k.keeperName}` : ''}` : k.outcome === 'missed' ? 'misses' : 'fails to score';
      out.push({
        id: `so${j}`, period: SHOOTOUT_PERIOD, t: 1e6 + j, stamp: `P${count[k.side]}`, icon: k.scored ? '✅' : '❌', side: k.side,
        text: `${by} ${how}. ${names.home} ${so.home}, ${names.away} ${so.away} on penalties.`, score: { ...score }, scoreText: scoreText(so), major: true,
        ...(k.scored ? { tone: 'goal' as const } : {}), ...(k.takerId ? { playerId: k.takerId } : {}), ...(k.takerName ? { playerName: k.takerName } : {}),
      });
    });
    if (s.shootoutWinner) {
      const p = penScore(s);
      out.push({ id: 'so-end', period: SHOOTOUT_PERIOD, t: 2e6, stamp: 'FT', icon: '🏆', side: s.shootoutWinner, text: `${names[s.shootoutWinner]} win ${Math.max(p.home, p.away)}–${Math.min(p.home, p.away)} on penalties.`, score: { ...score }, scoreText: scoreText(p), major: true });
    }
  }
  return out;
}

/** The halves that head the feed (the one in play, even if empty). */
export const footballFeedPeriods = (s: FootballState): number[] => Array.from({ length: s.half }, (_, i) => i + 1);

/** Scorers with minutes ("Rahul 23', 67' (pen)"; own goals under the side
 *  they counted for), sendings-off, HT / possession notes. */
export function footballFacts(s0: FootballState, now = 0, nameOf: NameOf = legacyNameOf): MatchFacts {
  const s = withNames(s0, nameOf);
  const facts = emptyFacts();
  const f: MinuteFormat = { halfMinutes: s.halfMinutes, etMinutes: s.etMinutes };
  const goals = (s.events ?? []).filter((e) => e.type === 'goal' || e.type === 'owngoal')
    .sort((a, b) => eventHalf(a, f) - eventHalf(b, f) || a.minute - b.minute || a.id - b.id)
    .map((e) => ({
      side: e.side, who: e.playerName || 'Goal', key: e.playerId, stamp: minuteText(e.minute, e.half, f),
      tag: e.type === 'owngoal' ? 'OG' : e.goalType === 'penalty' ? 'pen' : e.goalType === 'freekick' ? 'FK' : undefined,
    }));
  const by = groupByScorer(goals);
  facts.home.push(...by.home.map((l) => `⚽ ${l}`));
  facts.away.push(...by.away.map((l) => `⚽ ${l}`));
  for (const e of s.events ?? []) if (e.type === 'red' && !e.official) facts[e.side].push(`🟥 ${e.playerName ?? 'Player'} ${minuteText(e.minute, e.half, f)}${e.secondYellow ? ' (2Y)' : ''}`);
  const ht = halfTimeText(s);
  if (ht) facts.notes.push(ht);
  if (s.shootout) { const p = penScore(s); facts.notes.push(`Penalties ${p.home}–${p.away}`); }
  const poss = footballPossession(s, now);
  if (poss) facts.notes.push(`Possession ${poss.home}% – ${poss.away}%`);
  return facts;
}
