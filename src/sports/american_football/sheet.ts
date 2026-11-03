/**
 * Deep wave — American football's broadcast "Team stats" sheet (NFL Game
 * Book / ESPN & NFL.com team box; NCAA / NFHS box scores read the same).
 * PURE, derived from the event log only, so corrections and undo re-derive it
 * and an old match shows what it had.
 *
 *  - Overview: first downs (rushing / passing / penalty — a touchdown from
 *    scrimmage counts as one), total plays, total net yards, yards per play,
 *    time of possession.
 *  - Passing: completions / attempts, net passing yards (sack yards taken
 *    off), sacked – yards lost, interceptions thrown, yards per pass play.
 *  - Rushing: attempts, yards, yards per rush.
 *  - Efficiency: 3rd down, 4th down (tackle), red zone TDs / trips (tackle) —
 *    flag has no red zone: "past midfield" (IFAF: 3 downs to score from there).
 *  - Turnovers, penalties, scoring (TDs by how, conversions, safeties),
 *    kicking (FG made-att, longest, extra points, punts, punting average,
 *    punt-return yards — tackle), drives (count, average start, yards and
 *    points per drive, scoring drives), timeouts.
 * A score-only game has only scoring, kicking (FG / XP) and timeouts — the
 * play-by-play rows don't exist (never a false 0). Scope = the whole game or
 * one quarter / half (drives = those that started in it).
 */
import { eventWhen, isPbp, spotText, teamFigures, type AFState, type AFTeamFigures } from './engine.ts';
import { afDrives, drivesIn, possessionIn, type AFDrive } from './drives.ts';
import { countRow, decRow, madeRow, section, sheet, textRow, timeRow, type SheetRow, type StatSheet } from '../compareSheet.ts';

const avg = (n: number, d: number): number | undefined => (d > 0 ? n / d : undefined);
const sum = (ds: AFDrive[], f: (d: AFDrive) => number) => ds.reduce((x, d) => x + f(d), 0);

/** "Sacked – yards lost": "2–14" (fewer is better). */
function sackedRow(H: AFTeamFigures, A: AFTeamFigures): SheetRow {
  return { key: 'sacked', label: 'Sacked – yards lost', home: `${H.sacked}–${H.sackYds}`, away: `${A.sacked}–${A.sackYds}`, h: H.sacked, a: A.sacked, lowerBetter: true };
}

/** Where play by play began, when it wasn't from the kickoff ("Q2 4:12"). */
export function pbpFrom(s: AFState): string | undefined {
  const first = s.events.filter((e) => e.pbp || e.pre).sort((x, y) => x.period - y.period || x.sec - y.sec)[0];
  if (!first || (first.period === 1 && first.psec <= 120)) return undefined;
  return eventWhen(s, first);
}

/** The sheet for a scope ('all' or a quarter / half). `nowSec` = the live game second. */
export function afSheet(s: AFState, scope: 'all' | number = 'all', nowSec?: number): StatSheet {
  const H = teamFigures(s, 'home', scope), A = teamFigures(s, 'away', scope);
  const pbp = isPbp(s);
  const flag = s.variant === 'flag';
  const log = pbp ? afDrives(s) : null;
  const dh = log ? drivesIn(log, 'home', scope) : [];
  const da = log ? drivesIn(log, 'away', scope) : [];
  const top = pbp ? possessionIn(s, scope, nowSec) : { home: 0, away: 0 };
  const rz = (ds: AFDrive[]) => ds.filter((d) => d.redZone);
  const from = scope === 'all' && pbp ? pbpFrom(s) : undefined;
  const avgStart = (ds: AFDrive[]) => (ds.length ? spotText(s, Math.round(sum(ds, (d) => d.start) / ds.length)) : '–');
  return sheet([
    pbp && section('overview', 'Overview', [
      countRow('firstDowns', 'First downs', H.firstDowns, A.firstDowns),
      countRow('firstRush', 'First downs — rushing', H.firstRush, A.firstRush),
      countRow('firstPass', 'First downs — passing', H.firstPass, A.firstPass),
      countRow('firstPen', 'First downs — penalty', H.firstPen, A.firstPen),
      countRow('plays', 'Total plays', H.plays, A.plays),
      countRow('totalYards', 'Total yards', H.totalYards, A.totalYards),
      decRow('ypp', 'Yards per play', avg(H.totalYards, H.plays), avg(A.totalYards, A.plays)),
      timeRow('top', 'Time of possession', top.home, top.away),
    ], from ? `Play by play from ${from}.` : undefined),
    pbp && section('passing', 'Passing', [
      madeRow('cmpAtt', 'Completions / attempts', H.passComp, H.passAtt, A.passComp, A.passAtt) ?? countRow('cmpAtt', 'Completions / attempts', 0, 0),
      countRow('netPass', 'Net passing yards', H.passYds - H.sackYds, A.passYds - A.sackYds),
      sackedRow(H, A),
      countRow('intThrown', 'Interceptions thrown', H.intThrown, A.intThrown, { lowerBetter: true }),
      decRow('ypa', 'Yards per pass play', avg(H.passYds - H.sackYds, H.passAtt + H.sacked), avg(A.passYds - A.sackYds, A.passAtt + A.sacked)),
    ]),
    pbp && section('rushing', 'Rushing', [
      countRow('rushAtt', 'Rushing attempts', H.rushAtt, A.rushAtt),
      countRow('rushYds', 'Rushing yards', H.rushYds, A.rushYds),
      decRow('ypc', 'Yards per rush', avg(H.rushYds, H.rushAtt), avg(A.rushYds, A.rushAtt)),
    ]),
    pbp && section('eff', 'Efficiency', [
      madeRow('third', '3rd-down conversions', H.thirdConv, H.thirdAtt, A.thirdConv, A.thirdAtt),
      !flag && madeRow('fourth', '4th-down conversions', H.fourthConv, H.fourthAtt, A.fourthConv, A.fourthAtt),
      madeRow('redZone', flag ? 'Past midfield — TDs / trips' : 'Red zone — TDs / trips',
        rz(dh).filter((d) => d.result === 'td').length, rz(dh).length, rz(da).filter((d) => d.result === 'td').length, rz(da).length),
    ], flag ? 'Flag has no red zone: a trip is a drive that snapped past midfield (3 downs to score from there).' : undefined),
    pbp && section('turnovers', 'Turnovers', [
      countRow('turnovers', 'Turnovers', H.turnovers, A.turnovers, { lowerBetter: true }),
      countRow('fumblesLost', 'Fumbles lost', H.fumblesLost, A.fumblesLost, { lowerBetter: true }),
      countRow('intThrownTo', 'Interceptions thrown', H.intThrown, A.intThrown, { lowerBetter: true }),
      (H.intRetYds || A.intRetYds) && countRow('intRetYds', 'Interception return yards', H.intRetYds, A.intRetYds),
    ]),
    pbp && section('penalties', 'Penalties', [
      countRow('penalties', 'Penalties', H.penalties, A.penalties, { lowerBetter: true }),
      countRow('penaltyYds', 'Penalty yards', H.penaltyYds, A.penaltyYds, { lowerBetter: true }),
    ]),
    section('scoring', 'Scoring', [
      countRow('touchdowns', 'Touchdowns', H.touchdowns, A.touchdowns),
      (H.rushTD || A.rushTD) && countRow('rushTD', 'Rushing TDs', H.rushTD, A.rushTD),
      (H.passTD || A.passTD) && countRow('passTD', 'Passing TDs', H.passTD, A.passTD),
      (H.retTD || A.retTD) && countRow('retTD', 'Return TDs', H.retTD, A.retTD),
      madeRow('onePt', '1-point conversions', H.oneMade, H.oneAtt, A.oneMade, A.oneAtt),
      madeRow('twoPt', '2-point conversions', H.twoMade, H.twoAtt, A.twoMade, A.twoAtt),
      (H.safeties || A.safeties) && countRow('safeties', 'Safeties', H.safeties, A.safeties),
      (H.defTries || A.defTries) && countRow('defTries', 'Defensive 2-pt returns', H.defTries, A.defTries),
    ]),
    !flag && section('kicking', 'Kicking', [
      madeRow('fg', 'Field goals', H.fgMade, H.fgAtt, A.fgMade, A.fgAtt),
      decRow('fgLong', 'Longest field goal', H.fgLong || undefined, A.fgLong || undefined, 0),
      madeRow('xp', 'Extra points', H.patMade, H.patAtt, A.patMade, A.patAtt),
      pbp && countRow('punts', 'Punts', H.punts, A.punts),
      pbp && decRow('puntAvg', 'Punting average', avg(H.puntYds, H.punts), avg(A.puntYds, A.punts)),
      pbp && (H.puntRets || A.puntRets) && countRow('puntRetYds', 'Punt return yards', H.puntRetYds, A.puntRetYds),
      // US batch 6: once recorded (never a false 0)
      pbp && (H.kickRets || A.kickRets) && madeRow('kickRets', 'Kickoff returns – yards', H.kickRets, H.kickRetYds, A.kickRets, A.kickRetYds),
      pbp && (H.kickRets || A.kickRets) && countRow('kickRetYds', 'Kickoff return yards', H.kickRetYds, A.kickRetYds),
      pbp && (H.kicksBlocked || A.kicksBlocked) && countRow('kicksBlocked', 'Kicks blocked', H.kicksBlocked, A.kicksBlocked),
      pbp && (H.onsideAtt || A.onsideAtt) && madeRow('onside', 'Onside kicks recovered', H.onsideRec, H.onsideAtt, A.onsideRec, A.onsideAtt),
    ]),
    log && (dh.length || da.length) && section('drives', 'Drives', [
      countRow('drives', 'Drives', dh.length, da.length, { plain: true }),
      textRow('avgStart', 'Average start', avgStart(dh), avgStart(da)),
      decRow('ydsPerDrive', 'Yards per drive', avg(sum(dh, (d) => d.yards), dh.length), avg(sum(da, (d) => d.yards), da.length)),
      decRow('ptsPerDrive', 'Points per drive', avg(sum(dh, (d) => d.points), dh.length), avg(sum(da, (d) => d.points), da.length), 2),
      countRow('scoringDrives', 'Scoring drives', dh.filter((d) => d.points > 0).length, da.filter((d) => d.points > 0).length),
    ]),
    section('other', 'Other', [countRow('timeouts', 'Timeouts used', H.timeouts, A.timeouts, { plain: true })]),
  ]);
}
