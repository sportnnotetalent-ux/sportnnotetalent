/** SD-15 — volleyball's stat schema (see ../statSchema.ts). PURE. `points`
 *  includes aces and blocks (SD-04), so their weights are the bonus on top. */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';

/** SD-27 (VB-08) — FIVB ranks its per-set awards (Best Blocker, Best Server)
 *  among players with enough sets on court. Default 5 sets (two matches of a
 *  school event); organisers can change it. */
export const VOLLEYBALL_MIN_SETS: Qualifier = { den: 5, unit: { label: 'sets', one: 'set' } };
const q = VOLLEYBALL_MIN_SETS;
/** SD-81 — attack efficiency / success rank among attackers with at least
 *  this many attempts (organisers can change it). */
export const VOLLEYBALL_MIN_ATTEMPTS: Qualifier = { den: 10, unit: { label: 'attack attempts', one: 'attack attempt' } };
/** Deep wave — FIVB Best Receiver ranks reception efficiency among players
 *  with at least this many receptions (organisers can change it). */
export const VOLLEYBALL_MIN_RECEPTIONS: Qualifier = { den: 10, unit: { label: 'receptions', one: 'reception' } };
import { ACES, BLOCKS, HIGH_POINTS, POINTS } from '../sharedStats.ts';

export const volleyballStats: SportStatSchema<'volleyball'> = {
  sport: 'volleyball',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** SD-137a — tournament / hub leaderboard + awards chips (indoor / beach / 9-a-side) */
  leaderSplits: ['format'],
  /** deep wave — lines from matches that named the aced receiver */
  filters: { acedNamed: (l) => l.stats != null && typeof l.stats.receptionErrors === 'number' },
  stats: [
    { ...POINTS, group: 'attack', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    { ...BLOCKS, group: 'block', weight: 1 },
    { key: 'attackPoints', label: 'Attack pts', short: 'attack pts', abbr: 'ATK', group: 'attack', matchSummary: true },
    // SD-16 — the team's sets won / lost on a line (SD-19's set counts).
    { key: 'setsWon', label: 'Sets won', short: 'sets won', one: 'set won', group: 'record', coverage: 'present' },
    { key: 'setsLost', label: 'Sets lost', short: 'sets lost', one: 'set lost', group: 'record', coverage: 'present' },
    // SD-29 — sets the PLAYER was on court in (the on-court tracker, written
    // absolutely by statTotals): FIVB's per-set denominator. A line without it
    // (older matches) stays out of the per-set figures. Display is SD-27 / SD-81.
    { key: 'setsPlayed', label: 'Sets played', short: 'sets', one: 'set', abbr: 'SP', group: 'record', coverage: 'present' },
    // SD-23 — team-level (the comparison panel): points the side got from the
    // opponent's errors
    { key: 'oppErrors', label: 'Opp. errors', short: 'opp. errors', one: 'opp. error', source: 'team' },
    // Service errors: the side's on the comparison panel (team figure, SD-23);
    // SD-58 / SD-81 — and the SERVER's on a player line once serve tracking
    // names who missed (keyed: only a match that named one; older matches and
    // matches without the toss read "not tracked", never 0).
    { key: 'serveErrors', label: 'Serve errors', short: 'serve errors', one: 'serve error', abbr: 'SE', group: 'serve', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // SD-117b — faults the player committed (an "Opp. fault" that named the
    // erring player). Optional detail: tracked only in a match that named one
    // (statTotals writes it on every line then), "not tracked" elsewhere.
    { key: 'errors', label: 'Errors', short: 'errors', one: 'error', abbr: 'ERR', group: 'errors', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // SD-81 (VB-07 / VB-08) — the optional "Detailed stats" mode (detail.ts):
    // every attack swing by result, and reception grades. 'keyed': only a
    // match that captured them carries the keys; older matches read "not
    // tracked", never 0.
    { key: 'attackAttempts', label: 'Attack attempts', short: 'attack attempts', one: 'attack attempt', abbr: 'ATT', group: 'attack', coverage: 'keyed' },
    { key: 'attackKills', label: 'Kills', short: 'kills', one: 'kill', abbr: 'K', group: 'attack', coverage: 'keyed' },
    { key: 'attackErrors', label: 'Attack errors', short: 'attack errors', one: 'attack error', abbr: 'AE', group: 'attack', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    { key: 'attacksBlocked', label: 'Attacks blocked', short: 'attacks blocked', one: 'attack blocked', abbr: 'BLKD', group: 'attack', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // NCAA hitting % / FIVB VIS attack efficiency: (kills − errors − blocked) ÷ attempts
    { key: 'attackEff', label: 'Attack efficiency', abbr: 'EFF', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: ['attackKills', '-attackErrors', '-attacksBlocked'], den: 'attackAttempts', scale: 100, dp: 1, qualifier: VOLLEYBALL_MIN_ATTEMPTS },
      tieBreak: [{ key: 'attackKills', better: 'higher' }] },
    // FIVB Best Attacker (success %): kills ÷ attempts
    { key: 'attackSuccess', label: 'Attack success %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: 'attackKills', den: 'attackAttempts', scale: 100, dp: 1, qualifier: VOLLEYBALL_MIN_ATTEMPTS },
      tieBreak: [{ key: 'attackKills', better: 'higher' }] },
    { key: 'receptions', label: 'Receptions', short: 'receptions', one: 'reception', abbr: 'REC', group: 'reception', coverage: 'keyed' },
    { key: 'receptionsPerfect', label: 'Perfect receptions', short: 'perfect receptions', one: 'perfect reception', group: 'reception', coverage: 'keyed' },
    { key: 'receptionsPositive', label: 'Positive receptions', short: 'positive receptions', one: 'positive reception', group: 'reception', coverage: 'keyed' },
    { key: 'receptionPerfectPct', label: 'Perfect reception %', source: 'derived', group: 'reception', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'receptionsPerfect', den: 'receptions', scale: 100, dp: 0 } },
    { key: 'receptionPositivePct', label: 'Positive reception %', source: 'derived', group: 'reception', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'receptionsPositive', den: 'receptions', scale: 100, dp: 0 } },
    // Deep wave (volleyball-kabaddi) — optional "Stats to track" categories.
    // 'keyed': written only by a match that captured the category, so every
    // other match reads "not tracked", never 0.
    // Reception: who was aced (a reception error — FIVB VIS reception errors)
    { key: 'receptionErrors', label: 'Reception errors', short: 'reception errors', one: 'reception error', abbr: 'RE', group: 'reception', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // FIVB Best Receiver: (perfect − errors) ÷ receptions, over matches that
    // named the aced receiver (an older graded match would read too high)
    { key: 'receptionEff', label: 'Reception efficiency', abbr: 'R.EFF', source: 'derived', group: 'reception', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: ['receptionsPerfect', '-receptionErrors'], den: 'receptions', scale: 100, dp: 0, over: 'acedNamed', qualifier: VOLLEYBALL_MIN_RECEPTIONS },
      tieBreak: [{ key: 'receptions', better: 'higher' }] },
    // Defence: digs (FIVB Best Digger = digs per set)
    { key: 'digs', label: 'Digs', short: 'digs', one: 'dig', abbr: 'DIG', group: 'defence', coverage: 'keyed' },
    { key: 'digsPerSet', label: 'Digs per set', abbr: 'DIG/S', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'digs', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'digs', better: 'higher' }] },
    // Setting: the setter named on a kill. FIVB ranks Best Setter by excellent
    // sets per set; ours ranks by set assists per set (founder, round 2: kept)
    { key: 'setAssists', label: 'Set assists', short: 'set assists', one: 'set assist', abbr: 'SET', group: 'setting', coverage: 'keyed' },
    { key: 'setAssistsPerSet', label: 'Set assists per set', abbr: 'SET/S', source: 'derived', group: 'setting', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'setAssists', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'setAssists', better: 'higher' }] },
    // Round 2 (founder) — FIVB Best Libero: excellent digs + excellent
    // receptions per set on court. A logged dig is a successful dig (FIVB
    // "excellent"); a "Perfect" (#) reception grade is FIVB's excellent
    // reception. Only lines that tracked BOTH categories count (perSet over
    // two keys), so a match with digs but no reception grades is no 0.
    { key: 'digsReceptionsPerSet', label: 'Digs + perfect receptions per set', abbr: 'D+R/S', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perSet', key: ['digs', 'receptionsPerfect'], sets: 'setsPlayed', dp: 2, qualifier: q },
      tieBreak: [{ key: 'digs', better: 'higher' }, { key: 'receptionsPerfect', better: 'higher' }] },
    // Serve: rallies served (free once the toss + both rotations are recorded)
    { key: 'serveAttempts', label: 'Serve attempts', short: 'serves', one: 'serve', abbr: 'SRV', group: 'serve', coverage: 'keyed' },
    { key: 'aceRate', label: 'Ace %', source: 'derived', group: 'serve', format: { unit: 'percent', dp: 1 }, agg: { kind: 'rate', num: 'aces', den: 'serveAttempts', scale: 100, dp: 1 } },
    { key: 'pointsPerSet', label: 'Points per set', abbr: 'PTS/S', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'points', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'acesPerSet', label: 'Aces per set', abbr: 'ACE/S', source: 'derived', group: 'serve', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'aces', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'aces', better: 'higher' }] },
    { key: 'blocksPerSet', label: 'Blocks per set', abbr: 'BLK/S', source: 'derived', group: 'block', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'blocks', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'blocks', better: 'higher' }] },
    // SD-24 (VB-08) — the team's sets on the player's lines, and a best match
    { key: 'setsWL', label: 'Sets W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'setsWon', b: 'setsLost' } },
    { key: 'setsPct', label: 'Sets won %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'setsWon', den: ['setsWon', 'setsLost'], scale: 100, dp: 0 } },
    { ...HIGH_POINTS },
  ],
  // SD-24 (VB-08) — FIVB per-set figures over the sets the player was on court
  sections: [
    { id: 'attack', title: 'Attack', rows: [
      { stat: 'points' }, { stat: 'pointsPerSet' }, { stat: 'attackPoints' }, { stat: 'highPoints' },
      // SD-81 — detail-mode matches only (hidden as "not tracked" otherwise)
      { stat: 'attackAttempts' }, { stat: 'attackKills', label: 'Kills (detailed matches)' }, { stat: 'attackErrors' }, { stat: 'attacksBlocked' }, { stat: 'attackEff' }, { stat: 'attackSuccess' },
    ] },
    { id: 'serve', title: 'Serve', rows: [{ stat: 'aces' }, { stat: 'acesPerSet' }, { stat: 'serveErrors' }, { stat: 'serveAttempts' }, { stat: 'aceRate' }] },
    { id: 'block', title: 'Block', rows: [{ stat: 'blocks' }, { stat: 'blocksPerSet' }] },
    { id: 'reception', title: 'Reception', rows: [{ stat: 'receptions' }, { stat: 'receptionPerfectPct' }, { stat: 'receptionPositivePct' }, { stat: 'receptionErrors' }, { stat: 'receptionEff' }] },
    // deep wave — optional categories ("not tracked" rows hide)
    { id: 'defence', title: 'Defence', rows: [{ stat: 'digs' }, { stat: 'digsPerSet' }, { stat: 'digsReceptionsPerSet' }] },
    { id: 'setting', title: 'Setting', rows: [{ stat: 'setAssists' }, { stat: 'setAssistsPerSet' }] },
    { id: 'errors', title: 'Errors', rows: [{ stat: 'errors' }] },
    { id: 'record', title: 'Sets', rows: [{ stat: 'setsPlayed' }, { stat: 'setsWL' }, { stat: 'setsPct' }] },
  ],
  careerView: 'sections',
  // SD-81: ATT / EFF (detail mode), SE and ERR (named) — hidden on a match
  // that didn't capture them
  box: [{ columns: [{ key: 'points', emphasis: true }, 'attackPoints', 'aces', 'blocks', 'attackAttempts', 'attackEff', 'serveErrors', 'errors'] }],
  compare: ['points', 'attackPoints', 'blocks', 'aces', 'oppErrors', 'serveErrors'],
  // SD-27 (VB-08): totals, then FIVB's per-set rates (min sets on court);
  // deep wave: FIVB Best Digger / Setter / Receiver figures (optional categories)
  leaders: ['points', 'attackPoints', 'aces', 'blocks', 'pointsPerSet', 'acesPerSet', 'blocksPerSet', 'attackEff', 'digsPerSet', 'setAssistsPerSet', 'receptionEff'],
  headline: ['points', 'aces'],
  // FIVB individual awards. Best Scorer = attack + block + serve points (all in
  // `points` since SD-04); Best Server / Blocker by aces / blocks per set.
  // SD-81: Best Attacker by attack efficiency (min attempts) from matches
  // scored in "Detailed stats"; "Most attack points" stays for every match.
  // Setter / libero / receiver / digger: optional categories (below).
  awards: [
    { stat: 'points', icon: '🏐', label: 'Top scorer', tournamentLabel: 'Best scorer', tieBreak: [{ key: 'pointsPerSet', better: 'higher' }] },
    { stat: 'aces', icon: '💥', label: 'Aces', tournamentLabel: 'Best server', rankBy: 'acesPerSet' },
    { stat: 'blocks', icon: '🧱', label: 'Blocks', tournamentLabel: 'Best blocker', rankBy: 'blocksPerSet' },
    { stat: 'attackPoints', icon: '⚡', label: 'Attack points', tournamentLabel: 'Most attack points', match: false },
    { stat: 'attackKills', icon: '🎯', label: 'Attack efficiency', tournamentLabel: 'Best attacker', rankBy: 'attackEff', match: false },
    // deep wave — FIVB Best Receiver / Digger / Setter, from matches that
    // tracked the category (tournament slots only). Round 2 (founder): Best
    // Setter stays on set assists per set; + Best Libero (digs + perfect
    // receptions per set, min sets on court); the four slots are offered only
    // when some match of the tournament tracked their category
    // (`onlyIfTracked`).
    { stat: 'receptions', icon: '📥', label: 'Reception efficiency', tournamentLabel: 'Best receiver', rankBy: 'receptionEff', match: false, onlyIfTracked: true },
    { stat: 'digs', icon: '🛡️', label: 'Digs', tournamentLabel: 'Best digger', rankBy: 'digsPerSet', match: false, onlyIfTracked: true },
    { stat: 'setAssists', icon: '🤝', label: 'Set assists', tournamentLabel: 'Best setter', rankBy: 'setAssistsPerSet', match: false, onlyIfTracked: true },
    { stat: 'digsReceptionsPerSet', icon: '🎽', label: 'Digs + perfect receptions per set', tournamentLabel: 'Best libero', match: false, onlyIfTracked: true },
  ],
  scoreUnit: 'sets',
};
