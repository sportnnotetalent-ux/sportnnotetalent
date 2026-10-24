/**
 * Deep wave — basketball's live play-by-play commentary (ESPN / NBA.com /
 * FIBA LiveStats style), DERIVED from the event log. PURE.
 *
 * Grouped by period (Q1 … OT), newest first. Each row: the game clock (time
 * left, where the play carries the clock second; else its minute), the
 * running score after it, and a sentence from what was captured — "Arjun
 * makes a corner 3 (assist: Ben)", "Shooting foul on Xavi (drawn by Arjun) ·
 * team foul 5", "Chen makes free throw 2 of 2". An assist logged right after
 * the basket it set up reads on that basket's row. Lead changes and ties are
 * tagged. Corrections re-derive it, so it always matches the score.
 *
 * IDs-only scoring: plays name their players by id; the sentences put in the
 * viewer's names (`nameOf` — players_view: the circle full names, everyone
 * else initials, a dispute "X"; an older log's stored name is the fallback).
 */
import type { FeedGroup, FeedRow } from '../feedModel.ts';
import { leadTracker } from '../feedModel.ts';
import { eventClock, periodLabel, teamFoulsThisQuarter, type BasketballState } from './engine.ts';
import { BB_META, DQ_LABEL, FOUL_LABEL, pointsOf, type BBEvent, type ShotZone } from './events.ts';
import { isFieldGoal } from './credits.ts';
import { gameOrder, possessionTags } from './deep.ts';
import { drawnByOf, hasPlayer, legacyNameOf, onId, onPlayerOf, playId, playerOf, samePlayer, type NameOf } from './names.ts';

type Side = 'home' | 'away';

/** "a corner 3", "a mid-range 2-pointer", "a 1-pointer in the paint". */
export function shotPhrase(points: number, zone: ShotZone | undefined, halfCourt: boolean): string {
  if (halfCourt) {
    if (points === 2) return zone === 'c3' ? 'a 2-pointer from the corner' : zone === 'ab3' ? 'a 2-pointer from beyond the arc' : 'a 2-pointer';
    return zone === 'paint' ? 'a 1-pointer in the paint' : zone === 'mid' ? 'a mid-range 1-pointer' : 'a 1-pointer';
  }
  if (points === 3) return zone === 'c3' ? 'a corner 3' : zone === 'ab3' ? 'a 3-pointer above the break' : 'a 3-pointer';
  if (points === 2) return zone === 'paint' ? 'a 2-pointer in the paint' : zone === 'mid' ? 'a mid-range 2-pointer' : 'a 2-pointer';
  return 'a 1-point basket';
}

const FOUL_WORD: Record<string, string> = {
  personal: 'Personal', shooting: 'Shooting', technical: 'Technical', flagrant: 'Flagrant', offensive: 'Offensive',
  unsportsmanlike: 'Unsportsmanlike', disqualifying: 'Disqualifying',
};

/** The sentence for one play (`assist` = a passer merged into a make;
 *  `ft` = this free throw's number in the trip). Players by id through
 *  `nameOf` (default: an older log's stored names, as before). */
export function describePlay(
  s: BasketballState, e: BBEvent, team: string,
  ctx: { assist?: string; ft?: { k: number; n: number }; teamFoul?: number; second?: boolean; offTo?: boolean } = {},
  nameOf: NameOf = legacyNameOf,
): string {
  const halfCourt = s.targetPoints > 0;
  const named = hasPlayer(e);
  const who = playerOf(s, e, nameOf) ?? team;
  switch (e.type) {
    case 'score': {
      const p = e.points ?? 0;
      if (!isFieldGoal(p, halfCourt)) return `${who} ${named ? 'makes' : 'make'} a free throw`;
      const how = [ctx.second ? 'second chance' : '', ctx.offTo ? 'off a turnover' : ''].filter(Boolean);
      return `${who} ${named ? 'makes' : 'score'} ${shotPhrase(p, e.zone, halfCourt)}${e.fb ? ' on the fast break' : ''}`
        + `${ctx.assist ? ` (assist: ${ctx.assist})` : ''}${how.length ? ` · ${how.join(', ')}` : ''}`;
    }
    case 'miss': return `${who} ${named ? 'misses' : 'miss'} ${shotPhrase(e.points ?? 2, e.zone, halfCourt)}`;
    case 'freethrow': {
      const of = ctx.ft && ctx.ft.n > 1 ? ` ${ctx.ft.k} of ${ctx.ft.n}` : '';
      return `${who} ${e.made ? (named ? 'makes' : 'make') : (named ? 'misses' : 'miss')} free throw${of}`;
    }
    case 'rebound':
      return e.reboundType === 'off' ? `Offensive rebound — ${who}` : e.reboundType === 'def' ? `Defensive rebound — ${who}` : `Rebound — ${who}`;
    case 'assist': return `Assist — ${who}`;
    case 'steal': return `${who} ${named ? 'steals' : 'steal'} the ball`;
    case 'block': return `${who} ${named ? 'blocks' : 'block'} the shot`;
    case 'turnover': return `Turnover — ${who}`;
    case 'foul': {
      const kind = FOUL_WORD[e.foulType ?? 'personal'] ?? FOUL_LABEL[e.foulType ?? 'personal'];
      const by = drawnByOf(s, e, nameOf);
      const drawn = by ? ` (drawn by ${by})` : '';
      const tf = ctx.teamFoul ? ` · team foul ${ctx.teamFoul}${s.foulsForBonus > 0 && ctx.teamFoul > s.foulsForBonus ? ', free throws' : ''}` : '';
      return `${kind} foul on ${who}${drawn}${tf}`;
    }
    case 'timeout': return `Timeout — ${team}`;
    case 'sub': return `${onPlayerOf(s, e, nameOf) ?? '?'} checks in for ${playerOf(s, e, nameOf) ?? '?'}`;
    case 'eject': return e.reason ? `${who} is disqualified (${DQ_LABEL[e.reason]})` : `${who} is ejected`;
    default: return BB_META[(e as BBEvent).type]?.label ?? 'Play';
  }
}

/** The player a feed row links to: the sub coming on, else the credited
 *  player — by id where the log has one (an older name-only play keeps its
 *  stored name, which the feed may still match to a squad). */
function rowPlayer(s: BasketballState, e: BBEvent, nameOf: NameOf): Pick<FeedRow, 'playerName' | 'playerId'> {
  if (e.type === 'sub') {
    const name = onPlayerOf(s, e, nameOf);
    const id = onId(s, e);
    return name ? { playerName: name, ...(id ? { playerId: id } : {}) } : {};
  }
  const name = playerOf(s, e, nameOf);
  const id = playId(s, e);
  return name ? { playerName: name, ...(id ? { playerId: id } : {}) } : {};
}

/** The basketball play-by-play: period groups, newest first. Each row's
 *  player is resolved here (`playerId` + the viewer's name), so the feed
 *  never looks a player up by name. */
export function basketballFeed(s: BasketballState, names: { home: string; away: string }, nameOf: NameOf = legacyNameOf): FeedGroup[] {
  const ev = gameOrder(s.events);
  const tags = possessionTags(s);
  const lead = leadTracker(names);
  const groups = new Map<number, FeedGroup>();
  const merged = new Set<number>();
  let h = 0, a = 0;
  // free-throw trips: consecutive free throws by the same side and shooter
  const trip = new Map<number, { k: number; n: number }>();
  for (let i = 0; i < ev.length;) {
    const e = ev[i];
    if (e.type !== 'freethrow') { i++; continue; }
    let j = i;
    while (j + 1 < ev.length && ev[j + 1].type === 'freethrow' && ev[j + 1].side === e.side && samePlayer(ev[j + 1], e) && ev[j + 1].quarter === e.quarter) j++;
    for (let k = i; k <= j; k++) trip.set(ev[k].id, { k: k - i + 1, n: j - i + 1 });
    i = j + 1;
  }
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (merged.has(e.id)) continue;
    let assist: string | undefined;
    if (e.type === 'score' && isFieldGoal(e.points ?? 0, s.targetPoints > 0)) {
      const next = ev[i + 1];
      if (next && next.type === 'assist' && next.side === e.side && next.quarter === e.quarter && !samePlayer(next, e)) {
        assist = playerOf(s, next, nameOf) ?? names[e.side];
        merged.add(next.id);
      }
    }
    const pts = pointsOf(e);
    if (pts > 0) { if (e.side === 'home') h += pts; else a += pts; }
    const teamFoul = e.type === 'foul' && (e.foulType !== 'technical' || s.techIsTeamFoul === true)
      ? teamFoulsThisQuarter({ ...s, quarter: e.quarter, events: ev.slice(0, i + 1) }, e.side) : undefined;
    const tag = tags.get(e.id);
    const row: FeedRow = {
      id: String(e.id),
      ...(typeof e.sec === 'number' ? { clock: eventClock(s, e) } : { clock: `${e.minute}'` }),
      side: e.side,
      icon: BB_META[e.type]?.icon ?? '•',
      text: describePlay(s, e, names[e.side as Side], { assist, ft: trip.get(e.id), teamFoul, second: tag?.second, offTo: tag?.offTo }, nameOf),
      score: { home: h, away: a },
      ...(pts > 0 ? { scoring: true } : {}),
      ...rowPlayer(s, e, nameOf),
    };
    const note = pts > 0 ? lead(h, a) : e.type === 'eject' ? 'Disqualified' : undefined;
    if (note) row.tag = note;
    const g = groups.get(e.quarter) ?? groups.set(e.quarter, {
      key: String(e.quarter), title: periodLabel(e.quarter, s.regPeriods), score: { home: 0, away: 0 }, rows: [],
    }).get(e.quarter)!;
    g.rows.push(row);
    g.score = { home: h, away: a };
  }
  const out = [...groups.entries()].sort((x, y) => y[0] - x[0]).map(([q, g]) => ({
    ...g, rows: [...g.rows].reverse(), ...(!s.ended && q === s.quarter ? { live: true } : {}),
  }));
  return out;
}
