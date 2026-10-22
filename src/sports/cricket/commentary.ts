/**
 * Deep wave (cricket) — ball-by-ball COMMENTARY in the ESPNcricinfo style:
 * "12.4  Bumrah to Kohli, FOUR, short of a length outside off, pulled to deep
 * mid-wicket", with the running score after every ball, an end-of-over block
 * ("End of over 13 · 9 runs · 98/2 · CRR 7.53 · Kohli 45 (31) · Rahul 20 (18)
 * · Bumrah 3-0-24-1"), wickets with the batter's line, milestones, new
 * batters, the powerplay, and the match's other moments (rain, rule changes,
 * subs, a new keeper…) in their place. Newest first, grouped by innings → over.
 *
 * DERIVED ONLY — from the replayed ball log (`state.log`), the timeline
 * (`state.events`), the wagon-wheel tags (`shots`) and the optional delivery
 * detail (`detail`, `bowlTypes`). A correction replays the log, so the
 * commentary is always the corrected one. A persisted snapshot (no log) has no
 * commentary. Pure and JSX-free (node tests).
 *
 * The timeline's non-ball moments are placed by walking `events` alongside the
 * ball log: each logged ball's own timeline entry is recognised by its stamp
 * and kind (`ballEventMatches`), everything in between is a note.
 */
import {
  oversStr, runRate, DISMISSAL_NAME, NO_BOWLER, inPowerplay, HUNDRED_PP_BALLS,
  type BallRec, type CricketState, type ShotRec,
} from './engine.ts';
import { detailByRec, isDeliveryRec, recStamp, pitchPhrase, controlPhrase, fieldPosition, type BallDetailRec } from './detail.ts';
import type { LiveEvent } from '../liveEvents';

type Side = 'home' | 'away';

export type ComTone = 'four' | 'six' | 'wicket' | 'extra' | 'dot' | 'run';
export interface ComBall {
  kind: 'ball';
  id: string;
  /** "12.4" */
  stamp: string;
  /** the full sentence: "Bumrah to Kohli, FOUR, short outside off, pulled to deep mid-wicket" */
  text: string;
  /** the outcome word(s) on their own: "FOUR", "no run", "2 wides", "OUT" */
  outcome: string;
  tone: ComTone;
  /** team score after the ball: "98/2" */
  score: string;
  /** the over-strip chip ('4', 'W', '2nb'…) */
  sym?: string;
  /** device time (ms), when stamped */
  t?: number;
  /** a wicket: "Kohli c Rahul b Bumrah 45 (31b 4x4 1x6) SR 145.16" */
  wicketLine?: string;
}
export interface ComNote {
  kind: 'note';
  id: string;
  icon: string;
  text: string;
  tone?: 'wicket' | 'boundary' | 'extra' | 'milestone';
}
export type ComItem = ComBall | ComNote;
export interface ComOver {
  id: string;
  /** 1-based */
  over: number;
  bowler: string;
  runs: number;
  wkts: number;
  /** team score at the end of the over */
  score: string;
  crr: string;
  /** innings 2: "Need 71 from 48 · RRR 8.88" (left out after a revised target) */
  chase?: string;
  /** the batters at the crease: "Kohli 45 (31)" */
  batters: string[];
  /** "Bumrah 3-0-24-1" */
  bowlerFigs: string;
  complete: boolean;
  maiden: boolean;
  /** the over in which the powerplay ended */
  powerplayEnd?: boolean;
  /** time of the over's last stamped ball */
  t?: number;
  /** newest first */
  items: ComItem[];
}
export interface ComInnings {
  id: string;
  inn: 1 | 2;
  side: Side;
  team: string;
  /** "168/6 (20 ov)" */
  total: string;
  /** newest first */
  overs: ComOver[];
  /** moments before the innings' first ball (rain, rules, the chase's target) */
  pre: ComNote[];
  /** first / last stamped ball (ms) */
  start?: number;
  end?: number;
}
export interface Commentary {
  /** newest first; empty when the state has no ball log */
  innings: ComInnings[];
  /** a Super Over (the latest round), newest first */
  superOver?: { round: number; innings: ComInnings[] };
  /** false = a persisted snapshot without a ball log: nothing to show */
  hasLog: boolean;
}

// ─── Words ────────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SHOT_VERB: Record<string, string> = {
  Drive: 'driven', Cut: 'cut', Pull: 'pulled', Hook: 'hooked', Sweep: 'swept', 'Reverse sweep': 'reverse-swept',
  Flick: 'flicked', Glance: 'glanced', Lofted: 'lofted', Edge: 'edged', Defended: 'defended',
};

/** "pulled to deep mid-wicket" / "over long-on" / "driven" / "" */
export function shotPhrase(x: Pick<ShotRec, 'zone' | 'deep' | 'shot'> | undefined, runs: number): string {
  if (!x) return '';
  const verb = x.shot ? SHOT_VERB[x.shot] ?? x.shot.toLowerCase() : '';
  const pos = x.zone ? fieldPosition(x.zone, x.deep) : '';
  const where = pos ? `${runs === 6 ? 'over' : 'to'} ${pos}` : '';
  return [verb, where].filter(Boolean).join(' ');
}

/** "14:32" — the device's local clock. */
export function clockText(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The outcome of one delivery, in words, with its tone. */
export function outcomeOf(r: BallRec): { outcome: string; tone: ComTone } {
  const sym = r.sym ?? '';
  const wkt = !!r.out && r.out.kind !== 'retired';
  const extrasRuns = r.b + r.lb;
  if (wkt) {
    const pre: string[] = [];
    if (r.ext === 'wd') pre.push(sym.startsWith('wd') ? 'wide' : `${r.wd} wides`);
    else if (r.ext === 'nb') pre.push('no ball');
    if (r.bat > 0) pre.push(plural(r.bat, 'run'));
    if (r.b > 0) pre.push(plural(r.b, 'bye'));
    if (r.lb > 0) pre.push(plural(r.lb, 'leg bye'));
    return { outcome: `${pre.length ? `${pre.join(', ')} and ` : ''}OUT`, tone: 'wicket' };
  }
  if (r.ext === 'wd') return { outcome: sym === 'wd' ? 'wide' : `${r.wd} wides`, tone: 'extra' };
  if (r.ext === 'nb') {
    const parts = ['no ball'];
    if (r.bat > 0) parts.push(`${plural(r.bat, 'run')} off the bat`);
    if (r.b > 0) parts.push(plural(r.b, 'bye'));
    if (r.lb > 0) parts.push(plural(r.lb, 'leg bye'));
    return { outcome: parts.join(', '), tone: 'extra' };
  }
  if (r.bat === 0 && extrasRuns > 0) {
    return { outcome: r.b > 0 ? plural(r.b, 'bye') : plural(r.lb, 'leg bye'), tone: 'extra' };
  }
  if (sym === '4') return { outcome: 'FOUR', tone: 'four' };
  if (sym === '6') return { outcome: 'SIX', tone: 'six' };
  if (r.bat === 0) return { outcome: 'no run', tone: 'dot' };
  if (/ot$/.test(sym)) return { outcome: `${plural(r.bat, 'run')} (overthrows)`, tone: 'run' };
  if (/r$/.test(sym)) return { outcome: `${plural(r.bat, 'run')}, all run`, tone: 'run' };
  return { outcome: plural(r.bat, 'run'), tone: 'run' };
}

// ─── Joining the log to the timeline ──────────────────────────────────────────

const WICKET_WORDS = new Set(['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'RUN OUT', 'HIT WICKET', 'HIT TWICE', 'OBSTRUCTING']);
const isPenaltyLabel = (l: string) => /^Penalty — /.test(l) || /^\d+ penalty runs? to /.test(l);
const isAdjustLabel = (l: string) => /^Bonus -?\d+/.test(l) || /^\d+ deducted/.test(l);

/** Is timeline event `e` the entry the reducer wrote for ball-log record `r`?
 *  (Stamp + kind — a delivery's "12.4", a penalty's / retirement's "12.3"
 *  overs-completed stamp — mirroring the reducer's event for each action.) */
export function ballEventMatches(e: LiveEvent, r: BallRec, bpo: number): boolean {
  const l = String(e.label ?? '');
  if (r.cross) return isPenaltyLabel(l) || isAdjustLabel(l);
  if (r.adj !== undefined) return isAdjustLabel(l) && e.stamp === oversStr(r.lb6, bpo);
  if (r.sym === undefined) {
    if (r.out) {
      const ok = r.out.kind === 'retired' ? l === 'RETIRED HURT' || l === 'RETIRED'
        : r.out.kind === 'retiredout' ? l === 'RETIRED OUT' : r.out.kind === 'timedout' ? l === 'TIMED OUT' : false;
      return ok && e.stamp === oversStr(r.lb6, bpo);
    }
    return isPenaltyLabel(l) && e.stamp === oversStr(r.lb6, bpo);
  }
  if (r.out?.kind === 'mankad') return l === 'MANKAD' && e.stamp === oversStr(r.lb6, bpo);
  if (e.stamp !== recStamp(r, bpo)) return false;
  if (r.ext === 'wd') return /^Wide\b/.test(l);
  if (r.ext === 'nb') return /^No ball\b/.test(l);
  if (r.out && r.out.kind !== 'retired') return e.icon === '🎯' && WICKET_WORDS.has(l);
  if (r.bat === 0 && r.b + r.lb > 0) return /^(Bye|Leg bye)\b/.test(l);
  return e.icon === '🏏';
}

// ─── Building ─────────────────────────────────────────────────────────────────

interface BatRun { name: string; runs: number; balls: number; out: boolean }
interface BowlRun { name: string; balls: number; runs: number; wkts: number; maidens: number }

const faced = (r: BallRec) => r.ext === 'nb' || (r.legal && r.ext !== 'wd' && isDeliveryRec(r));
const charged = (r: BallRec) => r.bat + r.wd + r.nb;
const teamRuns = (r: BallRec) => r.bat + r.wd + r.nb + r.b + r.lb + (r.pen ?? 0) + (r.adj ?? 0);

/** Powerplay length (legal balls) of an innings: The Hundred 25; else the format's overs. */
function ppBalls(s: CricketState): number {
  if (s.hundred) return HUNDRED_PP_BALLS;
  return s.powerplayOvers > 0 ? s.powerplayOvers * s.ballsPerOver : 0;
}

/** Commentary for one (regulation or Super Over) state. */
function build(s: CricketState, names: { home: string; away: string }, prefix: string): ComInnings[] {
  const bpo = s.ballsPerOver;
  const log = s.log ?? [];
  const details = detailByRec(log, s.detail, bpo);
  const shotKey = (inn: number, side: string, at: string, batterId: string, nb: boolean) => `${inn}:${side}:${at}:${batterId}:${nb ? 'nb' : ''}`;
  const shots = new Map((s.shots ?? []).map((x) => [shotKey(x.inn, x.side, x.at, x.batterId, !!x.nb), x]));
  const events = [...(s.events ?? [])].sort((a, b) => a.id - b.id);
  const nameOf = (id?: string) => (id ? s.batting[id]?.name : undefined) || 'the batter';
  const pp = ppBalls(s);
  const noRevision = !s.revision && s.r1Lost === 0 && s.r2Lost === 0 && !s.rainStop && !s.inn1Rain;

  const inns: ComInnings[] = [];
  // (initialised with a cast so TS doesn't narrow them to null — the helpers
  // below assign them)
  let curInn = null as ComInnings | null;
  let curOver = null as ComOver | null;
  let overIx = -1;
  let bat = new Map<string, BatRun>();
  let bowl = new Map<string, BowlRun>();
  let overRecs: BallRec[] = [];
  let seen = new Set<string>();
  let pair = { key: '', runs: 0, balls: 0 };
  let ei = 0;
  let noteN = 0;

  const note = (icon: string, text: string, tone?: ComNote['tone']): ComNote => ({ kind: 'note', id: `${prefix}n${noteN++}`, icon, text, tone });
  const eventNote = (e: LiveEvent): ComNote => note(e.icon, [e.label, e.detail].filter(Boolean).join(' — '),
    e.tone === 'wicket' ? 'wicket' : e.tone === 'boundary' ? 'boundary' : e.tone === 'extra' ? 'extra' : undefined);

  const closeOver = () => {
    if (!curOver || !curInn) return;
    const recs = overRecs;
    const last = recs[recs.length - 1];
    const legalN = recs.filter((r) => r.legal && isDeliveryRec(r)).length;
    curOver.complete = legalN >= bpo;
    // A maiden: a complete over by ONE bowler with nothing charged to him.
    const dels = recs.filter(isDeliveryRec);
    const ids = new Set(dels.map((r) => r.bowlerId));
    curOver.maiden = curOver.complete && ids.size === 1 && dels.every((r) => charged(r) === 0);
    if (curOver.maiden && dels[0]?.bowlerId) { const b = bowl.get(dels[0].bowlerId); if (b) b.maidens += 1; }
    const bowlers = [...new Set(dels.map((r) => r.bowlerName).filter(Boolean))];
    if (bowlers.length) curOver.bowler = bowlers.join(' / ');
    if (last) {
      curOver.score = `${last.tr}/${last.tw}`;
      curOver.crr = runRate(last.tr, last.lb6, bpo);
      const crease = [last.strikerId, last.nonStrikerId].filter((id): id is string => !!id && !bat.get(id)?.out);
      curOver.batters = crease.map((id) => { const b = bat.get(id)!; return `${b?.name ?? nameOf(id)} ${b?.runs ?? 0} (${b?.balls ?? 0})`; });
      const bw = last.bowlerId ? bowl.get(last.bowlerId) : undefined;
      curOver.bowlerFigs = bw ? `${bw.name} ${oversStr(bw.balls, bpo)}-${bw.maidens}-${bw.runs}-${bw.wkts}` : '';
      if (curInn.inn === 2 && s.target !== undefined && noRevision && !s.isSuperOver) {
        const need = s.target - last.tr;
        const left = s.oversLimit * bpo - last.lb6;
        if (need > 0 && left > 0) curOver.chase = `Need ${need} from ${plural(left, 'ball')} · RRR ${((need / left) * bpo).toFixed(2)}`;
      }
      const ts = recs.map((r) => r.t).filter((t): t is number => !!t);
      if (ts.length) curOver.t = ts[ts.length - 1];
    }
    curOver.items.reverse();
  };

  const openInnings = (r: BallRec) => {
    closeOver();
    curOver = null;
    overIx = -1;
    bat = new Map(); bowl = new Map(); seen = new Set(); pair = { key: '', runs: 0, balls: 0 };
    const sc = s.scores[r.side];
    curInn = {
      id: `${prefix}i${r.inn}${r.side}`, inn: r.inn, side: r.side, team: names[r.side],
      total: `${sc.runs}/${sc.wickets} (${oversStr(sc.balls, bpo)} ov)`, overs: [], pre: [],
    };
    inns.push(curInn);
    if (r.inn === 2 && s.target !== undefined && !s.isSuperOver) {
      curInn.pre.push(note('🎯', noRevision
        ? `${names[r.side]} need ${s.target} to win${s.oversLimit < 100 ? ` from ${plural(s.oversLimit, 'over')}` : ''}`
        : `${names[r.side]} chase a target of ${s.target}${s.revision === 'dls' ? ' (DLS)' : s.revision === 'manual' ? ' (revised target)' : ''}`));
    }
  };

  const overOf = (r: BallRec): number => {
    if (!isDeliveryRec(r) && r.out?.kind !== 'mankad') return Math.max(0, overIx);
    return r.legal ? Math.floor((r.lb6 - 1) / bpo) : Math.floor(r.lb6 / bpo);
  };
  const openOver = (ix: number, r: BallRec) => {
    closeOver();
    overIx = ix;
    overRecs = [];
    curOver = {
      id: `${curInn!.id}o${ix + 1}`, over: ix + 1, bowler: r.bowlerName ?? '', runs: 0, wkts: 0, score: '', crr: '',
      batters: [], bowlerFigs: '', complete: false, maiden: false, items: [],
    };
    curInn!.overs.push(curOver);
  };

  const pending: LiveEvent[] = [];
  const flushNotes = (into: ComNote[] | ComItem[]) => { for (const e of pending.splice(0)) into.push(eventNote(e)); };

  for (let i = 0; i < log.length; i++) {
    const r = log[i];
    // Timeline entries up to this record's own one are the moments in between.
    let found = -1;
    for (let j = ei; j < events.length; j++) if (ballEventMatches(events[j], r, bpo)) { found = j; break; }
    if (found >= 0) { pending.push(...events.slice(ei, found)); ei = found + 1; }
    const own = found >= 0 ? events[found] : undefined;

    // A penalty / bonus for the side NOT batting: a moment of the current over.
    if (r.cross) {
      pending.push(own ?? { id: -1, stamp: '', icon: '⚖️', label: `${r.pen ?? r.adj ?? 0} runs to ${names[r.side]}` });
      continue;
    }
    const newInnings = !curInn || curInn.inn !== r.inn || curInn.side !== r.side;
    if (newInnings) {
      // Moments before this innings' first ball: the earlier innings' tail keeps
      // its own (an innings closed, rain ended it), the rest open this one.
      const mine = pending.filter((e) => e.side === r.side);
      const theirs = pending.filter((e) => e.side !== r.side);
      pending.length = 0;
      pending.push(...theirs);
      if (curOver) flushNotes((curOver as ComOver).items);
      else if (curInn) flushNotes((curInn as ComInnings).pre);
      openInnings(r);
      for (const e of mine) curInn!.pre.push(eventNote(e));
    }
    const ix = overOf(r);
    if (!curOver || ix !== overIx) {
      if (curOver) flushNotes((curOver as ComOver).items);
      openOver(ix, r);
    }
    const over = curOver as unknown as ComOver;
    flushNotes(over.items);
    overRecs.push(r);
    over.runs += teamRuns(r);

    // New batters (the openers first).
    const crease = [r.strikerId, r.nonStrikerId].filter((id): id is string => !!id);
    const fresh = crease.filter((id) => !seen.has(id));
    if (fresh.length && isDeliveryRec(r)) {
      if (seen.size === 0) {
        over.items.push(note('🏏', `${crease.map(nameOf).join(' and ')} open the batting${r.bowlerName ? ` · ${r.bowlerName} to bowl` : ''}`));
      } else for (const id of fresh) over.items.push(note('🚶', `${nameOf(id)} comes to the crease`));
    }
    for (const id of crease) seen.add(id);
    for (const id of crease) if (!bat.has(id)) bat.set(id, { name: nameOf(id), runs: 0, balls: 0, out: false });
    const bowlerKey = r.bowlerId;
    if (bowlerKey && isDeliveryRec(r) && !bowl.has(bowlerKey)) bowl.set(bowlerKey, { name: r.bowlerName ?? 'Bowler', balls: 0, runs: 0, wkts: 0, maidens: 0 });

    // Running figures.
    const striker = r.strikerId ? bat.get(r.strikerId) : undefined;
    const before = striker ? striker.runs : 0;
    if (striker && isDeliveryRec(r)) { striker.runs += r.bat; if (faced(r)) striker.balls += 1; }
    const bw = bowlerKey ? bowl.get(bowlerKey) : undefined;
    if (bw && isDeliveryRec(r)) {
      if (r.legal) bw.balls += 1;
      bw.runs += charged(r);
    }
    const pairKey = crease.slice().sort().join('|');
    if (pairKey !== pair.key) pair = { key: pairKey, runs: 0, balls: 0 };
    const pairBefore = pair.runs;
    if (r.adj === undefined) { pair.runs += teamRuns(r); if (r.legal) pair.balls += 1; }

    if (isDeliveryRec(r) || r.out?.kind === 'mankad') {
      const stamp = recStamp(r, bpo);
      const batter = nameOf(r.strikerId);
      const bowler = r.bowlerName || 'the bowler';
      const det: BallDetailRec | undefined = details[i];
      const shot = r.strikerId && isDeliveryRec(r) ? shots.get(shotKey(r.inn, r.side, stamp, r.strikerId, r.ext === 'nb')) : undefined;
      let ball: ComBall;
      if (r.out?.kind === 'mankad') {
        ball = { kind: 'ball', id: `${prefix}b${i}`, stamp: oversStr(r.lb6, bpo), outcome: 'OUT', tone: 'wicket', score: `${r.tr}/${r.tw}`, sym: r.sym,
          text: `${bowler} runs out ${r.out.name || 'the non-striker'} at the non-striker's end (backing up too far)` };
      } else {
        const { outcome, tone } = outcomeOf(r);
        const wkt = !!r.out && r.out.kind !== 'retired';
        const parts: string[] = [];
        const pitch = pitchPhrase(det);
        if (pitch) parts.push(pitch);
        if (det?.kph) parts.push(`${det.kph} km/h`);
        const sp = shotPhrase(shot, r.bat);
        if (sp) parts.push(sp);
        const cp = controlPhrase(det?.ctrl);
        if (cp && !(cp === 'edged' && shot?.shot === 'Edge')) parts.push(cp);
        let head = outcome;
        if (wkt && r.out) {
          const how = DISMISSAL_NAME[r.out.kind] ?? 'Out';
          const caughtAt = r.out.kind === 'caught' && det?.cz ? ` at ${fieldPosition(det.cz, det.cdeep)}` : '';
          head = `${outcome}! ${how}${caughtAt}`;
        }
        ball = {
          kind: 'ball', id: `${prefix}b${i}`, stamp, outcome, tone, score: `${r.tr}/${r.tw}`, sym: r.sym,
          text: `${bowler} to ${batter}, ${head}${parts.length ? `, ${parts.join(', ')}` : ''}`,
        };
      }
      if (r.t) ball.t = r.t;
      if (r.out && r.out.kind !== 'retired') {
        // The batter's innings as it ended (the card is final: they're out).
        const c = s.batting[r.out.id];
        if (c) {
          const sr = c.balls ? ((c.runs / c.balls) * 100).toFixed(2) : '0.00';
          ball.wicketLine = `${c.name || r.out.name} ${c.dismissal ?? 'out'} ${c.runs} (${c.balls}b${c.fours ? ` ${c.fours}x4` : ''}${c.sixes ? ` ${c.sixes}x6` : ''}) SR ${sr}`;
        }
        const ob = bat.get(r.out.id);
        if (ob) ob.out = true;
        if (bw && !NO_BOWLER.includes(r.out.kind)) bw.wkts += 1;
        over.wkts += 1;
      }
      over.items.push(ball);
    } else if (r.out) {
      // Retired hurt / not out at the limit / retired out / timed out: no delivery.
      const c = s.batting[r.out.id];
      const text = own ? [own.label, own.detail].filter(Boolean).join(' — ')
        : `${r.out.name} ${r.out.kind === 'retired' ? 'retired' : DISMISSAL_NAME[r.out.kind].toLowerCase()}`;
      over.items.push(note(r.out.kind === 'retired' ? '🚑' : '🚶', `${text}${c && r.out.kind === 'retired' ? ` — ${c.runs} off ${c.balls} balls` : ''} · ${r.tr}/${r.tw}`,
        r.out.kind === 'retired' ? undefined : 'wicket'));
      if (r.out.kind !== 'retired') { const ob = bat.get(r.out.id); if (ob) ob.out = true; over.wkts += 1; }
    } else {
      // A penalty / bonus to the side batting.
      over.items.push(own ? eventNote(own) : note('⚖️', `${teamRuns(r)} runs · ${r.tr}/${r.tw}`, 'extra'));
    }

    // Milestones on this ball.
    if (striker && before < 50 && striker.runs >= 50 && striker.runs < 100) over.items.push(note('🎉', `FIFTY for ${striker.name} — ${striker.runs} off ${striker.balls} balls`, 'milestone'));
    if (striker && before < 100 && striker.runs >= 100) over.items.push(note('💯', `HUNDRED for ${striker.name} — ${striker.runs} off ${striker.balls} balls`, 'milestone'));
    if (bw && r.out && !NO_BOWLER.includes(r.out.kind) && bw.wkts === 5) over.items.push(note('🎉', `Five-wicket haul for ${bw.name} — ${bw.wkts}/${bw.runs}`, 'milestone'));
    for (const m of [50, 100, 150, 200]) {
      if (pairBefore < m && pair.runs >= m && crease.length === 2) {
        over.items.push(note('🤝', `${m} partnership — ${crease.map((id) => bat.get(id)?.name ?? nameOf(id)).join(' and ')} (${plural(pair.balls, 'ball')})`, 'milestone'));
      }
    }
    if (r.out) pair = { key: '', runs: 0, balls: 0 };
    // The powerplay ends on this ball.
    if (pp > 0 && r.legal && r.lb6 === pp) {
      over.powerplayEnd = true;
      over.items.push(note('⏱', `End of the powerplay — ${names[r.side]} ${r.tr}/${r.tw}`, 'milestone'));
    }
  }
  // Moments after the last ball (innings closed, rain, a rules change…). An
  // innings that has started with no ball yet (the chase's openers walking
  // out) gets its own entry: the target and its moments.
  pending.push(...events.slice(ei));
  const live = s.battingSide;
  const tail = [...log].reverse().find((r) => !r.cross);
  const nextStarted = !s.ended && !s.pendingTie && (tail ? live !== tail.side || s.innings !== tail.inn : pending.length > 0);
  if (nextStarted) {
    const mine = pending.filter((e) => e.side === live);
    const theirs = pending.filter((e) => e.side !== live);
    pending.length = 0;
    pending.push(...theirs);
    if (curOver) flushNotes((curOver as ComOver).items); else if (curInn) flushNotes((curInn as ComInnings).pre);
    closeOver();
    curOver = null;
    const sc = s.scores[live];
    const next: ComInnings = { id: `${prefix}i${s.innings}${live}`, inn: s.innings, side: live, team: names[live], total: `${sc.runs}/${sc.wickets} (${oversStr(sc.balls, bpo)} ov)`, overs: [], pre: [] };
    if (s.innings === 2 && s.target !== undefined && !s.isSuperOver) {
      next.pre.push(note('🎯', `${names[live]} need ${s.target} to win${s.revision === 'dls' ? ' (DLS)' : s.revision === 'manual' ? ' (revised target)' : s.oversLimit < 100 ? ` from ${plural(s.oversLimit, 'over')}` : ''}`));
    }
    for (const e of pending.splice(0)) next.pre.push(eventNote(e));
    for (const e of mine) next.pre.push(eventNote(e));
    inns.push(next);
  } else if (curOver) flushNotes((curOver as ComOver).items);
  else if (curInn) flushNotes((curInn as ComInnings).pre);
  closeOver();
  // Innings totals, start / end times; newest first everywhere.
  for (const inn of inns) {
    const sc = s.scores[inn.side];
    inn.total = `${sc.runs}/${sc.wickets} (${oversStr(sc.balls, bpo)} ov)`;
    const ts = log.filter((r) => r.inn === inn.inn && r.side === inn.side && r.t).map((r) => r.t!);
    if (ts.length) { inn.start = ts[0]; inn.end = ts[ts.length - 1]; }
    inn.overs.reverse();
  }
  return inns.reverse();
}

/** The whole match's commentary (newest innings first). */
export function cricketCommentary(s: CricketState, names: { home: string; away: string }): Commentary {
  if (!Array.isArray(s.log)) return { innings: [], hasLog: false };
  const out: Commentary = { innings: build(s, names, ''), hasLog: true };
  const so = s.superOver;
  if (so && Array.isArray(so.state.log) && so.state.log.length) out.superOver = { round: so.round, innings: build(so.state, names, 'so') };
  return out;
}

/** Filter for the commentary list. */
export type ComFilter = 'all' | 'wickets' | 'boundaries' | 'overs';
export function filterItems(items: ComItem[], f: ComFilter): ComItem[] {
  if (f === 'all') return items;
  if (f === 'overs') return [];
  if (f === 'wickets') return items.filter((x) => (x.kind === 'ball' ? x.tone === 'wicket' : x.tone === 'wicket'));
  return items.filter((x) => x.kind === 'ball' && (x.tone === 'four' || x.tone === 'six'));
}

/** "End of over 13 · 9 runs · 98/2 · CRR 7.53" — the over block's headline. */
export function overHeadline(o: ComOver): string {
  return [
    `${o.complete ? 'End of over' : 'Over'} ${o.over}`,
    `${plural(o.runs, 'run')}${o.wkts ? ` · ${plural(o.wkts, 'wkt')}` : ''}${o.maiden ? ' · maiden' : ''}`,
    o.score,
    o.crr ? `CRR ${o.crr}` : '',
  ].filter(Boolean).join(' · ');
}

/** Is the innings in the powerplay right now (for the live header chip)? */
export const livePowerplay = (s: CricketState): boolean => inPowerplay(s);
