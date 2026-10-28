/**
 * Pool — the match stats panel (gcc/CompareTable) and the rack list, for the
 * whole match or one set. PURE: from the rack list and the shot counters
 * (both replay from the event log). Rows the match didn't track are left out
 * (never a false 0): the shot rows exist only once a rack was scored shot by
 * shot, and say so when only some racks were.
 */
import { countRow, nonEmpty, ofPct, type CompareCategory, type CompareRow } from '../gcc/model.ts';
import { cnt, type RackRecord } from './engine.ts';
import { isSide, other, type Side } from './balls.ts';
import { sideCounts, type Counts, type PoolMatch } from './match.ts';
import { rackTag } from './feed.ts';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const racksOf = (s: unknown): RackRecord[] =>
  (isObj(s) && Array.isArray(s.racks) ? s.racks : []).filter((r): r is RackRecord => isObj(r) && isSide(r.winner));

/** Category rows for the match (`set` absent) or one set (1-based). */
export function poolCompare(s: PoolMatch, set?: number): CompareCategory[] {
  if (!isObj(s)) return [];
  const racks = racksOf(s).filter((r) => set == null || cnt(r.set) === set);
  const c: Record<Side, Counts> = { home: sideCounts(s, 'home', set), away: sideCounts(s, 'away', set) };
  const v = (sd: Side, k: string) => cnt(c[sd][k]);
  const n = racks.length;
  const det = racks.filter((r) => r.mode === 'detail');
  const anyShots = Object.keys(c.home).length + Object.keys(c.away).length > 0;
  const detail = det.length > 0 || anyShots;
  const cover = det.length < n ? `tracked on ${det.length} of ${n} racks` : undefined;
  const per = (sd: Side) => racks.filter((r) => r.winner === sd);

  const rk = (sd: Side) => ({
    won: per(sd).length,
    broke: racks.filter((r) => r.breaker === sd).length,
    brokeWon: per(sd).filter((r) => r.breaker === sd).length,
    bnr: per(sd).filter((r) => r.bnr).length,
    runOuts: per(sd).filter((r) => r.runOut).length,
    golden: per(sd).filter((r) => r.golden).length,
    threeFoul: racks.filter((r) => r.winner === other(sd) && r.how === 'threeFoul').length,
    eight: racks.filter((r) => r.winner === other(sd) && r.how.startsWith('eight')).length,
    innings: det.reduce((t, r) => t + cnt(r.innings?.[sd]), 0),
  });
  const H = rk('home'), A = rk('away');

  const rackRows: CompareRow[] = [countRow('racks', 'Racks won', H.won, A.won)];
  if (H.broke || A.broke) {
    rackRows.push(countRow('broke', 'Racks broken', H.broke, A.broke));
    rackRows.push({ key: 'brokeWon', label: 'Won on own break', home: ofPct(H.brokeWon, H.broke), away: ofPct(A.brokeWon, A.broke), hv: H.broke ? H.brokeWon / H.broke : 0, av: A.broke ? A.brokeWon / A.broke : 0 });
  }
  rackRows.push(countRow('bnr', 'Break-and-runs', H.bnr, A.bnr));
  rackRows.push(countRow('runOuts', 'Run-outs', H.runOuts, A.runOuts));
  if (s.game === 'nine') rackRows.push(countRow('golden', 'Golden breaks', H.golden, A.golden));

  const brk: CompareRow[] = [];
  if (detail && (v('home', 'breakShots') || v('away', 'breakShots'))) {
    brk.push(countRow('breaks', 'Breaks', v('home', 'breakShots'), v('away', 'breakShots')));
    brk.push(countRow('breakBalls', 'Balls on the break', v('home', 'breakBalls'), v('away', 'breakBalls')));
    const avg = (sd: Side) => (v(sd, 'breakShots') ? (v(sd, 'breakBalls') / v(sd, 'breakShots')).toFixed(1) : '–');
    brk.push({ key: 'perBreak', label: 'Balls per break', home: avg('home'), away: avg('away'),
      hv: v('home', 'breakShots') ? v('home', 'breakBalls') / v('home', 'breakShots') : 0, av: v('away', 'breakShots') ? v('away', 'breakBalls') / v('away', 'breakShots') : 0 });
    brk.push(countRow('dry', 'Dry breaks (nothing in)', v('home', 'dryBreaks'), v('away', 'dryBreaks'), 'lower'));
    brk.push(countRow('breakFouls', 'Break fouls', v('home', 'breakFouls'), v('away', 'breakFouls'), 'lower'));
    if (v('home', 'illegalBreaks') || v('away', 'illegalBreaks')) brk.push(countRow('illegal', 'Illegal breaks', v('home', 'illegalBreaks'), v('away', 'illegalBreaks'), 'lower'));
    if (v('home', 'eightBreaks') || v('away', 'eightBreaks')) brk.push(countRow('eightBreak', '8 on the break', v('home', 'eightBreaks'), v('away', 'eightBreaks')));
  }

  const table: CompareRow[] = [];
  if (detail) {
    table.push(countRow('potted', 'Balls pocketed', v('home', 'ballsPotted'), v('away', 'ballsPotted'), 'higher', cover));
    const att = (sd: Side) => v(sd, 'potShots') + v(sd, 'missShots');
    table.push({ key: 'potPct', label: 'Pot success (pots / pots + misses)', home: ofPct(v('home', 'potShots'), att('home')), away: ofPct(v('away', 'potShots'), att('away')),
      hv: att('home') ? v('home', 'potShots') / att('home') : 0, av: att('away') ? v('away', 'potShots') / att('away') : 0 });
    table.push(countRow('safeties', 'Safeties', v('home', 'safetyShots'), v('away', 'safetyShots')));
    if (s.game !== 'eight' && (v('home', 'pushOuts') || v('away', 'pushOuts'))) table.push(countRow('pushOuts', 'Push-outs', v('home', 'pushOuts'), v('away', 'pushOuts')));
    if (det.length) {
      table.push(countRow('innings', 'Innings (visits to the table)', H.innings, A.innings, 'lower'));
      table.push({ key: 'ipr', label: 'Innings per rack', home: (H.innings / det.length).toFixed(1), away: (A.innings / det.length).toFixed(1), hv: H.innings / det.length, av: A.innings / det.length, better: 'lower' });
    }
  }

  const fouls: CompareRow[] = [];
  if (detail) {
    fouls.push(countRow('fouls', 'Fouls', v('home', 'fouls'), v('away', 'fouls'), 'lower', cover));
    const KINDS: Array<[string, string]> = [['foulScratch', 'Scratch (cue ball)'], ['foulWrongBall', 'Wrong ball first'], ['foulNoRail', 'No rail'], ['foulOffTable', 'Ball off the table'], ['foulOther', 'Other fouls']];
    for (const [k, label] of KINDS) if (v('home', k) || v('away', k)) fouls.push(countRow(k, label, v('home', k), v('away', k), 'lower'));
  }
  if (s.threeFoul === true && (detail || H.threeFoul || A.threeFoul)) fouls.push(countRow('threeFoul', 'Racks lost on three fouls', H.threeFoul, A.threeFoul, 'lower'));
  if (s.game === 'eight' && (detail || H.eight || A.eight)) fouls.push(countRow('eightLoss', 'Racks lost on the 8', H.eight, A.eight, 'lower'));

  return nonEmpty([
    { id: 'racks', title: 'Racks', rows: racks.length || detail ? rackRows : [] },
    { id: 'break', title: 'The break', rows: brk },
    { id: 'table', title: 'At the table', rows: table },
    { id: 'fouls', title: 'Fouls', rows: fouls },
  ]);
}

/** The rack list: "Rack 3 · Asha broke · Ravi won · run-out". */
export function poolRackList(s: PoolMatch, name: (s: Side) => string): { n: number; set: number; winner: Side; text: string }[] {
  return racksOf(s).map((r) => {
    const tag = rackTag(r, name);
    const broke = r.breaker && isSide(r.breaker) ? ` · ${name(r.breaker)} broke` : '';
    return { n: cnt(r.n), set: cnt(r.set) || 1, winner: r.winner, text: `Rack ${cnt(r.n)}${broke} · ${name(r.winner)} won${tag ? ` · ${tag}` : ''}` };
  });
}
