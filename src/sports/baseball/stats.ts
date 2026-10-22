/** SD-144 — baseball / softball stat schema (see ../statSchema.ts). PURE.
 *  Built from the official scorer's figures (OBR 9.00 / WBSC scoring rules):
 *  batting PA AB R H 2B 3B HR RBI BB HBP SO SF SH GDP SB CS and the rates AVG
 *  OBP SLG OPS; pitching IP (outs) H R ER BB SO HR BF pitches, W-L-SV and ERA
 *  / WHIP; fielding PO A E from the scorer's notation (optional). Every line
 *  key is absolute — `statTotals` (./totals.ts) owns the whole line.
 *
 *  ERA reads `erN` (earned runs × the format's innings) so a 7-inning softball
 *  ERA and a 9-inning baseball ERA each come out on their own scale.
 *
 *  Deep wave (all derived by statTotals, `coverage: 'keyed'` so a line from
 *  before them never reads as 0): situational hitting (AB / H with runners in
 *  scoring position → AVG with RISP, two-out RBI), GO / AO and inherited
 *  runners – scored, and — pitch by pitch only — strikes / balls thrown
 *  (strike %), first-pitch strikes (first-pitch strike %). The pitching box
 *  gains a P-S (pitches-strikes) pair.
 *
 *  Round 2 — batted-ball type (only games that tracked it, keyed): batters'
 *  ground balls / line drives / fly balls / popups and the same allowed by
 *  pitchers, with GB % / LD % / FB % / PU % (Statcast: each over all typed
 *  batted balls, popups their own family; house minimum 30 batted balls).
 *  GO-AO now counts a sacrifice bunt as a ground out (founder). */
import type { Qualifier, SportStatSchema, StatDef } from '../statSchema.ts';

/** House minimums (organisers can change them, leaderMins): 10 at bats for
 *  AVG / SLG, 10 plate appearances for OBP / OPS, 3 innings for ERA / WHIP. */
const ab10: Qualifier = { den: 10, unit: { label: 'at bats', one: 'at bat' } };
const pa10: Qualifier = { den: 10, unit: { label: 'plate appearances', one: 'plate appearance' } };
const ip3: Qualifier = { den: 9, unit: { label: 'innings pitched', one: 'inning pitched', per: 3 } };

const OBP_NUM = ['hits', 'baseOnBalls', 'hitByPitch'];
const OBP_DEN = ['atBats', 'baseOnBalls', 'hitByPitch', 'sacFlies'];
/** total bases: H + 2B + 2×3B + 3×HR */
const TB = ['hits', 'twoB', 'threeB', 'threeB', 'homeRuns', 'homeRuns', 'homeRuns'];
const sum = (t: Record<string, number>, ks: string[]) => ks.reduce((a, k) => a + (t[k] ?? 0), 0);

/** Round 2 — batted-ball types (house minimum: 30 typed batted balls for a %). */
const bb30: Qualifier = { den: 30, unit: { label: 'batted balls', one: 'batted ball' } };
const TYPES = [
  { k: 'groundBalls', p: 'pitchGroundBalls', pct: 'groundBallPct', label: 'Ground balls', one: 'ground ball', ab: 'GB' },
  { k: 'lineDrives', p: 'pitchLineDrives', pct: 'lineDrivePct', label: 'Line drives', one: 'line drive', ab: 'LD' },
  { k: 'flyBalls', p: 'pitchFlyBalls', pct: 'flyBallPct', label: 'Fly balls', one: 'fly ball', ab: 'FB' },
  { k: 'popups', p: 'pitchPopups', pct: 'popupPct', label: 'Popups', one: 'popup', ab: 'PU' },
] as const;
const BAT_TYPED = TYPES.map((t) => t.k);
const PITCH_TYPED = TYPES.map((t) => t.p);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** the counts (keyed) and the % of all typed batted balls, batters and pitchers */
function battedBallStats(): StatDef[] {
  return [
    ...TYPES.map((t): StatDef => ({ key: t.k, label: t.label, short: t.label.toLowerCase(), one: t.one, abbr: t.ab, group: 'battedBalls', coverage: 'keyed' })),
    { key: 'battedBalls', label: 'Batted balls (with a type)', short: 'batted balls', one: 'batted ball', abbr: 'BIP', source: 'derived', group: 'battedBalls', coverage: 'keyed', agg: { kind: 'sum', keys: [...BAT_TYPED] } },
    ...TYPES.map((t): StatDef => ({
      key: t.pct, label: `${cap(t.one)} %`, short: `${t.one} %`, abbr: `${t.ab}%`, source: 'derived', group: 'battedBalls', format: { unit: 'percent', dp: 1 }, coverage: 'keyed',
      agg: { kind: 'rate', num: t.k, den: [...BAT_TYPED], scale: 100, dp: 1, qualifier: bb30 }, tieBreak: [{ key: t.k, better: 'higher' }],
    })),
    ...TYPES.map((t): StatDef => ({ key: t.p, label: `${t.label} allowed`, short: `${t.label.toLowerCase()} allowed`, one: `${t.one} allowed`, abbr: t.ab, group: 'pitching', coverage: 'keyed' })),
    { key: 'pitchBattedBalls', label: 'Batted balls allowed (with a type)', short: 'batted balls allowed', one: 'batted ball allowed', abbr: 'BIP', source: 'derived', group: 'pitching', coverage: 'keyed', agg: { kind: 'sum', keys: [...PITCH_TYPED] } },
    ...TYPES.map((t): StatDef => ({
      key: `pitch${cap(t.pct)}`, label: `${cap(t.one)} % (pitching)`, short: `${t.one} % allowed`, abbr: `${t.ab}%`, source: 'derived', group: 'pitching', format: { unit: 'percent', dp: 1 }, coverage: 'keyed',
      agg: { kind: 'rate', num: t.p, den: [...PITCH_TYPED], scale: 100, dp: 1, qualifier: bb30 }, tieBreak: [{ key: t.p, better: 'higher' }],
    })),
  ];
}

export const baseballStats: SportStatSchema<'baseball'> = {
  sport: 'baseball',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** baseball / softball / slow pitch / youth on separate boards */
  leaderSplits: ['format'],
  stats: [
    // batting
    { key: 'plateAppearances', label: 'Plate appearances', short: 'plate appearances', one: 'plate appearance', abbr: 'PA', group: 'batting', weight: 0 },
    { key: 'atBats', label: 'At bats', short: 'at bats', one: 'at bat', abbr: 'AB', group: 'batting', weight: 0 },
    { key: 'runs', label: 'Runs', one: 'run', abbr: 'R', group: 'batting', weight: 2, coverage: 'present' },
    { key: 'hits', label: 'Hits', matchSummary: true, short: 'hits', one: 'hit', abbr: 'H', group: 'batting', weight: 3, tieBreak: [{ key: 'atBats', better: 'lower' }] },
    { key: 'twoB', label: 'Doubles (2B)', short: 'doubles', one: 'double', abbr: '2B', group: 'batting', weight: 1 },
    { key: 'threeB', label: 'Triples (3B)', short: 'triples', one: 'triple', abbr: '3B', group: 'batting', weight: 2 },
    { key: 'homeRuns', label: 'Home runs', matchSummary: true, short: 'home runs', one: 'home run', abbr: 'HR', group: 'batting', weight: 4, tieBreak: [{ key: 'rbi', better: 'higher' }] },
    { key: 'rbi', label: 'Runs batted in', matchSummary: true, short: 'RBI', abbr: 'RBI', group: 'batting', weight: 2, tieBreak: [{ key: 'homeRuns', better: 'higher' }] },
    { key: 'baseOnBalls', label: 'Walks (BB)', short: 'walks', one: 'walk', abbr: 'BB', group: 'batting', weight: 1 },
    { key: 'hitByPitch', label: 'Hit by pitch', short: 'hit by pitch', abbr: 'HBP', group: 'batting', weight: 1 },
    { key: 'strikeouts', label: 'Strikeouts (batting)', short: 'strikeouts', one: 'strikeout', abbr: 'SO', group: 'batting', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'sacFlies', label: 'Sacrifice flies', short: 'sacrifice flies', one: 'sacrifice fly', abbr: 'SF', group: 'batting', weight: 0.5 },
    { key: 'sacBunts', label: 'Sacrifice bunts', short: 'sacrifice bunts', one: 'sacrifice bunt', abbr: 'SH', group: 'batting', weight: 0.5 },
    { key: 'gidp', label: 'Grounded into double plays', short: 'GDP', abbr: 'GDP', group: 'batting', format: { unit: 'count', better: 'lower' }, weight: -1 },
    { key: 'stolenBases', label: 'Stolen bases', matchSummary: true, short: 'stolen bases', one: 'stolen base', abbr: 'SB', group: 'running', weight: 1.5 },
    { key: 'caughtStealing', label: 'Caught stealing', short: 'caught stealing', abbr: 'CS', group: 'running', format: { unit: 'count', better: 'lower' }, weight: -1 },
    // batting rates
    { key: 'battingAvg', label: 'Batting average (AVG)', short: 'AVG', abbr: 'AVG', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: { kind: 'rate', num: 'hits', den: 'atBats', dp: 3, qualifier: ab10 }, tieBreak: [{ key: 'hits', better: 'higher' }] },
    { key: 'obp', label: 'On-base percentage (OBP)', short: 'OBP', abbr: 'OBP', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: { kind: 'rate', num: OBP_NUM, den: OBP_DEN, dp: 3, qualifier: pa10 } },
    { key: 'slg', label: 'Slugging (SLG)', short: 'SLG', abbr: 'SLG', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: { kind: 'rate', num: TB, den: 'atBats', dp: 3, qualifier: ab10 } },
    { key: 'ops', label: 'On-base plus slugging (OPS)', short: 'OPS', abbr: 'OPS', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: {
        kind: 'formula', keys: ['atBats', 'hits', 'twoB', 'threeB', 'homeRuns', 'baseOnBalls', 'hitByPitch', 'sacFlies'], den: 'atBats', qualifier: ab10, dp: 3,
        compute: (t) => {
          const od = sum(t, OBP_DEN);
          if (!(od > 0) || !(t.atBats > 0)) return undefined;
          return sum(t, OBP_NUM) / od + sum(t, TB) / t.atBats;
        },
      }, tieBreak: [{ key: 'hits', better: 'higher' }] },
    { key: 'totalBases', label: 'Total bases', short: 'total bases', one: 'total base', abbr: 'TB', source: 'derived', group: 'batting', agg: { kind: 'sum', keys: TB } },
    // pitching
    { key: 'outsPitched', label: 'Innings pitched', short: 'innings pitched', abbr: 'IP', group: 'pitching', format: { unit: 'innings' }, weight: 1 },
    { key: 'gamesPitched', label: 'Games pitched', short: 'games pitched', one: 'game pitched', abbr: 'GP', group: 'pitching', coverage: 'present' },
    { key: 'battersFaced', label: 'Batters faced', short: 'batters faced', one: 'batter faced', abbr: 'BF', group: 'pitching' },
    { key: 'pitches', label: 'Pitches', short: 'pitches', one: 'pitch', abbr: 'NP', group: 'pitching', coverage: 'present' },
    { key: 'hitsAllowed', label: 'Hits allowed', short: 'hits allowed', one: 'hit allowed', abbr: 'H', group: 'pitching', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'runsAllowed', label: 'Runs allowed', short: 'runs allowed', one: 'run allowed', abbr: 'R', group: 'pitching', format: { unit: 'count', better: 'lower' }, coverage: 'present' },
    { key: 'earnedRuns', label: 'Earned runs', short: 'earned runs', one: 'earned run', abbr: 'ER', group: 'pitching', format: { unit: 'count', better: 'lower' }, weight: -1, coverage: 'present' },
    { key: 'erN', label: 'Earned runs × innings (ERA basis)', short: 'ERA basis', abbr: 'ERN', group: 'pitching', coverage: 'present' },
    { key: 'bbAllowed', label: 'Walks allowed', short: 'walks allowed', one: 'walk allowed', abbr: 'BB', group: 'pitching', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'hbpAllowed', label: 'Hit batters', short: 'hit batters', one: 'hit batter', abbr: 'HB', group: 'pitching', format: { unit: 'count', better: 'lower' } },
    { key: 'kPitched', label: 'Strikeouts (pitching)', matchSummary: true, short: 'strikeouts pitched', one: 'strikeout pitched', abbr: 'SO', group: 'pitching', weight: 1.5,
      tieBreak: [{ key: 'outsPitched', better: 'lower' }] },
    { key: 'hrAllowed', label: 'Home runs allowed', short: 'home runs allowed', one: 'home run allowed', abbr: 'HR', group: 'pitching', format: { unit: 'count', better: 'lower' } },
    { key: 'pitchWins', label: 'Wins (pitching)', short: 'pitching wins', one: 'pitching win', abbr: 'W', group: 'pitching', weight: 4, coverage: 'present',
      tieBreak: [{ key: 'pitchLosses', better: 'lower' }] },
    { key: 'pitchLosses', label: 'Losses (pitching)', short: 'pitching losses', one: 'pitching loss', abbr: 'L', group: 'pitching', format: { unit: 'count', better: 'lower' }, coverage: 'present' },
    { key: 'pitchSaves', label: 'Saves (pitching)', short: 'pitching saves', one: 'pitching save', abbr: 'SV', group: 'pitching', weight: 3, coverage: 'present' },
    { key: 'era', label: 'Earned run average (ERA)', short: 'ERA', abbr: 'ERA', source: 'derived', group: 'pitching', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'erN', den: 'outsPitched', scale: 3, dp: 2, qualifier: ip3 }, tieBreak: [{ key: 'outsPitched', better: 'higher' }] },
    { key: 'whip', label: 'Walks + hits per inning (WHIP)', short: 'WHIP', abbr: 'WHIP', source: 'derived', group: 'pitching', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: ['bbAllowed', 'hitsAllowed'], den: 'outsPitched', scale: 3, dp: 2, qualifier: ip3 }, tieBreak: [{ key: 'outsPitched', better: 'higher' }] },
    // deep wave — situational hitting (derived from the log; keyed: a line from
    // before the deep wave carries none, so it never reads as a 0)
    { key: 'rispAb', label: 'At bats with runners in scoring position', short: 'at bats with RISP', one: 'at bat with RISP', abbr: 'AB RISP', group: 'situational', coverage: 'keyed' },
    { key: 'rispHits', label: 'Hits with runners in scoring position', short: 'hits with RISP', one: 'hit with RISP', abbr: 'H RISP', group: 'situational', coverage: 'keyed', weight: 0.5 },
    { key: 'rispAvg', label: 'Batting average with RISP', short: 'AVG with RISP', abbr: 'RISP', source: 'derived', group: 'situational', format: { unit: 'avg', dp: 3 }, coverage: 'keyed',
      agg: { kind: 'rate', num: 'rispHits', den: 'rispAb', dp: 3, qualifier: { den: 10, unit: { label: 'at bats with RISP', one: 'at bat with RISP' } } }, tieBreak: [{ key: 'rispHits', better: 'higher' }] },
    { key: 'twoOutRbi', label: 'Two-out RBI', short: 'two-out RBI', abbr: '2-out RBI', group: 'situational', coverage: 'keyed', weight: 0.5 },
    // deep wave — pitching from the log: ground outs – fly outs, inherited runners
    { key: 'pitchGroundOuts', label: 'Ground outs (pitching)', short: 'ground outs induced', one: 'ground out induced', abbr: 'GO', group: 'pitching', coverage: 'keyed' },
    { key: 'pitchFlyOuts', label: 'Fly outs (pitching)', short: 'fly outs induced', one: 'fly out induced', abbr: 'AO', group: 'pitching', coverage: 'keyed' },
    { key: 'goAo', label: 'Ground out / fly out ratio', short: 'GO/AO', abbr: 'GO/AO', source: 'derived', group: 'pitching', format: { unit: 'decimal', dp: 2 }, coverage: 'keyed',
      agg: { kind: 'rate', num: 'pitchGroundOuts', den: 'pitchFlyOuts', dp: 2 } },
    { key: 'inheritedRunners', label: 'Inherited runners', short: 'inherited runners', one: 'inherited runner', abbr: 'IR', group: 'pitching', coverage: 'keyed' },
    { key: 'inheritedScored', label: 'Inherited runners scored', short: 'inherited runners scored', one: 'inherited runner scored', abbr: 'IRS', group: 'pitching', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    // deep wave — pitch by pitch only (the game's balls & strikes)
    { key: 'strikesThrown', label: 'Strikes thrown', short: 'strikes thrown', one: 'strike thrown', abbr: 'S', group: 'pitching', coverage: 'keyed' },
    { key: 'ballsThrown', label: 'Balls thrown', short: 'balls thrown', one: 'ball thrown', abbr: 'B', group: 'pitching', coverage: 'keyed' },
    { key: 'strikePct', label: 'Strike %', short: 'strike %', abbr: 'STR%', source: 'derived', group: 'pitching', format: { unit: 'percent', dp: 1 }, coverage: 'keyed',
      agg: { kind: 'rate', num: 'strikesThrown', den: ['strikesThrown', 'ballsThrown'], scale: 100, dp: 1, qualifier: { den: 100, unit: { label: 'pitches', one: 'pitch' } } },
      tieBreak: [{ key: 'strikesThrown', better: 'higher' }] },
    { key: 'firstPitchStrikes', label: 'First-pitch strikes', short: 'first-pitch strikes', one: 'first-pitch strike', abbr: 'FPS', group: 'pitching', coverage: 'keyed' },
    { key: 'firstPitches', label: 'Batters faced (first pitch tracked)', short: 'first pitches', one: 'first pitch', abbr: 'FP', group: 'pitching', coverage: 'keyed' },
    { key: 'firstPitchStrikePct', label: 'First-pitch strike %', short: 'first-pitch strike %', abbr: 'F-STR%', source: 'derived', group: 'pitching', format: { unit: 'percent', dp: 1 }, coverage: 'keyed',
      agg: { kind: 'rate', num: 'firstPitchStrikes', den: 'firstPitches', scale: 100, dp: 1, qualifier: { den: 30, unit: { label: 'batters faced', one: 'batter faced' } } },
      tieBreak: [{ key: 'firstPitchStrikes', better: 'higher' }] },
    // round 2 — batted-ball types (keyed: only games that tracked them)
    ...battedBallStats(),
    // fielding (from the scorer's notation, when asked)
    { key: 'putouts', label: 'Putouts', short: 'putouts', one: 'putout', abbr: 'PO', group: 'fielding', coverage: 'present', weight: 0.25 },
    { key: 'fieldAssists', label: 'Assists (fielding)', short: 'fielding assists', one: 'fielding assist', abbr: 'A', group: 'fielding', coverage: 'present', weight: 0.25 },
    { key: 'fieldErrors', label: 'Errors (fielding)', short: 'fielding errors', one: 'fielding error', abbr: 'E', group: 'fielding', format: { unit: 'count', better: 'lower' }, coverage: 'present', weight: -1 },
    // bests
    { key: 'mostHits', label: 'Most hits in a game', short: 'most hits', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'hits' } },
    { key: 'mostKPitched', label: 'Most strikeouts pitched in a game', short: 'most strikeouts pitched', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'kPitched' } },
    // team-level game figures (the comparison panel), never on a player line
    { key: 'teamErrors', label: 'Errors', short: 'errors', one: 'error', source: 'team' },
    { key: 'leftOnBase', label: 'Left on base', short: 'left on base', source: 'team' },
    { key: 'teamPitches', label: 'Pitches thrown', short: 'pitches thrown', one: 'pitch thrown', source: 'team' },
  ],
  sections: [
    { id: 'batting', title: 'Batting', rows: [
      { stat: 'plateAppearances' }, { stat: 'atBats' }, { stat: 'runs' }, { stat: 'hits' }, { stat: 'twoB', hideZero: true }, { stat: 'threeB', hideZero: true },
      { stat: 'homeRuns' }, { stat: 'rbi' }, { stat: 'baseOnBalls' }, { stat: 'hitByPitch', hideZero: true }, { stat: 'strikeouts' },
      { stat: 'sacFlies', hideZero: true }, { stat: 'sacBunts', hideZero: true }, { stat: 'gidp', hideZero: true },
      { stat: 'battingAvg', label: 'AVG' }, { stat: 'obp', label: 'OBP' }, { stat: 'slg', label: 'SLG' }, { stat: 'ops', label: 'OPS' }, { stat: 'totalBases' },
    ] },
    { id: 'situational', title: 'Situational hitting', rows: [
      { stat: 'rispAvg', label: 'AVG with RISP' }, { stat: 'rispHits' }, { stat: 'rispAb' }, { stat: 'twoOutRbi' },
    ] },
    // round 2 — batted-ball types (tracked games only)
    { id: 'battedBalls', title: 'Batted balls', rows: [
      { stat: 'battedBalls' }, ...TYPES.map((t) => ({ stat: t.pct, label: `${t.ab} %` })),
    ] },
    { id: 'running', title: 'Base running', rows: [{ stat: 'stolenBases' }, { stat: 'caughtStealing', hideZero: true }] },
    { id: 'pitching', title: 'Pitching', leadWhen: 'pitched', rows: [
      { stat: 'gamesPitched' }, { stat: 'pitchWins', label: 'W' }, { stat: 'pitchLosses', label: 'L' }, { stat: 'pitchSaves', label: 'SV', hideZero: true },
      { stat: 'outsPitched', label: 'IP' }, { stat: 'era', label: 'ERA' }, { stat: 'whip', label: 'WHIP' }, { stat: 'hitsAllowed' }, { stat: 'runsAllowed' }, { stat: 'earnedRuns' },
      { stat: 'bbAllowed' }, { stat: 'kPitched' }, { stat: 'hrAllowed' }, { stat: 'hbpAllowed', hideZero: true }, { stat: 'battersFaced' }, { stat: 'pitches' },
      // deep wave
      { stat: 'strikePct', label: 'Strike %' }, { stat: 'firstPitchStrikePct', label: 'First-pitch strike %' }, { stat: 'goAo', label: 'GO/AO' },
      { stat: 'inheritedRunners', hideZero: true }, { stat: 'inheritedScored', hideZero: true },
    ] },
    { id: 'battedBallsAllowed', title: 'Batted balls allowed', rows: [
      { stat: 'pitchBattedBalls' }, ...TYPES.map((t) => ({ stat: `pitch${cap(t.pct)}`, label: `${t.ab} %` })),
    ] },
    { id: 'fielding', title: 'Fielding', rows: [{ stat: 'putouts', hideZero: true }, { stat: 'fieldAssists', hideZero: true }, { stat: 'fieldErrors', hideZero: true }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostHits', label: 'Most hits (game)', hideZero: true }, { stat: 'mostKPitched', label: 'Most strikeouts (game, pitching)', hideZero: true }] },
  ],
  filters: { pitched: (l) => Number(l.stats?.gamesPitched ?? 0) > 0 || Number(l.stats?.outsPitched ?? 0) > 0 },
  careerView: 'sections',
  history: ['hits', 'homeRuns', 'rbi', 'kPitched'],
  box: [
    { title: 'Batting', columns: [
      { key: 'atBats', abbr: 'AB' },
      { key: 'runs', abbr: 'R' },
      { key: 'hits', abbr: 'H', emphasis: true },
      { key: 'rbi', abbr: 'RBI' },
      { key: 'baseOnBalls', abbr: 'BB' },
      { key: 'strikeouts', abbr: 'SO' },
      { key: 'twoB', abbr: '2B', occasional: true },
      { key: 'threeB', abbr: '3B', occasional: true },
      { key: 'homeRuns', abbr: 'HR', occasional: true },
      { key: 'stolenBases', abbr: 'SB', occasional: true },
      { key: 'battingAvg', abbr: 'AVG' },
    ] },
  ],
  compare: [
    'hits', 'homeRuns', 'baseOnBalls', 'strikeouts', 'stolenBases', { key: 'teamErrors', label: 'Errors' }, { key: 'leftOnBase', label: 'Left on base' },
    'battingAvg', { key: 'teamPitches', label: 'Pitches thrown' },
  ],
  leaders: ['battingAvg', 'homeRuns', 'rbi', 'hits', 'ops', 'stolenBases', 'era', 'kPitched', 'whip', 'pitchWins', 'pitchSaves', 'rispAvg', 'twoOutRbi', 'strikePct', 'firstPitchStrikePct', 'pitchGroundBallPct'],
  headline: ['hits', 'homeRuns', 'rbi', 'kPitched'],
  awards: [
    { stat: 'battingAvg', icon: '🏏', label: 'Batting champion', match: false,
      howRanked: 'Best batting average (hits ÷ at bats) among batters with at least {min}. Ties: more hits. You choose the winner.' },
    { stat: 'homeRuns', icon: '💥', label: 'Home run leader', tieBreak: [{ key: 'rbi', better: 'higher' }] },
    { stat: 'rbi', icon: '🏃', label: 'RBI leader', tieBreak: [{ key: 'homeRuns', better: 'higher' }] },
    { stat: 'era', icon: '⚾', label: 'Best ERA', match: false,
      howRanked: 'Lowest earned run average (earned runs × the innings of a game ÷ innings pitched) among pitchers with at least {min}. Ties: more innings. You choose the winner.' },
    { stat: 'kPitched', icon: '🔥', label: 'Strikeout leader', tieBreak: [{ key: 'outsPitched', better: 'lower' }] },
  ],
  scoreUnit: 'runs',
};

/** The pitching box (a second table under the batting one). */
export const baseballPitchingStats: SportStatSchema<'baseball'> = {
  ...baseballStats,
  box: [{ title: 'Pitching', columns: [
    { key: 'outsPitched', abbr: 'IP', emphasis: true },
    { key: 'hitsAllowed', abbr: 'H' },
    { key: 'runsAllowed', abbr: 'R' },
    { key: 'earnedRuns', abbr: 'ER' },
    { key: 'bbAllowed', abbr: 'BB' },
    { key: 'kPitched', abbr: 'SO' },
    { key: 'hrAllowed', abbr: 'HR', occasional: true },
    { key: 'pitches', abbr: 'NP' },
    // deep wave: pitches-strikes with pitch-by-pitch on (NP hides then — ./box.ts)
    { key: 'ps', abbr: 'P-S', label: 'Pitches-strikes', pair: ['pitches', 'strikesThrown'] },
    { key: 'era', abbr: 'ERA' },
  ] }],
  compare: [],
};
