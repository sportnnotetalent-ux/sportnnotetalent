/**
 * Deep wave — netball's broadcast team-stats panel (Champion Data / Super
 * Netball match centre), by quarter, in four categories:
 *   Shooting  · goals, attempts, shooting %, GS and GA, super shots;
 *   Possession· centre passes, centre-pass goals and conversion, goals from
 *               gains, gains and gain-to-goal %, centre pass receives,
 *               feeds and goal assists;
 *   Defence   · intercepts, deflections (gain / no gain), rebounds
 *               (offensive / defensive), pick-ups;
 *   Errors    · turnovers (by type), penalties (contact / obstruction),
 *               sanctions, time-outs.
 * Derived from the log (deep.ts); a figure the match didn't capture is left
 * out (with a note when only part was) — never a false 0. PURE.
 */
import { compactPanel, countRow, maRow, pctOf, type PanelRow, type StatPanelData } from '../statPanel.ts';
import { periodName, totalPeriods, TURNOVER_LABEL, TURNOVER_TYPES, type NetballState } from './engine.ts';
import { centreSplit, cprOn, nbCoverage, nbTeamFigures, type NbScope } from './deep.ts';

/** The periods the panel filters by (Q1 … ET), once there are two. */
export function nbPanelPeriods(s: NetballState): { value: number; label: string }[] {
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  return n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
}

const pctRow = (key: string, label: string, hn: number, hd: number, an: number, ad: number): PanelRow => {
  const hp = pctOf(hn, hd), ap = pctOf(an, ad);
  return { key, label, home: hp == null ? '–' : `${hp}%`, away: ap == null ? '–' : `${ap}%`, h: hp ?? 0, a: ap ?? 0, sub: { home: hd ? `${hn}/${hd}` : '', away: ad ? `${an}/${ad}` : '' } };
};

export function netballPanel(s: NetballState, scope: NbScope = 'all'): StatPanelData {
  const split = centreSplit(s);
  const cov = nbCoverage(s, split);
  const H = nbTeamFigures(s, 'home', scope, split);
  const A = nbTeamFigures(s, 'away', scope, split);
  const notes: string[] = [];

  /* ---- shooting ---- */
  const shooting: PanelRow[] = [countRow('goals', 'Goals', H.goals, A.goals)];
  if (cov.superShot) {
    shooting.push(countRow('points', 'Score (points)', H.points, A.points));
    shooting.push(maRow('superShots', 'Super shots', H.superShots, H.superShotAttempts, A.superShots, A.superShotAttempts));
  }
  shooting.push(maRow('shooting', 'Goals / attempts', H.goals, H.attempts, A.goals, A.attempts));
  for (const p of ['GS', 'GA'] as const) {
    if (H.byPos[p].attempts || A.byPos[p].attempts) shooting.push(maRow(`pos:${p}`, p === 'GS' ? 'Goal shooter' : 'Goal attack', H.byPos[p].goals, H.byPos[p].attempts, A.byPos[p].goals, A.byPos[p].attempts));
  }
  shooting.push(countRow('misses', 'Missed shots', H.attempts - H.goals, A.attempts - A.goals, { lowerBetter: true }));

  /* ---- possession ---- */
  const possession: PanelRow[] = [];
  if (s.firstCentre) {
    possession.push(countRow('centrePasses', 'Centre passes', H.centrePasses, A.centrePasses, { noBar: true }));
    possession.push(countRow('cpGoals', 'Centre-pass goals', H.cpGoals, A.cpGoals));
    possession.push(pctRow('cpConv', 'Centre pass to goal', H.cpGoals, H.centrePasses, A.cpGoals, A.centrePasses));
    possession.push(countRow('gainGoals', 'Goals from gains', H.gainGoals, A.gainGoals));
  } else notes.push('Centre-pass figures need the first centre pass (the toss) recorded.');
  if (cov.gains) {
    possession.push(countRow('gains', 'Gains', H.gains, A.gains));
    if (s.firstCentre && H.gainGoals <= H.gains && A.gainGoals <= A.gains) possession.push(pctRow('gainConv', 'Gain to goal', H.gainGoals, H.gains, A.gainGoals, A.gains));
    notes.push('Gains = intercepts + deflections with gain + defensive rebounds + pick-ups + the other team’s turnovers, as logged.');
  }
  if (cprOn(s, cov)) {
    possession.push(countRow('cpr', 'Centre pass receives', H.cpr, A.cpr));
    if (cov.cpr.of > 0 && cov.cpr.logged < cov.cpr.of && scope === 'all') notes.push(`Centre pass receives logged for ${cov.cpr.logged} of ${cov.cpr.of} centre passes.`);
  }
  // batch 6: toss-ups won (only once one is logged)
  if (H.tossUps || A.tossUps) possession.push(countRow('tossUps', 'Toss-ups won', H.tossUps, A.tossUps));
  // no-false-zeros NZC8: only once a feed was logged ("Feeds & rebounds" on
  // with every feeder skipped would show Feeds 0 · Goal assists 0)
  if (cov.feeds) {
    possession.push(countRow('feeds', 'Feeds', H.feeds, A.feeds));
    possession.push(countRow('goalAssists', 'Goal assists', H.goalAssists, A.goalAssists));
  }

  /* ---- defence ---- */
  const defence: PanelRow[] = [countRow('intercepts', 'Intercepts', H.intercepts, A.intercepts)];
  defence.push({
    ...countRow('deflections', 'Deflections', H.deflections, A.deflections),
    ...(cov.deflections.typed ? { sub: { home: `gain ${H.deflGain} · no gain ${H.deflNoGain}`, away: `gain ${A.deflGain} · no gain ${A.deflNoGain}` } } : {}),
  });
  if (cov.deflections.typed && cov.deflections.typed < cov.deflections.of && scope === 'all') notes.push(`Deflection outcome logged for ${cov.deflections.typed} of ${cov.deflections.of} deflections.`);
  defence.push({
    ...countRow('rebounds', 'Rebounds', H.rebounds, A.rebounds),
    ...(cov.rebounds.linked ? { sub: { home: `O ${H.oreb} · D ${H.dreb}`, away: `O ${A.oreb} · D ${A.dreb}` } } : {}),
  });
  if (cov.gains) defence.push(countRow('pickups', 'Pick-ups', H.pickups, A.pickups));

  /* ---- turnovers & penalties ---- */
  const errors: PanelRow[] = [countRow('turnovers', 'Turnovers', H.turnovers, A.turnovers, { lowerBetter: true })];
  if (cov.turnovers.typed) {
    for (const t of TURNOVER_TYPES) {
      if (H.byType[t] || A.byType[t]) errors.push(countRow(`tt:${t}`, `· ${TURNOVER_LABEL[t]}`, H.byType[t], A.byType[t], { lowerBetter: true }));
    }
    if (cov.turnovers.typed < cov.turnovers.of && scope === 'all') notes.push(`Turnover type logged for ${cov.turnovers.typed} of ${cov.turnovers.of} turnovers.`);
  }
  errors.push({
    ...countRow('penalties', 'Penalties', H.penalties, A.penalties, { lowerBetter: true }),
    sub: { home: `contact ${H.contacts} · obstruction ${H.obstructions}`, away: `contact ${A.contacts} · obstruction ${A.obstructions}` },
  });
  if (H.warnings || A.warnings) errors.push(countRow('warnings', 'Warnings', H.warnings, A.warnings, { lowerBetter: true }));
  if (H.suspensions || A.suspensions) errors.push(countRow('suspensions', 'Suspensions', H.suspensions, A.suspensions, { lowerBetter: true }));
  if (H.orderedOff || A.orderedOff) errors.push(countRow('orderedOff', 'Ordered off', H.orderedOff, A.orderedOff, { lowerBetter: true }));
  if (s.timeoutsPerHalf > 0 || H.timeouts || A.timeouts) errors.push(countRow('timeouts', 'Team time-outs', H.timeouts, A.timeouts, { noBar: true }));

  return compactPanel({
    categories: [
      { key: 'shooting', title: 'Shooting', rows: shooting },
      { key: 'possession', title: 'Centre pass & possession', rows: possession },
      { key: 'defence', title: 'Defence', rows: defence },
      { key: 'errors', title: 'Turnovers & penalties', rows: errors },
    ],
    notes,
  });
}
