/**
 * Deep wave — American football's live commentary (the broadcast
 * play-by-play). PURE, derived from the event log only (game order — a
 * backfilled moment sits at its own time), so a correction or an undo
 * re-derives it.
 *
 *  - Play by play: grouped by DRIVE ("Q2 · Lions drive", under it "Own 25 ·
 *    8 plays, 75 yds, 4:12 · Touchdown"); the kickoff opens the receiving
 *    team's drive, the try closes the touchdown drive, a return touchdown sits
 *    with the turnover / punt it came from (a kickoff return: its own group).
 *  - Scores only: grouped by quarter / half (and each overtime period).
 *  - Each line: the game clock (time left), "1st & 10 at Own 25 — Rao pass
 *    complete to Khan for 12 yds (1st down)", the running score after every
 *    score; tackles / flag pulls and pass breakups join their play's line;
 *    penalties ("Penalty on Lions — Holding (offence), 10 yds"), timeouts
 *    (with the number left), the two-minute warning, the end of each quarter /
 *    half-time / regulation / overtime and the final.
 *  - Newest first; tags for the chips: key moments, scoring, turnovers,
 *    penalties, passing, rushing.
 */
import {
  clockAt, downText, isOT, otTimeouts, periodLen, periodLong, periodName, playedOffset, pointsOf, spotText, touchback,
  type AFEvent, type AFState, type Side,
} from './engine.ts';
import { afDrives, downsSpot, driveLine, gameOrder, halfKey, resultText, type AFDrive } from './drives.ts';
import { groupLines, newestFirst, scoreText, type FeedGroup, type FeedLine } from '../feedGroups.ts';

export interface Names { home: string; away: string }

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const yds = (n: number) => `${n} yd${Math.abs(n) === 1 ? '' : 's'}`;
const gain = (y: number) => (y > 0 ? `for ${yds(y)}` : y === 0 ? 'for no gain' : `for a loss of ${yds(-y)}`);
const dot = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
const HOW_RET: Record<string, string> = { int: 'interception return', fumble: 'fumble return', punt: 'punt return', kick: 'kickoff return' };

/** "1st & 10 at Own 25" — the situation before a snap ('' when unknown). */
export function situationText(s: AFState, e: AFEvent): string {
  if (!e.pre) return '';
  return downText(s, { off: e.off ?? e.side, down: e.pre.down, spot: e.pre.spot, line: e.pre.spot + e.pre.toGo }, true);
}

export interface Sentence { icon: string; text: string; key?: boolean; tags: string[]; side?: Side }

/** One event as a sentence (no running score — the feed adds it). `extra`:
 *  the drive ended on this play by downs (a failed last down) / the timeouts
 *  left after a timeout. Tackles and breakups return null (they join their play). */
export function sentence(s: AFState, e: AFEvent, names: Names, extra: { downs?: boolean; left?: number } = {}): Sentence | null {
  const team = names[e.side];
  const opp = names[other(e.side)];
  const flag = s.variant === 'flag';
  const sit = situationText(s, e);
  const pre = sit ? `${sit} — ` : '';
  const ballAt = (sd: Side, spot?: number) => (spot != null ? ` — ${names[sd]} ball at ${spotText(s, spot)}` : '');
  switch (e.type) {
    case 'td': {
      const y = e.yards;
      const len = y != null ? `${y}-yd ` : '';
      const who = e.playerName;
      const desc = e.how === 'pass' ? `${len}pass${e.secondName ? ` from ${e.secondName}` : ''}`
        : e.how === 'run' ? `${len}run` : e.how && HOW_RET[e.how] ? `${len}${HOW_RET[e.how]}` : '';
      const what = who && desc ? `${who} ${desc}` : who ?? (desc ? cap(desc) : '');
      // the down & distance only for a touchdown from scrimmage (not a return)
      const scrim = (e.how === 'run' || e.how === 'pass' || e.how === 'other') && (e.off ?? e.side) === e.side;
      return {
        icon: '🏈', text: `${scrim ? pre : ''}TOUCHDOWN ${team}!${what ? ` ${dot(what)}` : ''}`, key: true,
        tags: ['score', ...(e.how === 'pass' ? ['pass'] : e.how === 'run' ? ['rush'] : [])],
      };
    }
    case 'try': {
      if (e.none) return { icon: '–', text: 'No try.', tags: [] };
      const who = e.playerName;
      const ot = isOT(s, e.period);
      if (e.kind === 'kick') {
        return { icon: e.good ? '✅' : '✗', text: `Extra point${who ? ` by ${who}` : ''} is ${e.good ? 'good' : 'no good'}.`, tags: e.good ? ['score'] : [], ...(ot ? { key: true } : {}) };
      }
      const what = e.kind === 'two' ? '2-point conversion' : '1-point conversion';
      return {
        icon: e.good ? '✅' : '✗', text: e.good ? `${what} good${who ? ` — ${who}` : ''}.` : `${what} fails.`,
        tags: e.good ? ['score'] : [], ...(ot ? { key: true } : {}),
      };
    }
    case 'defTry':
      return { icon: '↩', text: `${team} return the try for 2 points${e.playerName ? ` — ${e.playerName}` : ''}.`, key: true, tags: ['score', 'turnover'] };
    case 'fg': {
      const len = e.yards ? `${e.yards}-yd ` : '';
      const what = e.playerName ? `${e.playerName} ${len}field goal` : cap(`${len}field goal`);
      return { icon: e.good ? '🥅' : '✗', text: `${pre}${what} is ${e.good ? 'good' : 'no good'}.`, key: true, tags: e.good ? ['score'] : [] };
    }
    case 'safety':
      return { icon: '🛡️', text: `${pre}Safety! ${team} score 2${e.playerName ? ` (${e.playerName})` : ''}.`, key: true, tags: ['score'] };
    case 'timeout':
      return { icon: '⏸', text: `Timeout, ${team}${extra.left != null ? ` (${extra.left} left)` : ''}.`, tags: [] };
    case 'eject':
      return { icon: '🚫', text: `${e.playerName ?? 'A player'} (${team}) is ejected.`, key: true, tags: [] };
    case 'possEnd':
      return { icon: '⛔', text: `${team} possession over — no score.`, key: true, tags: [] };
    case 'tackle':
    case 'pd':
      return null;
    case 'play': {
      const y = Math.round(Number(e.yards) || 0);
      const first = e.first ? ' (1st down)' : '';
      const downs = extra.downs ? ' Turnover on downs.' : '';
      const p1 = e.playerName;
      const p2 = e.secondName;
      switch (e.play) {
        case 'run':
          return { icon: '🏃', text: `${pre}${p1 ? `${p1} runs` : 'Run'} ${gain(y)}${first}.${downs}`, tags: ['rush', ...(downs ? ['turnover'] : [])], ...(downs ? { key: true } : {}) };
        case 'kneel':
          return { icon: '🧎', text: `${pre}${p1 ? `${p1} kneels` : 'Kneel-down'}${y ? ` ${gain(y)}` : ''}${first}.${downs}`, tags: ['rush'] };
        case 'pass':
          return { icon: '🎯', text: `${pre}${p1 ? `${p1} pass` : 'Pass'} complete${p2 ? ` to ${p2}` : ''} ${gain(y)}${first}.${downs}`, tags: ['pass', ...(downs ? ['turnover'] : [])], ...(downs ? { key: true } : {}) };
        case 'inc':
          return { icon: '✗', text: `${pre}${p1 ? `${p1} pass` : 'Pass'} incomplete${e.tgt && p2 ? ` intended for ${p2}` : ''}.${downs}`, tags: ['pass', ...(downs ? ['turnover'] : [])], ...(downs ? { key: true } : {}) };
        case 'sack': {
          const loss = y < 0 ? `for a loss of ${yds(-y)}` : 'for no gain';
          const text = flag
            ? `${pre}Sack${p1 ? ` of ${p1}` : ''} — flag pulled behind the line${p2 ? ` by ${p2}` : ''} ${loss}.${downs}`
            : `${pre}${p1 ? `${p1} sacked` : 'Sacked'}${p2 ? ` by ${p2}` : ''} ${loss}.${downs}`;
          return { icon: '💥', text, tags: ['pass', ...(downs ? ['turnover'] : [])], ...(downs ? { key: true } : {}) };
        }
        case 'int':
          return { icon: '🔄', text: `${pre}${p1 ? `${p1} pass` : 'Pass'} intercepted${p2 ? ` by ${p2}` : ''}${ballAt(other(e.side), e.newSpot)}.`, key: true, tags: ['turnover', 'pass'] };
        case 'fumble':
          return { icon: '🔄', text: `${pre}${p1 ? `${p1} fumbles` : 'Fumble'}${p2 ? ` — recovered by ${p2}` : ''}${ballAt(other(e.side), e.newSpot)}.`, key: true, tags: ['turnover'] };
        case 'punt': {
          const g = Math.abs(y);
          const land = (e.pre?.spot ?? 0) + g;
          const tb = e.ret == null && (e.newSpot === 20 || (!!e.pre && land >= s.field));
          const ret = typeof e.ret === 'number' ? (e.ret > 0 ? `, returned ${yds(e.ret)}` : ', no return') : tb ? ', touchback' : '';
          const spot = e.newSpot ?? (e.pre ? (land >= s.field ? 20 : s.field - land + (e.ret ?? 0)) : undefined);
          return { icon: '🦶', text: `${pre}${p1 ? `${p1} punts` : 'Punt'} ${yds(g)}${ret}${ballAt(other(e.side), spot)}.`, tags: [] };
        }
        case 'kickoff': {
          const tb = e.newSpot === touchback(s);
          return { icon: '🦶', text: `Kickoff — ${team} ball at ${e.newSpot != null ? spotText(s, e.newSpot) : 'their own end'}${tb ? ' (touchback)' : ''}.`, tags: [] };
        }
        case 'penalty': {
          const on = e.on ?? e.side;
          const extraTxt = [e.first ? '1st down' : '', e.lossOfDown ? 'loss of down' : ''].filter(Boolean).join(', ');
          return {
            icon: '🚩', side: on, tags: ['penalty'],
            text: `${pre}Penalty on ${names[on]} — ${e.foul ?? 'foul'}, ${yds(Math.abs(y))}${extraTxt ? ` (${extraTxt})` : ''}.${downs}`,
          };
        }
        case 'downs': {
          const sp = downsSpot(s, e);
          return { icon: '⛔', text: `${pre}Turnover on downs${sp != null ? ` — ${opp} take over at ${spotText(s, sp)}` : ''}.`, key: true, tags: ['turnover'] };
        }
        default:
          return { icon: '▸', text: `${pre}Play.`, tags: [] };
      }
    }
  }
}

/** A tackle / flag pull / pass breakup joined to its play's line. */
export function addOnText(s: AFState, e: AFEvent): string {
  const who = e.playerName;
  if (e.type === 'pd') return who ? ` Broken up by ${who}.` : ' Broken up.';
  if (!who) return '';
  if (e.tfl) return s.variant === 'flag' ? ` Flag pulled for a loss by ${who}.` : ` Tackle for loss by ${who}.`;
  return s.variant === 'flag' ? ` Flag pulled by ${who}.` : ` Tackle by ${who}.`;
}

/** The line at the end of a completed period. */
function periodEndText(s: AFState, p: number, names: Names, h: number, a: number): { text: string; final: boolean } {
  const sc = `${names.home} ${scoreText(h, a)} ${names.away}`;
  const final = s.ended && p === s.period;
  if (final) return { text: `Final${s.plan.includes('ot') ? ' (OT)' : ''} — ${sc}${h === a ? ' (tie)' : ''}.`, final };
  if (isOT(s, p)) return { text: `End of ${periodLong(s, p).toLowerCase()} — still level at ${scoreText(h, a)}.`, final };
  if (p === s.periods) return { text: `End of regulation — level at ${scoreText(h, a)}. Overtime next.`, final };
  if ((s.periods === 4 && p === 2) || (s.periods !== 4 && p === 1)) return { text: `Half-time — ${sc}.`, final };
  return { text: `End of the ${periodLong(s, p).toLowerCase()} — ${sc}.`, final };
}

type Item = { period: number; sec: number; ord: number; e?: AFEvent; line?: FeedLine; hk: string };
type Entry = { gk: string; period: number; idx: number; line: FeedLine; drive?: AFDrive; ret?: AFEvent };

/** The commentary feed, newest first. */
export function afCommentary(s: AFState, names: Names): FeedGroup[] {
  const { drives, driveOf } = afDrives(s);
  const items: Item[] = gameOrder(s).map(({ e, i }) => ({ period: e.period, sec: e.sec, ord: i, e, hk: halfKey(s, e.period) }));
  // the two-minute warnings and the period ends (completed periods)
  for (const p of s.warned) {
    const len = periodLen(s, p);
    if (!len) continue;
    items.push({ period: p, sec: playedOffset(s, p) + len - 120, ord: -1, hk: halfKey(s, p), line: { id: `twomin${p}`, when: '2:00', icon: '⏱', text: 'Two-minute warning.', tags: [] } });
  }
  const last = s.ended ? s.period : s.period - 1;
  for (let p = 1; p <= last; p++) {
    const upto = s.events.filter((e) => e.period <= p);
    const h = upto.filter((e) => e.side === 'home').reduce((x, e) => x + pointsOf(e), 0);
    const a = upto.filter((e) => e.side === 'away').reduce((x, e) => x + pointsOf(e), 0);
    const t = periodEndText(s, p, names, h, a);
    items.push({ period: p, sec: Infinity, ord: Infinity, hk: halfKey(s, p), line: { id: `end${p}`, icon: t.final ? '🏁' : '⏲', text: t.text, key: true, score: scoreText(h, a), tags: [] } });
  }
  items.sort((x, y) => x.period - y.period || x.sec - y.sec || x.ord - y.ord);

  const score = { home: 0, away: 0 };
  const used = new Map<string, number>();
  const entries: Entry[] = [];
  let prev: Entry | undefined;
  let lastPlay: FeedLine | undefined;
  for (const it of items) {
    let gk: string;
    let line: FeedLine;
    let drive: AFDrive | undefined;
    let ret: AFEvent | undefined;
    const e = it.e;
    if (e) {
      // a tackle / flag pull / breakup joins the play before it
      if (e.type === 'tackle' || e.type === 'pd') {
        const add = addOnText(s, e);
        if (lastPlay && add) { lastPlay.text += add; continue; }
        if (!add) continue;
      }
      let left: number | undefined;
      if (e.type === 'timeout') {
        const k = `${e.side}|${it.hk}`;
        used.set(k, (used.get(k) ?? 0) + 1);
        left = Math.max(0, (isOT(s, e.period) ? otTimeouts(s) : s.timeoutsPerHalf) - used.get(k)!);
      }
      const di = driveOf.get(e.id);
      drive = di != null ? drives[di] : undefined;
      const downs = !!drive && drive.result === 'downs' && drive.lastId === e.id && e.type === 'play' && e.play !== 'downs';
      const d: Sentence | null = e.type === 'tackle' || e.type === 'pd'
        ? { icon: '🤚', text: addOnText(s, e).trim(), tags: [] }
        : sentence(s, e, names, { downs, left });
      if (!d) continue;
      const pts = pointsOf(e);
      if (pts) score[e.side] += pts;
      const c = clockAt(s, e.period, e.psec);
      line = {
        id: e.id, ...(c ? { when: c } : {}), icon: d.icon, text: d.text, side: d.side ?? e.side, tags: d.tags,
        ...(d.key ? { key: true } : {}), ...(pts ? { score: scoreText(score.home, score.away) } : {}),
      };
      lastPlay = e.type === 'play' && ['run', 'pass', 'inc', 'sack', 'kneel'].includes(e.play ?? '') ? line : undefined;
      if (drive) gk = `d${drive.n}`;
      // a touchdown outside any drive (a kickoff return) — its own group in a play-by-play game
      else if (e.type === 'td' && drives.length) { gk = `x${e.id}`; ret = e; }
      else gk = prev && prev.gk[0] !== 'p' && halfKey(s, prev.period) === it.hk ? prev.gk : `p${e.period}`;
      if (!drive && prev && gk === prev.gk) { drive = prev.drive; ret = prev.ret; }
    } else {
      line = it.line!;
      lastPlay = undefined;
      gk = prev && prev.gk[0] !== 'p' && halfKey(s, prev.period) === it.hk ? prev.gk : `p${it.period}`;
      if (prev && gk === prev.gk) { drive = prev.drive; ret = prev.ret; }
    }
    const en: Entry = { gk, period: it.period, idx: entries.length, line, ...(drive ? { drive } : {}), ...(ret ? { ret } : {}) };
    entries.push(en);
    prev = en;
  }

  const scoreOnly = drives.length === 0;
  const periodPoints = (p: number) => {
    const pts = (sd: Side) => s.events.filter((e) => e.period === p && e.side === sd).reduce((x, e) => x + pointsOf(e), 0);
    return `Points ${scoreText(pts('home'), pts('away'))}`;
  };
  const groups = groupLines(entries, (x) => x.gk, (first, list) => {
    const lines = list.map((x) => x.line);
    if (first.gk[0] === 'd' && first.drive) {
      const d = first.drive;
      const res = d.result ? resultText(s, d) : 'In progress';
      return {
        key: first.gk, side: d.off, scope: d.period, lines,
        title: `${periodName(s, d.period)} · ${names[d.off]} ${isOT(s, d.period) && s.decider === 'kansas' ? 'possession' : 'drive'}`,
        sub: `${spotText(s, d.start)} · ${driveLine(d)} · ${res}`,
      };
    }
    if (first.gk[0] === 'x' && first.ret) {
      const r = first.ret;
      const what = r.how && HOW_RET[r.how] ? HOW_RET[r.how] : 'touchdown';
      return { key: `${first.gk}-${first.idx}`, side: r.side, scope: r.period, lines, title: `${periodName(s, r.period)} · ${names[r.side]} ${what}` };
    }
    const p = first.period;
    return {
      key: `p${p}-${first.idx}`, scope: p, lines, title: cap(periodLong(s, p)),
      ...(scoreOnly || isOT(s, p) ? { sub: periodPoints(p) } : {}),
    };
  });
  return newestFirst(groups);
}

/** Scope chip labels (Q1…Q4 / H1 H2 / OT). */
export const afScopeLabel = (s: AFState) => (p: number): string => periodName(s, p);

/** The commentary's tag chips. */
export const AF_FEED_TAGS = [
  { key: 'key', label: 'Key moments' }, { key: 'score', label: 'Scoring' }, { key: 'turnover', label: 'Turnovers' },
  { key: 'penalty', label: 'Penalties' }, { key: 'pass', label: 'Passing' }, { key: 'rush', label: 'Rushing' },
];
