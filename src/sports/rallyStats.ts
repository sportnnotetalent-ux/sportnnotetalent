/** SD-15 — the stat schema shared by the point-only racket sports (badminton,
 *  pickleball, padel, squash, table tennis): the credited `points`, plus the
 *  SD-19 match record every line carries from the absolute `statTotals`
 *  (src/sports/racketTotals.ts), plus the SD-22 serve / return keys replayed
 *  from the point log (src/sports/serveStats.ts). PURE. */
import type { SportId } from '../core/types';
import type { AwardDef, MvpDef, Qualifier, SectionDef, SportStatSchema, StatDef } from './statSchema.ts';
import { ACES, POINTS } from './sharedStats.ts';
import {
  DETAIL_HOWS, HOW_KEY, NET_KEY, NET_WORDS, RALLY_LABEL, STROKES, STROKES_CONCEDED, THIRD_LABEL, THIRD_SHOTS, TT_PHASE_LABEL, WINGS, WING_LABEL,
  hasNetFlag, hasThirdShot, rallyBucketsOf, rallyKey, shotIdsOf, shotKey, shotLabel, strokeKey, wingKey,
  type DepthSport, type DetailSport, type ThirdShot,
} from './pointDetail.ts';

// 'present' (SD-24): absolute statTotals keys, tracked wherever they're on the line
const rec = (key: string, label: string, short: string, one: string): StatDef =>
  ({ key, label, short, one, group: 'record', coverage: 'present' });

/** SD-19 — the record keys `statTotals` writes on every racket line (group
 *  'record': career totals, never the per-match history line). `sets` adds the
 *  set + tiebreak keys (tennis, padel). Display beyond totals is SD-24. */
export function racketRecordStats(sets: boolean, weighted = false): StatDef[] {
  // SD-27 — `weighted`: the per-match Player of the Match favours the side that
  // won (games ×2, sets ×4) over whoever was credited the most rally points
  const w = (d: StatDef, weight: number): StatDef => (weighted ? { ...d, weight } : d);
  return [
    rec('ptsWon', 'Points won', 'points won', 'point won'),
    rec('ptsLost', 'Points lost', 'points lost', 'point lost'),
    w({ ...rec('gamesWon', 'Games won', 'games won', 'game won'), leaderLabel: 'Most games won' }, 2),
    rec('gamesLost', 'Games lost', 'games lost', 'game lost'),
    ...(sets ? [
      w({ ...rec('setsWon', 'Sets won', 'sets won', 'set won'), leaderLabel: 'Most sets won' }, 4),
      rec('setsLost', 'Sets lost', 'sets lost', 'set lost'),
    ] : []),
    // the deciding set (tennis / padel) or game — one label for every sport
    rec('decidersPlayed', 'Deciders', 'deciders', 'decider'),
    rec('decidersWon', 'Deciders won', 'deciders won', 'decider won'),
    ...(sets ? [
      rec('tiebreaksPlayed', 'Tiebreaks', 'tiebreaks', 'tiebreak'),
      rec('tiebreaksWon', 'Tiebreaks won', 'tiebreaks won', 'tiebreak won'),
    ] : []),
  ];
}

const rate = (key: string, label: string, num: string | string[], den: string | string[], extra: { qualifier?: Qualifier; leaderLabel?: string; tieBreak?: StatDef['tieBreak'] } = {}): StatDef => ({
  key, label, source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
  agg: { kind: 'rate', num, den, scale: 100, dp: 0, ...(extra.qualifier ? { qualifier: extra.qualifier } : {}) },
  ...(extra.leaderLabel ? { leaderLabel: extra.leaderLabel } : {}),
  ...(extra.tieBreak ? { tieBreak: extra.tieBreak } : {}),
});

/**
 * SD-27 — leaderboard minimums for racket rates (organisers can change them
 * per tournament). Sized for a school event of 3–6 matches:
 *   - win % / games won %: 3 matches;
 *   - service points won %: 30 service points (≈ one badminton match);
 *   - service games held %: 6 service games; break points converted %: 5 chances.
 */
export const RACKET_MINIMUMS = {
  matches: { games: 3, unit: { label: 'matches', one: 'match' } } as Qualifier,
  srvPts: { den: 30, unit: { label: 'service points', one: 'service point' } } as Qualifier,
  svcGames: { den: 6, unit: { label: 'service games', one: 'service game' } } as Qualifier,
  bpOpps: { den: 5, unit: { label: 'break point chances', one: 'break point chance' } } as Qualifier,
};

/** SD-27 — the match record as leaderboard stats: matches won (ranks the
 *  Player of the Tournament) and win % over decided matches (min matches).
 *  `share` = the record share that breaks a tie last (sets won % for tennis /
 *  padel, games won % otherwise) — the set / game ratio's order. */
export function racketResultStats(share: 'setsPct' | 'gamesPct'): StatDef[] {
  return [
    { key: 'matchesWon', label: 'Matches won', short: 'wins', one: 'win', leaderLabel: 'Most wins', source: 'derived', group: 'record',
      agg: { kind: 'result', count: ['W'] }, tieBreak: [{ key: 'winPct', better: 'higher' }, { key: share, better: 'higher' }] },
    { key: 'winPct', label: 'Win %', leaderLabel: 'Best win %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'result', count: ['W'], of: ['W', 'L', 'D', 'T'], scale: 100, dp: 0, qualifier: RACKET_MINIMUMS.matches },
      tieBreak: [{ key: 'matchesWon', better: 'higher' }, { key: share, better: 'higher' }] },
  ];
}

/** SD-27 — racket leaderboard categories (by results, never rally points). */
export function racketLeaders(sets: boolean, extra: string[] = []): string[] {
  return ['matchesWon', 'winPct', ...(sets ? ['setsWon'] : []), 'gamesWon', ...(sets ? [] : ['gamesPct']), ...extra, 'srvPtsPct', ...(sets ? ['holdPct', 'bpWonPct'] : [])];
}

/** SD-27 — the racket Player of the Tournament: most matches won, then the
 *  best win %, then the set ratio (games ratio where there are no sets). */
export function racketMvp(sets: boolean): MvpDef {
  return { stat: 'matchesWon', tieBreak: [{ key: 'winPct', better: 'higher' }, { key: sets ? 'setsPct' : 'gamesPct', better: 'higher' }] };
}

/** SD-27 — the racket tournament slot after the Player of the Tournament:
 *  the best service points won % (min service points). Tournament only. */
export const BEST_SERVER: AwardDef = {
  stat: 'srvPtsPct', icon: '🎯', label: 'Best server', match: false, tieBreak: [{ key: 'srvPtsWon', better: 'higher' }],
};
const pair = (key: string, label: string, a: string | string[], b: string | string[]): StatDef => ({
  key, label, source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a, b },
});

/** SD-24 — the racket career's match-play figures over the SD-19 record keys:
 *  W-L pairs and won %. `sets` adds sets and tiebreaks (tennis, padel). */
export function racketCareerStats(sets: boolean): StatDef[] {
  return [
    ...(sets ? [
      pair('setsWL', 'Sets W-L', 'setsWon', 'setsLost'),
      rate('setsPct', 'Sets won %', 'setsWon', ['setsWon', 'setsLost']),
    ] : []),
    pair('gamesWL', 'Games W-L', 'gamesWon', 'gamesLost'),
    rate('gamesPct', 'Games won %', 'gamesWon', ['gamesWon', 'gamesLost'], { qualifier: RACKET_MINIMUMS.matches, leaderLabel: 'Best games won %', tieBreak: [{ key: 'gamesWon', better: 'higher' }] }),
    pair('ptsWL', 'Points W-L', 'ptsWon', 'ptsLost'),
    rate('ptsPct', 'Points won %', 'ptsWon', ['ptsWon', 'ptsLost']),
    pair('decidersWL', 'Deciders W-L', 'decidersWon', ['decidersPlayed', '-decidersWon']),
    ...(sets ? [pair('tiebreaksWL', 'Tiebreaks W-L', 'tiebreaksWon', ['tiebreaksPlayed', '-tiebreaksWon'])] : []),
  ];
}

/** SD-24 — the racket career sections (the record / partner / titles block
 *  above them is the shared framework's, src/data/career.ts). `serveFirst`
 *  rows (tennis aces / double faults) lead the serve section. */
export function racketSections(sets: boolean, serveFirst: { stat: string }[] = []): SectionDef[] {
  return [
    { id: 'match', title: 'Match play', rows: [
      ...(sets ? [{ stat: 'setsWL' }, { stat: 'setsPct' }] : []),
      { stat: 'gamesWL' }, { stat: 'gamesPct' }, { stat: 'ptsWL' }, { stat: 'ptsPct' },
      { stat: 'decidersWL' }, ...(sets ? [{ stat: 'tiebreaksWL' }] : []),
    ] },
    { id: 'serve', title: 'Serve & return', rows: [
      ...serveFirst,
      { stat: 'srvPtsPct' }, { stat: 'rcvPtsPct' },
      ...(sets ? [{ stat: 'holdPct' }, { stat: 'breakPct' }, { stat: 'bpSavedPct' }, { stat: 'bpWonPct' }] : []),
    ] },
    { id: 'points', title: 'Scoring', rows: [{ stat: 'points', label: 'Points scored' }] },
  ];
}

/** SD-22 — the career serve / return keys every racket line gets from the
 *  replay (`serveCareerKeys`), and the rates built on them. Group 'record'
 *  (career, not the history row). Coverage-aware: a line without the server-
 *  side keys (doubles where the server isn't named) is left out of the rate's
 *  numerator AND denominator, never read as 0%. `sets` adds holds / breaks and
 *  break points (tennis, padel). */
export function racketServeStats(sets: boolean): StatDef[] {
  return [
    rec('srvPts', 'Service points', 'service points', 'service point'),
    rec('srvPtsWon', 'Service points won', 'service points won', 'service point won'),
    rec('rcvPts', 'Return points', 'return points', 'return point'),
    rec('rcvPtsWon', 'Return points won', 'return points won', 'return point won'),
    rate('srvPtsPct', 'Service points won %', 'srvPtsWon', 'srvPts', { qualifier: RACKET_MINIMUMS.srvPts, leaderLabel: 'Service points won %', tieBreak: [{ key: 'srvPtsWon', better: 'higher' }] }),
    rate('rcvPtsPct', 'Return points won %', 'rcvPtsWon', 'rcvPts'),
    ...(sets ? [
      rec('svcGames', 'Service games', 'service games', 'service game'),
      rec('svcHeld', 'Service games held', 'holds', 'hold'),
      rec('rtnGames', 'Return games', 'return games', 'return game'),
      rec('breaks', 'Breaks of serve', 'breaks', 'break'),
      rec('bpFaced', 'Break points faced', 'break points faced', 'break point faced'),
      rec('bpSaved', 'Break points saved', 'break points saved', 'break point saved'),
      rec('bpOpps', 'Break point chances', 'break point chances', 'break point chance'),
      rec('bpWon', 'Break points converted', 'break points converted', 'break point converted'),
      rate('holdPct', 'Service games held %', 'svcHeld', 'svcGames', { qualifier: RACKET_MINIMUMS.svcGames, leaderLabel: 'Service games held %', tieBreak: [{ key: 'svcHeld', better: 'higher' }] }),
      rate('breakPct', 'Return games won %', 'breaks', 'rtnGames'),
      rate('bpSavedPct', 'Break points saved %', 'bpSaved', 'bpFaced'),
      rate('bpWonPct', 'Break points converted %', 'bpWon', 'bpOpps', { qualifier: RACKET_MINIMUMS.bpOpps, leaderLabel: 'BP converted %', tieBreak: [{ key: 'bpWon', better: 'higher' }] }),
    ] : []),
  ];
}

// ------------------------------------------------ SD-107 point detail --

/** A point-detail key: written by statTotals only on a match that tracked
 *  point detail ('present' — a line without it reads "not tracked"). */
const shot = (key: string, label: string, short: string, one: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, short, one, group: 'shots', coverage: 'keyed', ...extra });

const HOW_DEFS: Record<string, StatDef> = {
  winners: shot('winners', 'Winners', 'winners', 'winner', { abbr: 'W', weight: 1 }),
  unforcedErrors: shot('unforcedErrors', 'Unforced errors', 'unforced errors', 'unforced error', { abbr: 'UE', format: { unit: 'count', better: 'lower' }, weight: -1 }),
  forcedErrors: shot('forcedErrors', 'Forced errors', 'forced errors', 'forced error', { abbr: 'FE', format: { unit: 'count', better: 'lower' } }),
  serviceWinners: shot('serviceWinners', 'Service winners', 'service winners', 'service winner', { abbr: 'SW', weight: 1 }),
  serviceFaults: shot('serviceFaults', 'Service faults', 'service faults', 'service fault', { abbr: 'SF', format: { unit: 'count', better: 'lower' }, weight: -1 }),
  aces: { ...ACES, group: 'shots', coverage: 'keyed', weight: 2 },
  strokesWon: shot('strokesWon', 'Strokes won', 'strokes won', 'stroke won'),
  [STROKES_CONCEDED]: shot(STROKES_CONCEDED, 'Strokes conceded', 'strokes conceded', 'stroke conceded', { format: { unit: 'count', better: 'lower' } }),
  noLets: shot('noLets', 'No lets', 'no lets', 'no let', { format: { unit: 'count', better: 'lower' } }),
  [NET_KEY]: shot(NET_KEY, 'Net points won', 'net points won', 'net point won'),
};

/** Deep wave — the words a winner / error / service-fault key reads with
 *  ("Smash winners", "Unforced errors (net kill)", "Service faults (foot
 *  fault)"), as tennis/stats.ts. */
const lowerBetter = { format: { unit: 'count' as const, better: 'lower' as const } };
const WORDS: Record<'winner' | 'ue' | 'fe' | 'sf', { label: (s: string) => string; short: (s: string) => string; one: (s: string) => string; lower?: true }> = {
  winner: { label: (s) => `${s} winners`, short: (s) => `${s.toLowerCase()} winners`, one: (s) => `${s.toLowerCase()} winner` },
  ue: { label: (s) => `Unforced errors (${s.toLowerCase()})`, short: (s) => `unforced errors (${s.toLowerCase()})`, one: (s) => `unforced error (${s.toLowerCase()})`, lower: true },
  fe: { label: (s) => `Forced errors (${s.toLowerCase()})`, short: (s) => `forced errors (${s.toLowerCase()})`, one: (s) => `forced error (${s.toLowerCase()})`, lower: true },
  sf: { label: (s) => `Service faults (${s.toLowerCase()})`, short: (s) => `service faults (${s.toLowerCase()})`, one: (s) => `service fault (${s.toLowerCase()})`, lower: true },
};
const worded = (how: 'winner' | 'ue' | 'fe' | 'sf', key: string, word: string): StatDef =>
  shot(key, WORDS[how].label(word), WORDS[how].short(word), WORDS[how].one(word), WORDS[how].lower ? lowerBetter : {});

/** SD-107 — the point-detail stats of `sport`: winners / errors (+ by stroke),
 *  its serve outcomes, per-match rates and the winners / UE ratio. Deep wave
 *  (not tennis — tennis/stats.ts has its own): winners / UE / FE by wing and
 *  by the sport's shots, errors by type, service faults by type. */
export function pointDetailStats(sport: DetailSport): StatDef[] {
  const out: StatDef[] = [];
  for (const h of DETAIL_HOWS[sport]) {
    out.push(HOW_DEFS[HOW_KEY[h.how]]);
    if (h.how === 'stroke') out.push(HOW_DEFS[STROKES_CONCEDED]);
  }
  if (hasNetFlag(sport)) out.push(HOW_DEFS[NET_KEY]);
  for (const h of DETAIL_HOWS[sport]) {
    for (const st of h.strokes ?? []) {
      const lab = STROKES[st]?.label ?? st;
      out.push(h.how === 'winner'
        ? shot(strokeKey('winner', st)!, `${lab} winners`, `${lab.toLowerCase()} winners`, `${lab.toLowerCase()} winner`)
        : h.how === 'sf'
          ? worded('sf', strokeKey('sf', st)!, lab)
          : shot(strokeKey('ue', st)!, `Unforced errors (${lab.toLowerCase()})`, `unforced errors (${lab.toLowerCase()})`, `unforced error (${lab.toLowerCase()})`, { format: { unit: 'count', better: 'lower' } }));
    }
  }
  if (sport !== 'tennis') {
    const ws = DETAIL_HOWS[sport].filter((h) => h.wingShot).map((h) => h.how as 'winner' | 'ue' | 'fe');
    for (const how of ws) for (const w of WINGS) out.push(worded(how, wingKey(how, w)!, WING_LABEL[w]));
    // one label per shot id across sports (a key shared with tennis or another
    // sport reads the same everywhere): "Drop shot winners", "Return …"
    for (const how of ws) for (const id of shotIdsOf(sport)) out.push(worded(how, shotKey(how, id)!, shotLabel(undefined, id)));
  }
  out.push(
    { key: 'winnersPerMatch', label: 'Winners per match', leaderLabel: 'Most winners per match', source: 'derived', group: 'shots', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: 'winners', dp: 1, qualifier: RACKET_MINIMUMS.matches }, tieBreak: [{ key: 'winners', better: 'higher' }] },
    { key: 'uePerMatch', label: 'Unforced errors per match', source: 'derived', group: 'shots', format: { unit: 'decimal', dp: 1, better: 'lower' },
      agg: { kind: 'perGame', key: 'unforcedErrors', dp: 1 } },
    { key: 'wueRatio', label: 'Winners / UE ratio', source: 'derived', group: 'shots', format: { unit: 'ratio', dp: 2 },
      agg: { kind: 'rate', num: 'winners', den: 'unforcedErrors', dp: 2 } },
  );
  return out;
}

/** SD-107 — the career "Shot making" section (rows nobody tracked hide; a
 *  stroke row shows once the player has one). */
export function shotSection(sport: DetailSport): SectionDef {
  const main = ['winners', 'winnersPerMatch', 'unforcedErrors', 'uePerMatch', 'wueRatio', 'forcedErrors'];
  const extra: string[] = [];
  for (const h of DETAIL_HOWS[sport]) {
    const k = HOW_KEY[h.how];
    if (!main.includes(k)) extra.push(k);
    if (h.how === 'stroke') extra.push(STROKES_CONCEDED);
  }
  if (hasNetFlag(sport)) extra.push(NET_KEY);
  // deep wave — padel net points / pickleball kitchen line (tracked matches only)
  const nw = sport !== 'tennis' ? NET_WORDS[sport] : undefined;
  if (nw) extra.push(nw.keys.won, nw.keys.pct);
  const strokes = DETAIL_HOWS[sport].flatMap((h) => (h.strokes ?? []).map((st) => strokeKey(h.how, st)!));
  // deep wave — by wing, then by shot (a row shows once the player has one)
  const ws = sport === 'tennis' ? [] : DETAIL_HOWS[sport].filter((h) => h.wingShot);
  const wings = ws.flatMap((h) => WINGS.map((w) => wingKey(h.how, w)!));
  const shots = ws.flatMap((h) => shotIdsOf(sport).map((id) => shotKey(h.how, id)!));
  return { id: 'shots', title: 'Shot making', rows: [...main.map((stat) => ({ stat })), ...extra.map((stat) => ({ stat })), ...[...strokes, ...wings, ...shots].map((stat) => ({ stat, hideZero: true }))] };
}

// ------------------------------------- deep wave · rally length, net, 3rd shot --

const pctOf = (key: string, label: string, num: string | string[], den: string | string[], group: string): StatDef => ({
  key, label, source: 'derived', group, format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num, den, scale: 100, dp: 0 },
});
const keyedIn = (group: string) => (key: string, label: string, short: string, one: string): StatDef => ({ key, label, short, one, group, coverage: 'keyed' });

/** Deep wave — the depth keys statTotals writes for `sport` when the match
 *  tracked them (racketMatchStats.ts `racketCareerKeys`), with their rates:
 *    rally length   rl…Pts / rl…Won per bucket (the side's points / won);
 *                   table tennis also serve3Pts / serve3Won (points ending
 *                   by the 4th shot on own serve: serve & 3rd ball) and
 *                   receive4Pts / receive4Won (on the opponent's: receive &
 *                   4th ball) — the three-phase analysis with rl5;
 *    net / kitchen  netPts / netPtsWon (padel, pickleball; the side's);
 *    3rd shot       third{Drop,Drive,Lob} / …Won (pickleball; the serving
 *                   side's 3rd shot and the rallies it won). */
export function racketDepthStats(sport: DepthSport): StatDef[] {
  const out: StatDef[] = [];
  const rally = keyedIn('rally');
  for (const b of rallyBucketsOf(sport)) {
    // the labels tennis' keys of the same name read with (rl04Pts …)
    const k = rallyKey(b), dash = b.replace('-', '–');
    const phase = sport === 'tabletennis' ? TT_PHASE_LABEL[b] : undefined;
    const full = phase ? `${RALLY_LABEL[b]} (${phase.replace(/ \(.*\)$/, '').toLowerCase()})` : RALLY_LABEL[b];
    out.push(
      rally(`${k}Pts`, `Points, rally ${full}`, `points (rally ${dash})`, `point (rally ${dash})`),
      rally(`${k}Won`, `Points won, rally ${full}`, `points won (rally ${dash})`, `point won (rally ${dash})`),
      pctOf(`${k}Pct`, `Points won % · rally ${full}`, `${k}Won`, `${k}Pts`, 'rally'),
    );
  }
  if (sport === 'tabletennis') {
    out.push(
      rally('serve3Pts', 'Serve & 3rd ball points', 'serve & 3rd ball points', 'serve & 3rd ball point'),
      rally('serve3Won', 'Serve & 3rd ball points won', 'serve & 3rd ball points won', 'serve & 3rd ball point won'),
      rally('receive4Pts', 'Receive & 4th ball points', 'receive & 4th ball points', 'receive & 4th ball point'),
      rally('receive4Won', 'Receive & 4th ball points won', 'receive & 4th ball points won', 'receive & 4th ball point won'),
      pctOf('serve3Pct', 'Serve & 3rd ball won %', 'serve3Won', 'serve3Pts', 'rally'),
      pctOf('receive4Pct', 'Receive & 4th ball won %', 'receive4Won', 'receive4Pts', 'rally'),
    );
  }
  const nw = NET_WORDS[sport];
  if (nw) {
    // padel: tennis' net keys and words; pickleball: its own kitchen-line keys
    const net = keyedIn('shots');
    out.push(
      net(nw.keys.pts, nw.points, nw.points.toLowerCase(), nw.one),
      net(nw.keys.won, nw.won, nw.won.toLowerCase(), `${nw.one} won`),
      pctOf(nw.keys.pct, `${nw.won} %`, nw.keys.won, nw.keys.pts, 'shots'),
    );
  }
  if (hasThirdShot(sport)) {
    const third = keyedIn('third');
    const all = THIRD_SHOTS.map((t) => thirdKey(t));
    for (const t of THIRD_SHOTS) {
      const k = thirdKey(t), lab = THIRD_LABEL[t];
      out.push(
        third(k, `${lab}s`, `${lab}s`, lab),
        third(`${k}Won`, `${lab}s · rally won`, `${lab}s (rally won)`, `${lab} (rally won)`),
        pctOf(`${k}Pct`, `Rallies won after a ${lab} %`, `${k}Won`, k, 'third'),
        pctOf(`${k}Share`, `${lab} use %`, k, all, 'third'),
      );
    }
  }
  return out;
}
/** Pickleball 3rd-shot career key: thirdDrop, thirdDrive, thirdLob. */
export const thirdKey = (t: ThirdShot): string => `third${t.charAt(0).toUpperCase()}${t.slice(1)}`;

/** Deep wave — the career sections for the depth keys (rows nobody tracked
 *  hide): Rally length (table tennis: the three phases first) and pickleball's
 *  3rd shot. */
export function racketDepthSections(sport: DepthSport): SectionDef[] {
  const rows = [
    ...(sport === 'tabletennis' ? [{ stat: 'serve3Pct' }, { stat: 'receive4Pct' }] : []),
    ...rallyBucketsOf(sport).map((b) => ({ stat: `${rallyKey(b)}Pct` })),
  ];
  const out: SectionDef[] = [{ id: 'rally', title: sport === 'tabletennis' ? 'Rally phases' : 'Rally length', rows }];
  if (hasThirdShot(sport)) {
    out.push({ id: 'third', title: '3rd shot', rows: THIRD_SHOTS.flatMap((t) => [{ stat: `${thirdKey(t)}Share` }, { stat: `${thirdKey(t)}Pct` }]) });
  }
  return out;
}

/** SD-107 — box columns: winners, unforced and forced errors (shown only when
 *  the match tracked point detail). */
export const DETAIL_BOX = ['winners', 'unforcedErrors', 'forcedErrors'];

/** SD-107 — tennis 1st / 2nd serve (the serving player's keys, tracked only
 *  where "1st / 2nd serve" was on) and their ATP rates. */
export function serveDetailStats(): StatDef[] {
  return [
    { ...rec('srv1Pts', 'Service points (serve tracked)', 'tracked service points', 'tracked service point'), coverage: 'keyed' },
    { ...rec('srv1In', '1st serves in', '1st serves in', '1st serve in'), coverage: 'keyed' },
    { ...rec('srv1Won', '1st serve points won', '1st serve points won', '1st serve point won'), coverage: 'keyed' },
    { ...rec('srv2Pts', '2nd serve points', '2nd serve points', '2nd serve point'), coverage: 'keyed' },
    { ...rec('srv2Won', '2nd serve points won', '2nd serve points won', '2nd serve point won'), coverage: 'keyed' },
    rate('firstServePct', '1st serve in %', 'srv1In', 'srv1Pts'),
    rate('firstServeWonPct', '1st serve points won %', 'srv1Won', 'srv1In'),
    rate('secondServeWonPct', '2nd serve points won %', 'srv2Won', 'srv2Pts'),
  ];
}

export function rallyStats<S extends SportId>(sport: S, icon: string, opts: { sets?: boolean } = {}): SportStatSchema<S> {
  const ds = sport as unknown as DetailSport;
  return {
    sport,
    /** SD-25 — career split chips (line context) */
    splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
    /** SD-137a — leaderboard + awards chips: singles / doubles, best-of */
    leaderSplits: ['discipline', 'format'],
    stats: [
      { ...POINTS, group: 'points', weight: 1 },
      ...racketRecordStats(!!opts.sets, true), ...racketServeStats(!!opts.sets), ...racketCareerStats(!!opts.sets),
      ...racketResultStats(opts.sets ? 'setsPct' : 'gamesPct'),
      // SD-107 — optional point detail (deep wave: + wing / shot / types)
      ...pointDetailStats(ds),
      // deep wave — rally length / phases, net or kitchen line, 3rd shot
      ...(ds === 'tennis' ? [] : racketDepthStats(ds)),
    ],
    sections: [...racketSections(!!opts.sets), shotSection(ds), ...(ds === 'tennis' ? [] : racketDepthSections(ds))],
    careerView: 'sections',
    box: [{ columns: ['points', ...DETAIL_BOX] }],
    // SD-27 (GEN-14): racket leaders and awards rank by results, not rally
    // points; "Top scorer" is retired (kept so published awards keep their icon)
    leaders: racketLeaders(!!opts.sets, ['winnersPerMatch']),
    mvp: racketMvp(!!opts.sets),
    headline: ['points'],
    awards: [{ stat: 'points', icon, label: 'Top scorer', match: false, tournament: false }, BEST_SERVER],
  };
}
