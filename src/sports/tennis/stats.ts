/** SD-15 — tennis's stat schema (see ../statSchema.ts). PURE. */
import type { SectionDef, SportStatSchema, StatDef } from '../statSchema.ts';
import { ACES, POINTS } from '../sharedStats.ts';
import { BEST_SERVER, DETAIL_BOX, pointDetailStats, racketCareerStats, racketLeaders, racketMvp, racketRecordStats, racketResultStats, racketSections, racketServeStats, serveDetailStats } from '../rallyStats.ts';
import { RETIRED_TENNIS_KEYS, SHOTS, SHOT_LABEL, WINGS, WING_LABEL, shotKey, wingKey, type How, type Shot } from '../pointDetail.ts';

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
    // rally length (the side's points in each bucket / won)
    keyed('rl04Pts', 'Points, rally 0–4 shots', 'points (rally 0–4)', 'point (rally 0–4)', { group: 'rally' }),
    keyed('rl04Won', 'Points won, rally 0–4 shots', 'points won (rally 0–4)', 'point won (rally 0–4)', { group: 'rally' }),
    keyed('rl58Pts', 'Points, rally 5–8 shots', 'points (rally 5–8)', 'point (rally 5–8)', { group: 'rally' }),
    keyed('rl58Won', 'Points won, rally 5–8 shots', 'points won (rally 5–8)', 'point won (rally 5–8)', { group: 'rally' }),
    keyed('rl9Pts', 'Points, rally 9+ shots', 'points (rally 9+)', 'point (rally 9+)', { group: 'rally' }),
    keyed('rl9Won', 'Points won, rally 9+ shots', 'points won (rally 9+)', 'point won (rally 9+)', { group: 'rally' }),
    pctRate('rl04Pct', 'Points won % · rally 0–4 shots', 'rl04Won', 'rl04Pts', { group: 'rally' }),
    pctRate('rl58Pct', 'Points won % · rally 5–8 shots', 'rl58Won', 'rl58Pts', { group: 'rally' }),
    pctRate('rl9Pct', 'Points won % · rally 9+ shots', 'rl9Won', 'rl9Pts', { group: 'rally' }),
    // serve speed (the serving player's): fastest = the best single match
    { key: 'srvKmhMax', label: 'Fastest serve (km/h)', short: 'fastest serve (km/h)', one: 'fastest serve (km/h)', leaderLabel: 'Fastest serve', group: 'serve', coverage: 'keyed',
      format: { unit: 'decimal', dp: 0 }, agg: { kind: 'max' } },
    keyed('srvKmhSum', 'Serve speed total (km/h)', 'km/h (serves)', 'km/h (serves)', { group: 'serve' }),
    keyed('srvKmhN', 'Serves with a speed', 'serves with a speed', 'serve with a speed', { group: 'serve' }),
    keyed('srv1KmhSum', '1st serve speed total (km/h)', 'km/h (1st serves)', 'km/h (1st serves)', { group: 'serve' }),
    keyed('srv1KmhN', '1st serves with a speed', '1st serves with a speed', '1st serve with a speed', { group: 'serve' }),
    keyed('srv2KmhSum', '2nd serve speed total (km/h)', 'km/h (2nd serves)', 'km/h (2nd serves)', { group: 'serve' }),
    keyed('srv2KmhN', '2nd serves with a speed', '2nd serves with a speed', '2nd serve with a speed', { group: 'serve' }),
    kmhRate('serveKmh', 'Serve average (km/h)', 'srvKmhSum', 'srvKmhN'),
    kmhRate('firstServeKmh', '1st serve average (km/h)', 'srv1KmhSum', 'srv1KmhN'),
    kmhRate('secondServeKmh', '2nd serve average (km/h)', 'srv2KmhSum', 'srv2KmhN'),
  );
  return out;
}

/** SD-157 — the career "Shot making" section (rows nobody tracked hide; a
 *  wing / shot row shows once the player has one). */
function tennisShotSection(): SectionDef {
  const main = ['winners', 'winnersPerMatch', 'unforcedErrors', 'uePerMatch', 'wueRatio', 'forcedErrors', 'serviceWinners', 'winnersReturn', 'ueReturn', 'netPtsWon', 'netPtsPct'];
  const wings = HOWS.flatMap((how) => WINGS.map((w) => wingKey(how as How, w)!));
  const shots = HOWS.flatMap((how) => SHOTS.map((sh) => shotKey(how as How, sh as Shot)!)).filter((k) => !main.includes(k));
  return { id: 'shots', title: 'Shot making', rows: [...main.map((stat) => ({ stat })), ...[...wings, ...shots].map((stat) => ({ stat, hideZero: true }))] };
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
    { id: 'rally', title: 'Rally length', rows: [{ stat: 'rl04Pct' }, { stat: 'rl58Pct' }, { stat: 'rl9Pct' }] },
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
  // SD-27 (TN-10): results first, never rally points; SD-157: fastest serve last
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
