/**
 * Cricket round 2 — the WhatsApp SHARE CARD (founder: yes): a short text
 * summary at the end of an innings and at the end of the match — the score,
 * the top batters and bowlers, and the result — plus an optional end-of-over
 * card from the commentary. Shared through the app's one share path
 * (core/share.ts `shareMessage`: the system sheet, WhatsApp first on the
 * desktop web). The app makes no share IMAGES today, so the card is text,
 * WhatsApp-formatted (*bold* team lines) with the match link at the end.
 *
 * DERIVED ONLY from the replayed state (the ball log for the over card).
 * Pure and JSX-free (node tests — note the `.ts` imports).
 */
import { outcome, other, oversStr, runRate, type CricketState } from './engine.ts';
import { inningsTop } from './matchStats.ts';
import { cricketCommentary, overHeadline, type ComBall } from './commentary.ts';
import { matchLink } from '../../core/shareText.ts';
import { SITE_HOST } from '../../core/hosts.ts';

type Side = 'home' | 'away';

/** Which card: the first innings (once it's over) or the match result. */
export type ShareStage = 'innings1' | 'result';

export interface ShareCardOpts {
  homeName: string;
  awayName: string;
  matchId?: string;
  tournamentName?: string;
  /** the Player of the Match to name on the result card */
  potmName?: string;
  /** a match closed by hand ("Match abandoned — Rain") replaces the result line */
  resultLine?: string;
  /** names as the reader may see them (a disputed participation is masked) */
  nameOf?: (playerId: string, name: string) => string;
  /** top N batters / bowlers per innings (default 3) */
  top?: number;
}

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
/** WhatsApp bold — `*text*` (asterisks inside a name would break it, so they go). */
const bold = (s: string) => `*${clean(s).replace(/\*/g, '')}*`;

/** The side that batted first (innings 1). */
export function firstBatting(s: CricketState): Side {
  const first = (s.log ?? []).find((r) => !r.cross && r.inn === 1);
  if (first) return first.side;
  return s.innings === 2 ? other(s.battingSide) : s.battingSide;
}

/** The cards that are ready: the first innings once the chase has begun (or
 *  the match is over), the result once the match has ended. */
export function shareStages(s: CricketState): ShareStage[] {
  const out: ShareStage[] = [];
  const firstDone = s.innings === 2 || (s.ended && s.scores[firstBatting(s)].balls + s.scores[firstBatting(s)].runs > 0);
  if (firstDone) out.push('innings1');
  if (s.ended) out.push('result');
  return out;
}

const link = (o: ShareCardOpts, live: boolean) =>
  (o.matchId ? `${live ? 'Follow live' : 'Full scorecard'} on SportnNote: ${matchLink(o.matchId)}` : `Scored on SportnNote — ${SITE_HOST}`);

/** "Asha 72* (45) · Ravi 40 (30)" / "Veer 3/24 (4.0)" — one innings' top performers. */
function topLines(s: CricketState, side: Side, o: ShareCardOpts): { total: string; bat: string; bowl: string } {
  const t = inningsTop(s, side, o.top ?? 3);
  const nm = (id: string, name: string) => clean(o.nameOf ? o.nameOf(id, name) : name);
  return {
    total: t.total,
    bat: t.bat.map((b) => `${nm(b.id, b.name)} ${b.line}`).join(' · '),
    bowl: t.bowl.map((b) => `${nm(b.id, b.name)} ${b.line}`).join(' · '),
  };
}

const teamOf = (o: ShareCardOpts, side: Side) => clean(side === 'home' ? o.homeName : o.awayName);
const head = (word: string, o: ShareCardOpts) => `🏏 ${word}${o.tournamentName ? ` · ${clean(o.tournamentName)}` : ''}`;

/** End of the first innings: the total and run rate, the top batters, the
 *  bowling side's top bowlers, and what the chase needs. */
export function inningsShareText(s: CricketState, o: ShareCardOpts): string {
  const side = firstBatting(s);
  const sc = s.scores[side];
  const t = topLines(s, side, o);
  const lines = [head('END OF INNINGS', o), `${bold(`${teamOf(o, side)} ${sc.runs}/${sc.wickets}`)} (${oversStr(sc.balls, s.ballsPerOver)} ov · RR ${runRate(sc.runs, sc.balls, s.ballsPerOver)})`];
  if (t.bat) lines.push(`🏏 ${t.bat}`);
  if (t.bowl) lines.push(`🎯 ${teamOf(o, other(side))}: ${t.bowl}`);
  if (s.target !== undefined && !s.ended) {
    const tag = s.revision === 'dls' ? ' (DLS)' : s.revision === 'manual' ? ' (revised target)' : '';
    const n = s.hundred ? s.oversLimit * s.ballsPerOver : s.oversLimit;
    const from = s.oversLimit >= 100 ? '' : ` from ${n} ${s.hundred ? 'ball' : 'over'}${n === 1 ? '' : 's'}`;
    lines.push(`🎯 ${teamOf(o, other(side))} need ${s.target} to win${from}${tag}`);
  }
  lines.push('', link(o, !s.ended));
  return lines.join('\n');
}

/** The result line: "🏆 Home won by 18 runs" / "🤝 Match tied" / a hand-closed result. */
export function resultText(s: CricketState, o: ShareCardOpts): string {
  if (o.resultLine) return `🏁 ${clean(o.resultLine)}`;
  const r = outcome(s);
  if (!r.winner) return `🤝 ${r.text}`;
  return `🏆 ${teamOf(o, r.winner)} ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)}`;
}

/** End of the match: both totals, the result, each innings' top batters and
 *  the opposition's top bowlers, the Player of the Match. */
export function resultShareText(s: CricketState, o: ShareCardOpts): string {
  const first = firstBatting(s);
  const order: Side[] = [first, other(first)];
  const lines = [head('RESULT', o)];
  for (const side of order) {
    const sc = s.scores[side];
    if (!sc.balls && !sc.runs && !sc.wickets) { lines.push(`${bold(teamOf(o, side))} did not bat`); continue; }
    lines.push(`${bold(`${teamOf(o, side)} ${sc.runs}/${sc.wickets}`)} (${oversStr(sc.balls, s.ballsPerOver)} ov)`);
  }
  if (s.superOver) {
    const so = s.superOver.state.scores;
    lines.push(`Super Over: ${teamOf(o, 'home')} ${so.home.runs}/${so.home.wickets} · ${teamOf(o, 'away')} ${so.away.runs}/${so.away.wickets}`);
  }
  lines.push(resultText(s, o));
  for (const side of order) {
    const t = topLines(s, side, o);
    if (!t.bat && !t.bowl) continue;
    lines.push('', `${teamOf(o, side)} batting`);
    if (t.bat) lines.push(`🏏 ${t.bat}`);
    if (t.bowl) lines.push(`🎯 ${teamOf(o, other(side))}: ${t.bowl}`);
  }
  if (o.potmName) lines.push('', `🏅 Player of the Match: ${clean(o.potmName)}`);
  lines.push('', link(o, false));
  return lines.join('\n');
}

/** The card for a stage. */
export function shareCardText(s: CricketState, stage: ShareStage, o: ShareCardOpts): string {
  return stage === 'result' ? resultShareText(s, o) : inningsShareText(s, o);
}

/** The over a "Share over" button names (as the commentary's over blocks). */
export interface OverRef { inn: 1 | 2; side: Side; over: number; superOver?: boolean }

/**
 * Optional end-of-over card (the commentary's over block): the over's balls,
 * runs and wickets, the score and run rate, the batters, the bowler's figures
 * and, in a chase, what's needed. Null when that over isn't in the log.
 */
export function overShareText(s: CricketState, ref: OverRef, o: ShareCardOpts): string | null {
  const com = cricketCommentary(s, { home: o.homeName, away: o.awayName });
  const inns = ref.superOver ? com.superOver?.innings ?? [] : com.innings;
  const inn = inns.find((i) => i.inn === ref.inn && i.side === ref.side);
  const ov = inn?.overs.find((x) => x.over === ref.over);
  if (!inn || !ov) return null;
  const balls = ov.items.filter((x): x is ComBall => x.kind === 'ball').reverse().map((b) => b.sym ?? '•');
  const lines = [
    `🏏 ${bold(teamOf(o, ref.side))}${ref.superOver ? ' · Super Over' : ''} · ${overHeadline(ov)}`,
    `This over: ${balls.join(' ')}`,
  ];
  if (ov.batters.length) lines.push(`🏏 ${ov.batters.join(' · ')}`);
  if (ov.bowlerFigs) lines.push(`🎯 ${ov.bowlerFigs}`);
  if (ov.chase) lines.push(`🎯 ${ov.chase}`);
  if (o.tournamentName) lines.push(clean(o.tournamentName));
  lines.push('', link(o, !s.ended));
  return lines.join('\n');
}

/** The preview the app shows (WhatsApp's *bold* markers removed). */
export const previewText = (text: string): string => text.replace(/\*([^*\n]+)\*/g, '$1');
