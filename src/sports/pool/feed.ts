/**
 * Pool — the rack-by-rack commentary (gcc/CommentaryFeed): newest rack
 * first, each shot a plain sentence, newest first, the rack's result and the
 * running score on the shot that ended it. PURE: from the state's feed and
 * rack list (both replay from the event log), so Undo or a correction
 * re-derives it. Racks older than the feed keeps (match.ts FEED_RACKS) show
 * one summary line from the rack list.
 *
 * Names: `names` are the sides' labels for this viewer (a singles player's
 * own name); a scotch-doubles shooter is named by id (`nameOf`).
 */
import type { FeedGroup, FeedItem } from '../gcc/model.ts';
import { whoName, type NameOf } from '../racketNames.ts';
import { cnt, type RackRecord } from './engine.ts';
import { isSide, MONEY, other, type Side } from './balls.ts';
import { feedOf, rackTimes, type FeedEntry, type PoolMatch } from './match.ts';
import { FOUL_SHORT } from './controls.ts';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** "the 3", "the 3 and 11", "the 3, 4 and 5" */
export function ballsText(b: readonly number[]): string {
  if (!b.length) return 'nothing';
  if (b.length === 1) return `the ${b[0]}`;
  return `the ${b.slice(0, -1).join(', ')} and ${b[b.length - 1]}`;
}

/** The rack list, read defensively. */
function racksOf(s: unknown): RackRecord[] {
  return (isObj(s) && Array.isArray(s.racks) ? s.racks : []).filter((r): r is RackRecord => isObj(r) && isSide(r.winner));
}

/** A rack's result words: "break-and-run", "three fouls in a row by Ravi"… ('' for a plain win). */
export function rackTag(r: RackRecord, name: (s: Side) => string): string {
  const L = name(other(r.winner));
  if (r.golden) return 'golden break';
  if (r.bnr) return 'break-and-run';
  if (r.runOut) return 'run-out';
  switch (r.how) {
    case 'threeFoul': return `three fouls in a row by ${L}`;
    case 'eightFoul': return `${L} pocketed the 8 on a foul`;
    case 'eightEarly': return `${L} pocketed the 8 too early`;
    case 'eightPocket': return `${L} pocketed the 8 in the wrong pocket`;
    case 'eightOff': return `${L} knocked the 8 off the table`;
    case 'awarded': return 'awarded';
    case 'quick': return 'result only';
    default: return '';
  }
}

/** The score after each completed rack (index = rack list index). */
function scoresAfter(s: PoolMatch, name: (s: Side) => string): string[] {
  const racks = racksOf(s);
  const race = cnt(s.raceTo) || 1;
  const setsMode = cnt(s.setsToWin) > 1;
  const out: string[] = [];
  let cur = { home: 0, away: 0 };
  const won = { home: 0, away: 0 };
  racks.forEach((r, i) => {
    cur = { ...cur, [r.winner]: cur[r.winner] + 1 };
    const hi = Math.max(cur.home, cur.away), lo = Math.min(cur.home, cur.away);
    if (cur[r.winner] >= race) {
      won[r.winner] += 1;
      const over = s.ended === true && i === racks.length - 1;
      out.push(over
        ? `${name(r.winner)} wins the match ${setsMode ? `${Math.max(won.home, won.away)}–${Math.min(won.home, won.away)} in sets` : `${hi}–${lo}`}`
        : `${name(r.winner)} wins set ${won.home + won.away} ${hi}–${lo} · sets ${won.home}–${won.away}`);
      cur = { home: 0, away: 0 };
    } else out.push(cur.home === cur.away ? `Level ${hi}–${lo}` : `${name(cur.home > cur.away ? 'home' : 'away')} leads ${hi}–${lo}`);
  });
  return out;
}

export function poolFeed(s: PoolMatch, names: { home: string; away: string }, nameOf?: NameOf): FeedGroup[] {
  if (!isObj(s)) return [];
  const name = (sd: Side) => (sd === 'home' ? names.home : names.away);
  const who = (e: FeedEntry) => (e.p && nameOf ? whoName(nameOf, e.p) : undefined) ?? (e.s ? name(e.s) : '');
  const racks = racksOf(s);
  const scores = scoresAfter(s, name);
  const times = rackTimes(s);
  const feed = feedOf(s);
  const money = MONEY[s.game] ?? 8;
  const inPlay = isObj(s.rack) ? cnt(s.rack.n) : 0;
  const ns = new Set<number>([...racks.map((r) => cnt(r.n)), ...feed.map((e) => e.n), ...(inPlay ? [inPlay] : [])]);
  const groups: FeedGroup[] = [];
  for (const n of [...ns].filter(Boolean).sort((a, b) => b - a)) {
    const ri = racks.findIndex((r) => cnt(r.n) === n);
    const rec = ri >= 0 ? racks[ri] : null;
    const lines = feed.filter((e) => e.n === n);
    const items: FeedItem[] = [];
    lines.forEach((e, i) => {
      const P = who(e);
      let text = sentence(e, P, name, money);
      let big = false;
      let score: string | undefined;
      let icon: string | undefined;
      if (e.end && rec) {
        const tag = rackTag(rec, name);
        text = `${text} — ${name(rec.winner)} wins rack ${n}${tag ? ` (${tag})` : ''}`;
        big = !!(rec.golden || rec.bnr || rec.runOut);
        icon = rec.golden ? '✨' : rec.bnr || rec.runOut ? '🎱' : undefined;
        score = scores[ri];
      }
      items.push({ id: `${n}-${i}`, text, ...(e.s ? { side: e.s } : {}), ...(big ? { big } : {}), ...(icon ? { icon } : {}), ...(score ? { score } : {}), ...(e.at ? { at: e.at } : {}) });
    });
    if (!lines.length && rec) {
      const tag = rackTag(rec, name);
      const inn = rec.innings ? `innings ${cnt(rec.innings.home)}–${cnt(rec.innings.away)}` : '';
      items.push({
        id: `${n}-r`, text: `Rack ${n} to ${name(rec.winner)}${tag ? ` (${tag})` : ''}`, side: rec.winner, score: scores[ri],
        ...([rec.breaker && isSide(rec.breaker) ? `${name(rec.breaker)} broke` : '', inn].filter(Boolean).length ? { sub: [rec.breaker && isSide(rec.breaker) ? `${name(rec.breaker)} broke` : '', inn].filter(Boolean).join(' · ') } : {}),
        ...(times[ri] ? { at: times[ri] } : {}),
      });
    }
    if (!items.length) continue;
    const tag = rec ? rackTag(rec, name) : '';
    const cur = isObj(s.current) ? { home: cnt(s.current.home), away: cnt(s.current.away) } : { home: 0, away: 0 };
    groups.push({
      key: `r${n}`,
      title: `Rack ${n}`,
      subtitle: rec ? `${name(rec.winner)} won${tag ? ` · ${tag}` : ''}` : `in play · ${names.home} ${cur.home}–${cur.away} ${names.away}`,
      items: items.reverse(),
    });
  }
  return groups;
}

/** One feed line as a sentence (before the rack result is added). */
function sentence(e: FeedEntry, P: string, name: (s: Side) => string, money: number): string {
  const opp = e.s ? name(other(e.s)) : '';
  const next = e.nx && e.nx !== e.s ? ` · ${name(e.nx)} to shoot${e.bih ? ' with ball in hand' : ''}` : '';
  const choice = e.pd === 'push' || e.pd === 'wrongPot' ? ` · ${opp} chooses` : '';
  switch (e.t) {
    case 'LAG': return `${P} breaks first`;
    case 'BREAK': {
      if (e.k) return `${P} breaks: foul (${FOUL_SHORT[e.k]})${e.b?.length ? `, ${ballsText(e.b)} went in` : ''}${next}`;
      if (e.pd === 'illegalBreak') return `${P} breaks: illegal break (nothing in, fewer than four balls to a rail) · ${opp} chooses`;
      if (e.pd === 'threeBall') return `${P} breaks short (three-ball rule) · ${opp} chooses`;
      if (e.pd === 'eightBreak') return `${P} pockets the 8 on the break · ${P} chooses`;
      if (e.pd === 'eightFoul') return `${P} pockets the 8 on a break foul · ${opp} chooses`;
      const what = e.b?.length ? `${P} breaks and pockets ${ballsText(e.b)}` : `${P} breaks: nothing in`;
      return `${what}${e.nx === e.s && !e.end ? ' · stays at the table' : next}`;
    }
    case 'POT': {
      const group = e.g ? ` · ${e.g === e.s ? 'takes the solids' : 'takes the stripes'}` : '';
      const ten = (e.b ?? []).includes(money) && !e.end && money === 10 ? ' (the 10 is spotted)' : '';
      return `${P} pockets ${ballsText(e.b ?? [])}${ten}${group}${choice || next}`;
    }
    case 'MISS': return `${P} misses${next}`;
    case 'SAFETY': return `${P} plays a safety${e.b?.length ? ` (${ballsText(e.b)} went in)` : ''}${choice || next}`;
    case 'FOUL': {
      const fell = e.b?.length ? `, ${ballsText(e.b)} went in` : '';
      const off = e.o?.length ? `, ${ballsText(e.o)} off the table` : '';
      return `Foul by ${P}: ${e.k ? FOUL_SHORT[e.k] : 'other'}${fell}${off}${next}`;
    }
    case 'PUSH': return e.k ? `${P} pushes out: foul (${FOUL_SHORT[e.k]})${next}` : `${P} pushes out${choice}`;
    case 'CHOOSE': return e.c === 'play' ? `${P} plays from here` : e.c === 'pass' ? `${P} hands it back` : `${P} chooses a re-rack`;
    case 'RACK': return e.end ? 'Rack result recorded' : `Rack ${e.n}`;
    case 'STALEMATE': return `Stalemate: re-rack${P ? `, ${P} breaks again` : ''}`;
    default: return e.t;
  }
}
