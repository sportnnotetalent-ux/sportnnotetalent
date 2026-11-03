/**
 * Deep wave — basketball's broadcast team-stats panel (FIBA LiveStats / NBA
 * team stats), by period, in four categories:
 *   Shooting · FG, 2P (3×3: 1P), 3P (3×3: 2P), FT made-attempted and %, and
 *              the shot zones once charted;
 *   Scoring  · points in the paint, second-chance, fast-break, off turnovers,
 *              bench, from 3s / 2s / free throws, efficiency, time leading;
 *   Ball     · rebounds (off / def), assists, steals, blocks, turnovers;
 *   Fouls    · fouls, team fouls, fouls drawn, technicals, U / D, time-outs.
 * Every row is derived from the log (deep.ts); a figure the match didn't
 * capture is left out with a note — never a false 0. PURE.
 */
import { compactPanel, countRow, maRow, shareText, type PanelCategory, type PanelRow, type StatPanelData } from '../statPanel.ts';
import { periodLabel, type BasketballState } from './engine.ts';
import { SHOT_ZONES, zoneLabel } from './events.ts';
import {
  bbCoverage, bbTeamFigures, benchPoints, fastBreakOn, fastBreakPlays, foulsDrawnOn, mmss, possessionTags, timeLeading, zonesOn,
  type BbScope,
} from './deep.ts';

export interface BbPanelContext {
  /** starters when no five was set on court (the match lineup) */
  starters?: Partial<Record<'home' | 'away', { ids?: string[]; names?: string[] }>>;
  /** the clock (live time leading) */
  now?: number;
}

/** The periods the panel can filter by (Q1 … OT), once there are two. */
export const bbPanelPeriods = (s: BasketballState): { value: number; label: string }[] =>
  Math.max(1, s.quarter) >= 2 ? Array.from({ length: Math.max(1, s.quarter) }, (_, i) => ({ value: i + 1, label: periodLabel(i + 1, s.regPeriods) })) : [];

export function basketballPanel(s: BasketballState, scope: BbScope = 'all', ctx: BbPanelContext = {}): StatPanelData {
  const cov = bbCoverage(s);
  const halfCourt = s.targetPoints > 0;
  const tags = possessionTags(s);
  const fbp = fastBreakPlays(s);
  const H = bbTeamFigures(s, 'home', scope, tags, fbp);
  const A = bbTeamFigures(s, 'away', scope, tags, fbp);
  const notes: string[] = [];

  /* ---- shooting ---- */
  const shooting: PanelRow[] = [countRow('pts', 'Points', H.points, A.points)];
  if (cov.shots) {
    shooting.push(maRow('fg', 'Field goals', H.fgm, H.fga, A.fgm, A.fga));
    shooting.push(maRow('in', halfCourt ? '1-pointers' : '2-pointers', H.inM, H.inA, A.inM, A.inA));
    shooting.push(halfCourt ? maRow('arc', '2-pointers', H.arcM, H.arcA, A.arcM, A.arcA) : maRow('three', '3-pointers', H.tpm, H.tpa, A.tpm, A.tpa));
  } else {
    shooting.push(countRow('fg', 'Field goals made', H.fgm, A.fgm));
    shooting.push(countRow('in', halfCourt ? '1-pointers made' : '2-pointers made', H.inM, A.inM));
    shooting.push(halfCourt ? countRow('arc', '2-pointers made', H.arcM, A.arcM) : countRow('three', '3-pointers made', H.tpm, A.tpm));
    notes.push('Attempts and FG% need "Track missed shots" on.');
  }
  shooting.push(maRow('ft', 'Free throws', H.ftm, H.fta, A.ftm, A.fta));
  if (zonesOn(s, cov)) {
    for (const z of SHOT_ZONES) {
      const hz = H.zones[z], az = A.zones[z];
      if (!hz.att && !az.att) continue;
      shooting.push(cov.shots ? maRow(`zone:${z}`, zoneLabel(z, halfCourt), hz.made, hz.att, az.made, az.att) : countRow(`zone:${z}`, `${zoneLabel(z, halfCourt)} made`, hz.made, az.made));
    }
    if (cov.zones.charted < cov.zones.of) notes.push(`Shot zones charted on ${cov.zones.charted} of ${cov.zones.of} field goals.`);
  }

  /* ---- scoring ---- */
  const scoring: PanelRow[] = [];
  if (zonesOn(s, cov)) scoring.push(countRow('paint', 'Points in the paint', H.paint, A.paint));
  if (cov.reboundsTyped) scoring.push(countRow('second', 'Second-chance points', H.second, A.second));
  if (fastBreakOn(s, cov)) {
    scoring.push(countRow('fastBreak', 'Fast-break points', H.fastBreak, A.fastBreak));
    if (cov.fastBreak.tracked < cov.fastBreak.of) notes.push(`Fast breaks tagged on ${cov.fastBreak.tracked} of ${cov.fastBreak.of} baskets.`);
  }
  if (cov.possession) scoring.push(countRow('offTo', 'Points off turnovers', H.offTo, A.offTo));
  const bh = benchPoints(s, 'home', scope, ctx.starters?.home);
  const ba = benchPoints(s, 'away', scope, ctx.starters?.away);
  if (bh != null || ba != null) scoring.push({ ...countRow('bench', 'Bench points', bh ?? 0, ba ?? 0), home: bh == null ? '–' : String(bh), away: ba == null ? '–' : String(ba) });
  if (halfCourt) {
    scoring.push({ ...countRow('fromArc', 'Points from 2s', H.fromArc, A.fromArc), home: shareText(H.fromArc, H.points), away: shareText(A.fromArc, A.points) });
    scoring.push({ ...countRow('fromIn', 'Points from 1s', H.fromIn, A.fromIn), home: shareText(H.fromIn, H.points), away: shareText(A.fromIn, A.points) });
  } else {
    scoring.push({ ...countRow('from3', 'Points from 3s', H.from3, A.from3), home: shareText(H.from3, H.points), away: shareText(A.from3, A.points) });
    scoring.push({ ...countRow('fromIn', 'Points from 2s', H.fromIn, A.fromIn), home: shareText(H.fromIn, H.points), away: shareText(A.fromIn, A.points) });
  }
  scoring.push({ ...countRow('fromFt', 'Points from free throws', H.fromFt, A.fromFt), home: shareText(H.fromFt, H.points), away: shareText(A.fromFt, A.points) });
  scoring.push(countRow('eff', 'Efficiency (EFF)', H.eff, A.eff));
  if (scope === 'all') {
    const tl = timeLeading(s, ctx.now ?? 0);
    if (tl && tl.home + tl.away + tl.tied > 0) {
      scoring.push({ key: 'timeLeading', label: 'Time leading', home: mmss(tl.home), away: mmss(tl.away), h: tl.home, a: tl.away, sub: { home: `level ${mmss(tl.tied)}` } });
    }
  }
  if (cov.reboundsTyped || cov.possession) notes.push('Second-chance points and points off turnovers come from the order of the plays logged.');

  /* ---- rebounds & ball ---- */
  const ball: PanelRow[] = [
    { ...countRow('reb', 'Rebounds', H.reb, A.reb), ...(cov.reboundsTyped ? { sub: { home: `O ${H.oreb} · D ${H.dreb}`, away: `O ${A.oreb} · D ${A.dreb}` } } : {}) },
  ];
  if (cov.reboundsTyped) {
    ball.push(countRow('oreb', 'Offensive rebounds', H.oreb, A.oreb));
    ball.push(countRow('dreb', 'Defensive rebounds', H.dreb, A.dreb));
  }
  // US batch 5: FIBA's team-rebound line, once the match logged one
  if (s.events.some((e) => e.type === 'rebound' && e.team)) ball.push(countRow('teamReb', 'Team rebounds', H.teamReb, A.teamReb));
  ball.push(countRow('ast', 'Assists', H.ast, A.ast));
  ball.push(countRow('stl', 'Steals', H.stl, A.stl));
  ball.push(countRow('blk', 'Blocks', H.blk, A.blk));
  ball.push(countRow('tov', 'Turnovers', H.tov, A.tov, { lowerBetter: true }));
  // US batch 6: jump balls / held balls won (the arrow's possessions included), once logged
  if (s.events.some((e) => e.type === 'jump')) ball.push(countRow('jump', 'Jump balls / held balls (ball)', H.jump, A.jump, { noBar: true }));

  /* ---- fouls & time-outs ---- */
  const fouls: PanelRow[] = [countRow('pf', 'Fouls', H.pf, A.pf, { lowerBetter: true })];
  if (!halfCourt || s.ladder3x3) fouls.push(countRow('teamFouls', scope === 'all' ? 'Team fouls' : `Team fouls (${periodLabel(scope, s.regPeriods)})`, H.teamFouls, A.teamFouls, { lowerBetter: true }));
  if (foulsDrawnOn(s, cov)) {
    fouls.push(countRow('fd', 'Fouls drawn', H.fd, A.fd));
    if (cov.foulsDrawn.tracked < cov.foulsDrawn.of) notes.push(`Fouls drawn tracked on ${cov.foulsDrawn.tracked} of ${cov.foulsDrawn.of} fouls.`);
  }
  if (H.tech || A.tech) fouls.push(countRow('tech', 'Technical fouls', H.tech, A.tech, { lowerBetter: true }));
  if (H.unsport || A.unsport) fouls.push(countRow('unsport', 'Unsportsmanlike / disqualifying', H.unsport, A.unsport, { lowerBetter: true }));
  // US batch 6: coach / bench technicals, once the match logged one
  if (H.benchTech || A.benchTech) fouls.push(countRow('benchTech', 'Coach / bench technicals', H.benchTech, A.benchTech, { lowerBetter: true }));
  if (H.timeouts || A.timeouts) fouls.push(countRow('timeouts', 'Time-outs used', H.timeouts, A.timeouts, { noBar: true }));

  const categories: PanelCategory[] = [
    { key: 'shooting', title: 'Shooting', rows: shooting },
    { key: 'scoring', title: 'Scoring', rows: scoring },
    { key: 'ball', title: 'Rebounds & ball', rows: ball },
    { key: 'fouls', title: 'Fouls', rows: fouls },
  ];
  return compactPanel({ categories, notes });
}
