/**
 * Deep wave — handball's live COMMENTARY (../invasion/feed.ts) and match
 * facts. PURE: derived from the event log every time, so a removal or an edit
 * re-writes the sentences and every later running score.
 *
 * EHF / IHF live-text wording, one line per moment with the match clock
 * (31:15) and the running score: "Asha Rao (India) scores from the wing.
 * Assist: Meera.", "Kim (Korea) — 9 m shot saved by Lee.", "2-minute
 * suspension for Park (Korea).", "India take the goalkeeper off — empty goal
 * (7th court player).", "7-metre shoot-out: Asha Rao (India) scores. 3–2".
 */
import { SHOOTOUT_PERIOD, emptyFacts, scoreText, type FeedItem, type MatchFacts, type Score } from '../invasion/feed.ts';
import { clockText, periodLong, shotOf, soScore, FAULT_LABEL, type HandballEvent, type HandballState, type ShotType, type Side } from './engine.ts';
import { emptyGoalIndexes } from './depth.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

type Names = { home: string; away: string };
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Where an attempt came from, as a phrase ("from the wing", "on the fast break"). */
export const SHOT_PHRASE: Record<ShotType, string> = {
  sixM: 'from 6 metres', nineM: 'from 9 metres', wing: 'from the wing', breakthrough: 'on a breakthrough', fastBreak: 'on the fast break', sevenM: 'from the 7-metre line',
};
const SHOT_NOUN: Record<ShotType, string> = { sixM: '6 m shot', nineM: '9 m shot', wing: 'wing shot', breakthrough: 'breakthrough', fastBreak: 'fast-break shot', sevenM: '7-metre throw' };

/** The section heading for a period ("1st half", "1st extra time · 2nd half", "7-metre throws"). */
export const handballPeriodLabel = (s: Pick<HandballState, 'periods'>) => (p: number): string =>
  p === SHOOTOUT_PERIOD ? '7-metre throws' : cap(periodLong(s, p));

/** One event's sentence (`answer` = the keeper / blocker / stealer linked to
 *  it; `empty` = a goal into an empty goal). */
export function handballSentence(e: HandballEvent, names: Names, answer?: string, empty?: boolean): { icon: string; text: string; major?: boolean; tone?: FeedItem['tone'] } {
  const team = names[e.side];
  const who = (n?: string) => (n ? `${n} (${team})` : team);
  // batch 6: a "Not sure" attempt names no position
  const t = shotOf(e);
  switch (e.type) {
    case 'goal': {
      const by = e.playerName ? `${who(e.playerName)} scores` : `Goal for ${team}`;
      return {
        icon: '🤾', major: true, tone: 'goal',
        text: `${by}${t ? ` ${SHOT_PHRASE[t]}` : ''}${empty ? ' into the empty goal' : ''}.${e.secondName ? ` Assist: ${e.secondName}.` : ''}`,
      };
    }
    case 'miss': {
      const r = e.result ?? 'missed';
      const by = who(e.playerName);
      const noun = t ? SHOT_NOUN[t] : 'shot';
      const text = r === 'saved' ? `${by} — ${noun} saved${answer ? ` by ${answer}` : ''}.`
        : r === 'blocked' ? `${by} — ${noun} blocked${answer ? ` by ${answer}` : ''}.`
        : `${by} misses${t ? ` ${SHOT_PHRASE[t]}` : ''}.`;
      return { icon: r === 'saved' ? '🧤' : r === 'blocked' ? '🛡' : '↗', text, ...(t === 'sevenM' ? { major: true, tone: 'chance' as const } : {}) };
    }
    case 'save':
      return { icon: '🧤', text: `Save by ${e.playerName ?? `the ${team} keeper`}${e.shotType === 'sevenM' ? ' from the 7-metre throw' : ''}.` };
    case 'block':
      return { icon: '🛡', text: `Block by ${who(e.playerName)}.` };
    case 'turnover':
      return { icon: '⚠️', text: answer ? `${answer} steals the ball from ${who(e.playerName)}.` : `Technical fault by ${who(e.playerName)}${e.fault ? ` — ${FAULT_LABEL[e.fault].toLowerCase()}` : ''}.` };
    case 'steal':
      return { icon: '🖐', text: `Steal by ${who(e.playerName)}.` };
    case 'card': {
      const c = e.card ?? 'twoMin';
      const subject = e.official ? `the ${team} official${e.official !== 'Team official' ? ` ${e.official}` : ''}` : who(e.playerName);
      if (c === 'yellow') return { icon: '🟨', text: `Warning (yellow card) for ${subject}.`, major: true, tone: 'yellow' };
      if (c === 'twoMin') {
        return e.third
          ? { icon: '🟥', text: `Third 2-minute suspension for ${subject} — disqualified. ${team} play short for 2 minutes.`, major: true, tone: 'red' }
          : { icon: '⏱', text: `2-minute suspension for ${subject}. ${team} play short for 2 minutes.`, major: true, tone: 'yellow' };
      }
      return { icon: '🟥', text: `Disqualification (red card${e.blue ? ' + blue card: written report' : ''}) for ${subject}.`, major: true, tone: 'red' };
    }
    case 'timeout':
      return { icon: '⏸', text: `Team time-out, ${team}.`, major: true };
    case 'sub':
      return { icon: '🔁', text: e.playerId || e.playerName ? `Substitution, ${team}: ${e.secondName ?? 'a player'} on for ${e.playerName ?? 'a team-mate'}.` : `${e.secondName ?? 'A player'} comes on for ${team}.` };
    case 'gk':
      return { icon: '🧤', text: `${e.playerName ?? 'A new keeper'} in goal for ${team}.` };
    case 'empty':
      return e.on === false
        ? { icon: '🧤', text: `${team}'s goalkeeper is back in goal.`, major: true }
        : { icon: '🥅', text: `${team} take the goalkeeper off for a 7th court player — their goal is empty.`, major: true };
    case 'drawn':
      return { icon: '🎯', text: `7-metre throw to ${team}, won by ${e.playerName ?? 'a player'}.`, major: true };
    case 'caused':
      return { icon: '🚫', text: `7-metre throw conceded by ${who(e.playerName)}.` };
    case 'passive':
      return { icon: '⏳', text: `Passive-play warning to ${team} (forewarning signal).` };
  }
}

/** The whole match as commentary items (oldest first). */
export function handballFeed(s0: HandballState, names: Names, nameOf: NameOf = legacyNameOf): FeedItem[] {
  const s = withNames(s0, nameOf);
  const ids = new Set(s.events.map((e) => e.id));
  const answerOf = new Map<string, string>();
  for (const e of s.events) if ((e.type === 'save' || e.type === 'block' || e.type === 'steal') && e.ref && e.playerName) answerOf.set(e.ref, e.playerName);
  const isAnswer = (e: HandballEvent) => (e.type === 'save' || e.type === 'block' || e.type === 'steal') && !!e.ref && ids.has(e.ref);
  const empties = emptyGoalIndexes(s);
  const order = s.events.map((e, i) => ({ e, i })).filter(({ e }) => !isAnswer(e)).sort((a, b) => a.e.sec - b.e.sec || a.i - b.i);
  const score: Score = { home: 0, away: 0 };
  const out: FeedItem[] = [];
  order.forEach(({ e, i }, n) => {
    if (e.type === 'goal') score[e.side] += 1;
    const d = handballSentence(e, names, answerOf.get(e.id), empties.has(i));
    const lead = e.type === 'sub' ? { id: e.secondId, name: e.secondName } : e.official ? {} : { id: e.playerId, name: e.playerName };
    out.push({
      id: `b${e.id}`, period: e.period, t: n, stamp: clockText(e.sec), icon: d.icon, text: d.text, side: e.side,
      score: { ...score }, ...(d.major ? { major: true } : {}), ...(d.tone ? { tone: d.tone } : {}),
      ...(lead.id ? { playerId: lead.id } : {}), ...(lead.name ? { playerName: lead.name } : {}),
    });
  });
  if (s.shootout) {
    const so = { home: 0, away: 0 };
    const len = Math.max(s.shootout.home.length, s.shootout.away.length);
    let j = 0;
    for (let i = 0; i < len; i++) {
      // the first five rounds in the toss order; sudden death in the scorer's pick (SD-139)
      const lead: Side = i >= 5 && s.shootout.sdFirst ? s.shootout.sdFirst : s.shootout.first;
      for (const sd of [lead, other(lead)]) {
        const k = s.shootout[sd][i];
        if (!k) continue;
        if (k.scored) so[sd] += 1;
        const by = k.playerName ? `${k.playerName} (${names[sd]})` : names[sd];
        const how = k.scored ? 'scores' : k.outcome === 'saved' ? `is saved${k.keeperName ? ` by ${k.keeperName}` : ''}` : k.outcome === 'missed' ? 'misses' : 'fails to score';
        out.push({
          id: `so${j}`, period: SHOOTOUT_PERIOD, t: 1e6 + j++, stamp: `7m ${i + 1}`, icon: k.scored ? '✅' : '❌', side: sd,
          text: `Throw ${i + 1}: ${by} ${how}.`, score: { ...score }, scoreText: scoreText(so), major: true, ...(k.scored ? { tone: 'goal' as const } : {}),
          ...(k.playerId ? { playerId: k.playerId } : {}), ...(k.playerName ? { playerName: k.playerName } : {}),
        });
      }
    }
    if (s.shootoutWinner) {
      const sc = soScore(s);
      out.push({ id: 'so-end', period: SHOOTOUT_PERIOD, t: 2e6, stamp: '7m', icon: '🏆', side: s.shootoutWinner, text: `${names[s.shootoutWinner]} win on 7-metre throws ${Math.max(sc.home, sc.away)}–${Math.min(sc.home, sc.away)}.`, score: { ...score }, scoreText: scoreText(sc), major: true });
    }
  }
  return out;
}

/** The periods that head the feed (the one in play, even if empty). */
export const handballFeedPeriods = (s: HandballState): number[] => Array.from({ length: Math.max(1, s.period) }, (_, i) => i + 1);

/** Each side's top scorers ("Asha Rao 8/11"), disqualifications, HT score,
 *  the 7-metre shoot-out. */
export function handballFacts(s0: HandballState, top = 3, nameOf: NameOf = legacyNameOf): MatchFacts {
  const s = withNames(s0, nameOf);
  const f = emptyFacts();
  for (const side of ['home', 'away'] as const) {
    // IDs-only scoring: by the scorer's id (two players shown alike stay apart)
    const by = new Map<string, { name: string; goals: number; shots: number; order: number }>();
    s.events.forEach((e, i) => {
      if (e.side !== side || (e.type !== 'goal' && e.type !== 'miss') || !e.playerName) return;
      const k = e.playerId ? `id:${e.playerId}` : e.playerName;
      const r = by.get(k) ?? { name: e.playerName, goals: 0, shots: 0, order: i };
      r.shots += 1;
      if (e.type === 'goal') r.goals += 1;
      by.set(k, r);
    });
    const best = [...by.values()].filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals || a.shots - b.shots || a.order - b.order).slice(0, top);
    f[side].push(...best.map((r) => `🤾 ${r.name} ${r.goals}/${r.shots}`));
    for (const e of s.events) {
      if (e.type === 'card' && e.side === side && !e.official && (e.card === 'red' || e.third)) f[side].push(`🟥 ${e.playerName ?? 'Player'} ${clockText(e.sec)}`);
    }
  }
  if (s.period >= 2) {
    const ht = { home: 0, away: 0 };
    for (const e of s.events) if (e.type === 'goal' && e.period === 1) ht[e.side] += 1;
    f.notes.push(`Half-time ${ht.home}–${ht.away}`);
  }
  if (s.shootout) { const so = soScore(s); f.notes.push(`7-metre throws ${so.home}–${so.away}`); }
  return f;
}
