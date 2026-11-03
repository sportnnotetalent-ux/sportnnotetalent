/**
 * Deep wave — hockey's live COMMENTARY (../invasion/feed.ts) and match facts.
 * PURE: derived from the event log every time, so a removal or an edit
 * re-writes the sentences and every later running score.
 *
 * Sentences follow FIH / broadcast live-text wording: "Goal! India 2–1.
 * Asha Rao converts the penalty corner. Assisted by Meera.", "Penalty corner
 * to Japan — defended.", "Shot on goal by Rani (India), saved by Kim.",
 * "Green card for Lee (Korea) — 2 minutes.", "Shoot-out: Asha Rao (India)
 * scores. 3–2."
 */
import { SHOOTOUT_PERIOD, groupByScorer, emptyFacts, scoreText, type FeedItem, type MatchFacts, type Score } from '../invasion/feed.ts';
import { minuteText, periodLong, PC_RESULT_LABEL, soScore, type HockeyEvent, type HockeyState, type Side } from './engine.ts';
import { hockeyPossession } from './depth.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';
import { ruledOutText } from '../invasion/ruledOut.ts';

type Names = { home: string; away: string };
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The section heading for a period ("1st quarter", "Shoot-out"). */
export const hockeyPeriodLabel = (s: Pick<HockeyState, 'periods'>) => (p: number): string =>
  p === SHOOTOUT_PERIOD ? 'Shoot-out' : cap(periodLong(s, p));

/** One event's sentence (`saver` = the keeper of a save linked to it). */
export function hockeySentence(e: HockeyEvent, names: Names, score: Score, saver?: string): { icon: string; text: string; major?: boolean; tone?: FeedItem['tone'] } {
  const team = names[e.side];
  const who = (n?: string) => (n ? `${n} (${team})` : team);
  switch (e.type) {
    case 'goal': {
      const lead = `Goal! ${names.home} ${score.home}, ${names.away} ${score.away}.`;
      const how = e.goalType === 'pc' ? 'converts the penalty corner' : e.goalType === 'stroke' ? 'scores from the penalty stroke' : 'scores a field goal';
      const body = e.playerName ? `${who(e.playerName)} ${how}.` : `${team} score${e.goalType === 'pc' ? ' from a penalty corner' : e.goalType === 'stroke' ? ' from a penalty stroke' : ''}.`;
      return { icon: '🏑', text: `${lead} ${body}${e.secondName ? ` Assisted by ${e.secondName}.` : ''}`, major: true, tone: 'goal' };
    }
    case 'pc':
      return { icon: '🚩', text: `Penalty corner to ${team}${e.pcResult && e.pcResult !== 'goal' ? ` — ${PC_RESULT_LABEL[e.pcResult]}` : ''}.`, major: true };
    case 'stroke':
      return {
        icon: '⚪', major: true, tone: 'chance',
        text: e.outcome === 'saved'
          ? `Penalty stroke saved${saver ? ` by ${saver}` : ''}! ${e.playerName ? `${who(e.playerName)} is denied.` : `${team} are denied.`}`
          : `Penalty stroke missed${e.playerName ? ` by ${who(e.playerName)}` : ` — ${team}`}.`,
      };
    case 'shot': {
      const by = e.playerName ? who(e.playerName) : team;
      const pc = e.pcRef ? ' from the penalty corner' : '';
      if (e.onGoal) return { icon: '🧤', text: `Shot on goal by ${by}${pc}, saved${saver ? ` by ${saver}` : ''}.` };
      if (e.miss === 'blocked') return { icon: '🛡', text: `${by}'s shot${pc} is blocked.` };
      if (e.miss === 'wide') return { icon: '↗', text: `${by} shoots wide${pc}.` };
      return { icon: '↗', text: `${by}${pc} — shot off target or blocked.` };
    }
    case 'save':
      return { icon: '🧤', text: `Save by ${e.playerName ?? `the ${team} keeper`}.` };
    case 'card': {
      const c = e.card ?? 'green';
      // invasion batch 5: a team official's card (no player, nobody short)
      if (e.official) return { icon: c === 'red' ? '🟥' : c === 'green' ? '🟩' : '🟨', text: `${cap(c)} card to ${e.official} (${team} official).`, major: true, tone: c === 'red' ? 'red' : 'yellow' };
      if (c === 'red') return { icon: '🟥', text: `Red card! ${who(e.playerName)} is sent off — ${team} play a player short.`, major: true, tone: 'red' };
      return { icon: c === 'green' ? '🟩' : '🟨', text: `${cap(c)} card for ${who(e.playerName)}${e.minutes ? ` — ${e.minutes} minutes` : ''}.`, major: true, tone: 'yellow' };
    }
    case 'sub':
      return { icon: '🔁', text: `Substitution, ${team}. ${e.secondName ?? 'A player'} replaces ${e.playerName ?? 'a team-mate'}.`, major: true };
    case 'gk':
      return { icon: '🧤', text: `${e.playerName ?? 'A new keeper'} goes in goal for ${team}.` };
    case 'referral':
      return { icon: '📺', text: `Video referral by ${team} — ${e.upheld ? 'upheld, they keep it' : 'not upheld, referral lost'}.`, major: true };
    case 'ruledout':
      return { icon: '❎', text: ruledOutText('hockey', team, e), major: true };
  }
}

/** The whole match as commentary items (oldest first; Commentary groups them). */
export function hockeyFeed(s0: HockeyState, names: Names, nameOf: NameOf = legacyNameOf): FeedItem[] {
  const s = withNames(s0, nameOf);
  const ids = new Set(s.events.map((e) => e.id));
  const saverOf = new Map<string, string>();
  for (const e of s.events) if (e.type === 'save' && e.ref && e.playerName) saverOf.set(e.ref, e.playerName);
  // match time, then log order (a backfilled goal sits at its own minute)
  const order = s.events.map((e, i) => ({ e, i })).filter(({ e }) => !(e.type === 'save' && e.ref && ids.has(e.ref)))
    .sort((a, b) => a.e.sec - b.e.sec || a.i - b.i);
  const score: Score = { home: 0, away: 0 };
  const out: FeedItem[] = [];
  order.forEach(({ e }, n) => {
    if (e.type === 'goal') score[e.side] += 1;
    const d = hockeySentence(e, names, score, saverOf.get(e.id));
    const lead = e.type === 'sub' ? { id: e.secondId, name: e.secondName } : { id: e.playerId, name: e.playerName };
    out.push({
      id: `h${e.id}`, period: e.period, t: n, stamp: minuteText(e.sec), icon: d.icon, text: d.text, side: e.side,
      score: { ...score }, ...(d.major ? { major: true } : {}), ...(d.tone ? { tone: d.tone } : {}),
      ...(lead.id ? { playerId: lead.id } : {}), ...(lead.name ? { playerName: lead.name } : {}),
    });
  });
  // the shoot-out, attempt by attempt with its own tally
  if (s.shootout) {
    const first = s.shootout.first;
    const kicks: { side: Side; k: NonNullable<HockeyState['shootout']>['home'][number]; n: number }[] = [];
    const len = Math.max(s.shootout.home.length, s.shootout.away.length);
    for (let i = 0; i < len; i++) {
      // FIH: sudden-death rounds start with the scorer's pick (SD-139), else
      // the team that went second
      const lead: Side = i < 5 ? first : s.shootout.sdFirst ?? other(first);
      for (const sd of [lead, other(lead)]) if (i < s.shootout[sd].length) kicks.push({ side: sd, k: s.shootout[sd][i], n: i + 1 });
    }
    const so = { home: 0, away: 0 };
    kicks.forEach(({ side, k, n }, j) => {
      if (k.scored) so[side] += 1;
      const by = k.playerName ? `${k.playerName} (${names[side]})` : names[side];
      const how = k.scored ? 'scores' : k.outcome === 'saved' ? `is saved${k.keeperName ? ` by ${k.keeperName}` : ''}` : k.outcome === 'missed' ? 'misses' : 'fails to score';
      out.push({
        id: `so${j}`, period: SHOOTOUT_PERIOD, t: 1e6 + j, stamp: `SO ${n}`, icon: k.scored ? '✅' : '❌', side,
        text: `Attempt ${n}: ${by} ${how}.`, score: { ...score }, scoreText: scoreText(so), major: true, ...(k.scored ? { tone: 'goal' as const } : {}),
        ...(k.playerId ? { playerId: k.playerId } : {}), ...(k.playerName ? { playerName: k.playerName } : {}),
      });
    });
    if (s.shootoutWinner) {
      const sc = soScore(s);
      out.push({ id: 'so-end', period: SHOOTOUT_PERIOD, t: 2e6, stamp: 'SO', icon: '🏆', side: s.shootoutWinner, text: `${names[s.shootoutWinner]} win the shoot-out ${Math.max(sc.home, sc.away)}–${Math.min(sc.home, sc.away)}.`, score: { ...score }, scoreText: scoreText(sc), major: true });
    }
  }
  return out;
}

/** The periods that should head the feed (the one in play, even if empty). */
export const hockeyFeedPeriods = (s: HockeyState): number[] => Array.from({ length: Math.min(s.periods, s.period) }, (_, i) => i + 1);

/** Scorers with minutes ("Asha Rao 12', 45' (PC)"), sendings-off, notes. */
export function hockeyFacts(s0: HockeyState, now = 0, nameOf: NameOf = legacyNameOf): MatchFacts {
  const s = withNames(s0, nameOf);
  const f = emptyFacts();
  const goals = s.events.filter((e) => e.type === 'goal').sort((a, b) => a.sec - b.sec)
    .map((e) => ({ side: e.side, who: e.playerName ?? 'Team goal', key: e.playerId, stamp: minuteText(e.sec), tag: e.goalType === 'pc' ? 'PC' : e.goalType === 'stroke' ? 'PS' : undefined }));
  const by = groupByScorer(goals);
  f.home.push(...by.home.map((l) => `🏑 ${l}`));
  f.away.push(...by.away.map((l) => `🏑 ${l}`));
  for (const e of s.events) if (e.type === 'card' && e.card === 'red' && !e.official) f[e.side].push(`🟥 ${e.playerName ?? 'Player'} ${minuteText(e.sec)}`);
  if (s.shootout) { const so = soScore(s); f.notes.push(`Shoot-out ${so.home}–${so.away}`); }
  const poss = hockeyPossession(s, 'all', now);
  if (poss) f.notes.push(`Possession ${poss.home}% – ${poss.away}%`);
  return f;
}
