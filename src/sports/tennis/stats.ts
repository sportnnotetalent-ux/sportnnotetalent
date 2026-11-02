/** SD-15 — tennis's stat schema (see ../statSchema.ts). PURE. */
import type { SectionDef, SportStatSchema, StatDef } from '../statSchema.ts';
import { ACES, POINTS } from '../sharedStats.ts';
import { BEST_SERVER, DETAIL_BOX, pointDetailStats, racketCareerStats, racketLeaders, racketMvp, racketRecordStats, racketResultStats, racketSections, racketServeStats, serveDetailStats } from '../rallyStats.ts';
import {
  RALLY_LABEL, RETIRED_TENNIS_KEYS, SHOTS, SHOT_LABEL, WINGS, WING_LABEL, allRallyBuckets, rallyBucketsOf, rallyKey, shotKey, wingKey,
  type How, type RallyBucket, type Shot,
} from '../pointDetail.ts';

// ------------------------------------------------ SD-157 tennis detail --

/** A key written only by a match that tracked it ('keyed': a line without
 *  it reads "not tracked", never 0). */
const keyed = (key: string, label: string, short: string, one: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, short, one, group: 'shots', coverage: 'keyed', ...extra });
const lower = { format: { unit: 'count' as const, better: 'lower' as const } };
const pctRate = (key: string, label: string, num: string, den: string, extra: Partial<StatDef> = {}): StatDef => ({
  key, label, source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num, den, scale: 100, dp: 0 }, ...extra,
});
const kmhRate = (key: string, label: string, num: string, den: string): StatDef => ({
  key, label, source: 'derived', group: 'serve', format: { unit: 'decimal', dp: 0 }, agg: { kind: 'rate', num, den, dp: 0 },
});

/** The words a winner / error key reads with (labels match the other racket
 *  sports' keys of the same name: "Volley winners", "Drop shot winners"). */
const WHAT: Record<'winner' | 'ue' | 'fe', { label: (s: string) => string; short: (s: string) => string; one: (s: string) => string; better?: 'lower' }> = {
  winner: { label: (s) => `${s} winners`, short: (s) => `${s.toLowerCase()} winners`, one: (s) => `${s.toLowerCase()} winner` },
  ue: { label: (s) => `Unforced errors (${s.toLowerCase()})`, short: (s) => `unforced errors (${s.toLowerCase()})`, one: (s) => `unforced error (${s.toLowerCase()})`, better: 'lower' },
  fe: { label: (s) => `Forced errors (${s.toLowerCase()})`, short: (s) => `forced errors (${s.toLowerCase()})`, one: (s) => `forced error (${s.toLowerCase()})`, better: 'lower' },
};
const HOWS: Array<'winner' | 'ue' | 'fe'> = ['winner', 'ue', 'fe'];
const def = (how: 'winner' | 'ue' | 'fe', key: string, word: string, extra: Partial<StatDef> = {}): StatDef =>
  keyed(key, WHAT[how].label(word), WHAT[how].short(word), WHAT[how].one(word), { ...(WHAT[how].better ? lower : {}), ...extra });

/** The retired FH / BH volley winner keys an older line may carry (SD-107):
 *  the "Forehand winners" / "Backhand winners" / "Volley winners" career
 *  rows add them, so older lines read the same as new ones (statTotals
 *  writes them as 0 now, so nothing counts twice). */
const RETIRED_OF: Partial<Record<string, string[]>> = {
  winnersFh: ['winnersFhVolley'], winnersBh: ['winnersBhVolley'], winnersVolley: ['winnersFhVolley', 'winnersBhVolley'],
};
const withRetired = (key: string): Partial<StatDef> => (RETIRED_OF[key] ? { agg: { kind: 'sum', keys: [key, ...RETIRED_OF[key]!] } } : {});

/** Round 2 — the leaderboard minimum for "Fastest serve": serves clocked
 *  over the player's tracked matches (an organiser can change it). */
export const FASTEST_SERVE_MIN = { den: 10, unit: { label: 'serves clocked', one: 'serve clocked' } };

/** The rally-length keys of one bucket (the side's points / won, and the
 *  rate) — labels shared with the other racket sports' keys of that name. */
const rallyDefs = (b: RallyBucket): { pts: StatDef; won: StatDef; pct: StatDef } => {
  const k = rallyKey(b), d = b.replace('-', '–');
  return {
    pts: keyed(`${k}Pts`, `Points, rally ${RALLY_LABEL[b]}`, `points (rally ${d})`, `point (rally ${d})`, { group: 'rally' }),
    won: keyed(`${k}Won`, `Points won, rally ${RALLY_LABEL[b]}`, `points won (rally ${d})`, `point won (rally ${d})`, { group: 'rally' }),
    pct: pctRate(`${k}Pct`, `Points won % · rally ${RALLY_LABEL[b]}`, `${k}Won`, `${k}Pts`, { group: 'rally' }),
  };
};
/** The ATP buckets (0–4 / 5–8 / 9+, as before), then the other scheme's. */
const STD_BUCKETS = rallyBucketsOf('tennis');
const MORE_BUCKETS = allRallyBuckets('tennis').filter((b) => !STD_BUCKETS.includes(b));

/** SD-157 — winners / unforced / forced errors by wing and by shot type,
 *  the retired volley keys, net points, rally length, return in play and
 *  serve speed. */
export function tennisDetailStats(): StatDef[] {
  const out: StatDef[] = [];
  for (const how of HOWS) for (const w of WINGS) { const k = wingKey(how as How, w)!; out.push(def(how, k, WING_LABEL[w], withRetired(k))); }
  for (const how of HOWS) for (const sh of SHOTS) { const k = shotKey(how as How, sh as Shot)!; out.push(def(how, k, SHOT_LABEL[sh].label, withRetired(k))); }
  out.push(
    keyed(RETIRED_TENNIS_KEYS[0], 'Forehand volley winners', 'forehand volley winners', 'forehand volley winner'),
    keyed(RETIRED_TENNIS_KEYS[1], 'Backhand volley winners', 'backhand volley winners', 'backhand volley winner'),
    // net points (the side's: the scorer marks who came in)
    keyed('netPts', 'Net points', 'net points', 'net point'),
    pctRate('netPtsPct', 'Net points won %', 'netPtsWon', 'netPts'),
    // return in play: the opponent's serves that landed in, returned into play
    keyed('rtnInPlay', 'Returns in play', 'returns in play', 'return in play', { group: 'serve' }),
    keyed('rtnInPlayOf', 'Returnable serves', 'returnable serves', 'returnable serve', { group: 'serve' }),
    pctRate('rtnInPlayPct', 'Return in play %', 'rtnInPlay', 'rtnInPlayOf', { group: 'serve' }),
    // rally length (the side's points in each bucket / won): the ATP buckets,
    // then (round 2) the other bucket scheme an organiser may pick
    ...STD_BUCKETS.flatMap((b) => { const r = rallyDefs(b); return [r.pts, r.won]; }),
    ...STD_BUCKETS.map((b) => rallyDefs(b).pct),
    ...MORE_BUCKETS.flatMap((b) => { const r = rallyDefs(b); return [r.pts, r.won, r.pct]; }),
    // serve speed (the serving player's): fastest = the best single match;
    // round 2: a tournament leader once a player has 10 serves clocked
    { key: 'srvKmhMax', label: 'Fastest serve (km/h)', short: 'fastest serve (km/h)', one: 'fastest serve (km/h)', leaderLabel: 'Fastest serve', group: 'serve', coverage: 'keyed',
      format: { unit: 'decimal', dp: 0 }, agg: { kind: 'max', den: 'srvKmhN', qualifier: FASTEST_SERVE_MIN }, tieBreak: [{ key: 'serveKmh', better: 'higher' }] },
    keyed('srvKmhSum', 'Serve speed total (km/h)', 'km/h (serves)', 'km/h (serves)', { group: 'serve' }),
    keyed('srvKmhN', 'Serves with a speed', 'serves with a speed', 'serve with a speed', { group: 'serve' }),
    keyed('srv1KmhSum', '1st serve speed total (km/h)', 'km/h (1st serves)', 'km/h (1st serves)', { group: 'serve' }),
    keyed('srv1KmhN', '1st serves with a speed', '1st serves with a speed', '1st serve with a speed', { group: 'serve' }),
    keyed('srv2KmhSum', '2nd serve speed total (km/h)', 'km/h (2nd serves)', 'km/h (2nd serves)', { group: 'serve' }),
    keyed('srv2KmhN', '2nd serves with a speed', '2nd serves with a speed', '2nd serve with a speed', { group: 'serve' }),
    kmhRate('serveKmh', 'Serve average (km/h)', 'srvKmhSum', 'srvKmhN'),
    kmhRate('firstServeKmh', '1st serve average (km/h)', 'srv1KmhSum', 'srv1KmhN'),
    kmhRate('secondServeKmh', '2nd serve average (km/h)', 'srv2KmhSum', 'srv2KmhN'),
    // tennis-endings-depth FT1 — the serving player's faults by type (1st serves and double faults)
    keyed('srvFaultNet', 'Serve faults into the net', 'serve faults into the net', 'serve fault into the net', { group: 'serve', ...lower }),
    keyed('srvFaultLong', 'Serve faults long', 'serve faults long', 'serve fault long', { group: 'serve', ...lower }),
    keyed('srvFaultWide', 'Serve faults wide', 'serve faults wide', 'serve fault wide', { group: 'serve', ...lower }),
    keyed('srvFootFaults', 'Foot faults', 'foot faults', 'foot fault', { group: 'serve', ...lower }),
  );
  return out;
}

/** SD-157 — the career "Shot making" section (rows nobody tracked hide; a
 *  wing / shot row shows once the player has one). */
function tennisShotSection(): SectionDef {
  const main = ['winners', 'winnersPerMatch', 'unforcedErrors', 'uePerMatch', 'wueRatio', 'forcedErrors', 'serviceWinners', 'winnersReturn', 'ueReturn', 'netPtsWon', 'netPtsPct'];
  const wings = HOWS.flatMap((how) => WINGS.map((w) => wingKey(how as How, w)!));
  const shots = HOWS.flatMap((how) => SHOTS.map((sh) => shotKey(how as How, sh as Shot)!)).filter((k) => !main.includes(k));
  // tennis-endings-depth — errors by direction, points lost by rule (shown once a player has one)
  const depth = ['ueNet', 'ueLong', 'ueWide', 'feNet', 'feLong', 'feWide', 'ruleLosses'];
  return { id: 'shots', title: 'Shot making', rows: [...main.map((stat) => ({ stat })), ...[...wings, ...shots, ...depth].map((stat) => ({ stat, hideZero: true }))] };
}

/** The racket sections, with tennis' serve-speed rows first in Serve & return
 *  (after aces / DF / 1st serve), return in play there, and rally length. */
function tennisSections(): SectionDef[] {
  const base = racketSections(true, [
    { stat: 'aces' }, { stat: 'doubleFaults' }, { stat: 'firstServePct' }, { stat: 'firstServeWonPct' }, { stat: 'secondServeWonPct' },
    { stat: 'srvKmhMax' }, { stat: 'firstServeKmh' }, { stat: 'secondServeKmh' }, { stat: 'serveKmh' },
  ]).map((s) => (s.id === 'serve' ? { ...s, rows: [...s.rows, { stat: 'rtnInPlayPct' }] } : s));
  return [
    ...base,
    tennisShotSection(),
    { id: 'rally', title: 'Rally length', rows: [...STD_BUCKETS, ...MORE_BUCKETS].map((b) => ({ stat: `${rallyKey(b)}Pct` })) },
  ];
}

export const tennisStats: SportStatSchema<'tennis'> = {
  sport: 'tennis',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
  /** SD-137a — tournament / hub leaderboard + awards chips (singles / doubles, best-of) */
  leaderSplits: ['discipline', 'format'],
  stats: [
    { ...POINTS, group: 'points', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    // SD-27 (GEN-14): a double fault costs the match rating a point
    { key: 'doubleFaults', label: 'Double faults', short: 'double faults', one: 'double fault', abbr: 'DF', group: 'serve', format: { unit: 'count', better: 'lower' }, weight: -1 },
    // SD-19 — the match record from the absolute statTotals (racketTotals.ts)
    ...racketRecordStats(true, true),
    // SD-22 — serve / return career keys replayed from the point log (serveStats.ts)
    ...racketServeStats(true),
    // SD-24 — W-L pairs and won % for the career's Match play section
    ...racketCareerStats(true),
    // SD-27 — matches won / win % for the leaders and the Player of the Tournament
    ...racketResultStats('setsPct'),
    // SD-107 — optional point detail and 1st / 2nd serve
    ...pointDetailStats('tennis'),
    ...serveDetailStats(),
    // SD-157 — wing / shot, net points, rally length, return in play, serve speed
    ...tennisDetailStats(),
  ],
  sections: tennisSections(),
  careerView: 'sections',
  box: [{ columns: ['points', 'aces', 'doubleFaults', ...DETAIL_BOX] }],
  // SD-27 (TN-10): results first, never rally points; SD-157: fastest serve
  // last (round 2: with a minimum of 10 serves clocked)
  leaders: [...racketLeaders(true, ['aces', 'winnersPerMatch']), 'srvKmhMax'],
  mvp: racketMvp(true),
  headline: ['points', 'aces'],
  awards: [
    // retired: "Top scorer" isn't a tennis award (kept for published awards' icon)
    { stat: 'points', icon: '🎾', label: 'Top scorer', match: false, tournament: false },
    { stat: 'aces', icon: '💥', label: 'Aces', tournamentLabel: 'Most aces' },
    BEST_SERVER,
  ],
};
