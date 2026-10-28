/** A single timeline event during a football match. */
/** `sinbin` (SD-29): a timed suspension — only when the format sets a sin-bin. */
/** `timeout` (SD-132): a futsal team time-out (Law 7) — only with futsal rules. */
/** `nogoal` (deep wave): a goal ruled out (offside / foul / handball, after a
 *  VAR review or not) — a timeline row only, the score never moved. */
export type FootballEventType = 'goal' | 'owngoal' | 'yellow' | 'red' | 'sub' | 'stoppage' | 'sinbin' | 'timeout' | 'nogoal';

/** Deep wave — where a shot / goal was struck from (Opta: inside / outside
 *  the box). Optional detail ("Shot detail" tracking). */
export type ShotZone = 'box' | 'out';
export const ZONE_LABEL: Record<ShotZone, string> = { box: 'Inside the box', out: 'Outside the box' };

/** Deep wave — why a card was shown (optional, "Card reasons" tracking):
 *  IFAB Law 12 cautions and sending-off offences, as live text reads them. */
export type CardReason = 'foul' | 'dissent' | 'unsporting' | 'spa' | 'timewasting' | 'handball' | 'dogso' | 'sfp' | 'violent' | 'other';
export const CARD_REASONS: CardReason[] = ['foul', 'dissent', 'unsporting', 'spa', 'timewasting', 'handball', 'dogso', 'sfp', 'violent', 'other'];
/** chip label */
export const CARD_REASON_LABEL: Record<CardReason, string> = {
  foul: 'Foul', dissent: 'Dissent', unsporting: 'Unsporting', spa: 'Stopping an attack', timewasting: 'Time-wasting',
  handball: 'Handball', dogso: 'Denying a goal chance', sfp: 'Serious foul play', violent: 'Violent conduct', other: 'Other',
};
/** "… is shown the yellow card for {phrase}" */
export const CARD_REASON_PHRASE: Record<CardReason, string> = {
  foul: 'a bad foul', dissent: 'dissent', unsporting: 'unsporting behaviour', spa: 'stopping a promising attack', timewasting: 'time-wasting',
  handball: 'handball', dogso: 'denying an obvious goal-scoring opportunity', sfp: 'serious foul play', violent: 'violent conduct', other: '',
};

/** Deep wave — why a goal was ruled out. */
export type NoGoalReason = 'offside' | 'foul' | 'handball' | 'other';
export const NO_GOAL_LABEL: Record<NoGoalReason, string> = { offside: 'Offside', foul: 'Foul', handball: 'Handball', other: 'Other' };

export type GoalType = 'open' | 'penalty' | 'freekick' | 'header';

/** How the ball was struck for a goal — captured separately from how it was won. */
export type BodyPart = 'left' | 'right' | 'head' | 'chest';
export const BODY_PART_LABEL: Record<BodyPart, string> = {
  left: 'Left foot',
  right: 'Right foot',
  head: 'Header',
  chest: 'Chest',
};

export interface FootballEvent {
  id: number;
  minute: number;
  type: FootballEventType;
  side: 'home' | 'away';
  /** primary player: scorer / carded player / player coming OFF.
   *  @deprecated legacy, read-only — IDs-only logs (docs/privacy/
   *  ids-only-scoring.md) keep `playerId` only; the name is looked up when
   *  shown (invasion/names.ts `withNames`). Still written for a team
   *  official's card (the typed role, e.g. "Head coach") and a stoppage's
   *  reason — neither is a player. */
  playerName?: string;
  /** secondary: assister (goal) / player coming ON (sub).
   *  @deprecated legacy, read-only — IDs-only logs keep `secondId` only */
  secondName?: string;
  /** how a goal was scored (open play / penalty / free kick / header) */
  goalType?: GoalType;
  /** which half it occurred in — 1/2 in regulation, 3/4 in extra time */
  half?: 1 | 2 | 3 | 4;
  /** a red that resulted from a second yellow (shown as a red badge with a "2") */
  secondYellow?: boolean;
  /** goals: which body part struck it (left/right foot, head, chest) */
  bodyPart?: BodyPart;
  /** SD-09: subs — the ids of the player going off / coming on. SD-30: also
   *  the scorer / carded player / own-goal player (`playerId`) and the
   *  assister (`secondId`) on goals. New matches only; older logs carry names
   *  only and resolve by name (football/totals.ts). */
  playerId?: string;
  secondId?: string;
  /** SD-29: a sin-bin's length in minutes */
  suspendMinutes?: number;
  /** SD-29: a sin-bin's exact match-clock second (the live countdown) */
  sec?: number;
  /** SD-117 (F13, Law 12): a card shown to a team official (coach / staff),
   *  not a player — `playerName` is the official's name (or "Team official").
   *  Never on a player's stat line, never sends a player off. New logs only. */
  official?: true;
  /** deep wave (new logs, when tracked): a goal's zone / big chance; a card's
   *  reason (CardReason) or a ruled-out goal's (NoGoalReason) */
  zone?: ShotZone;
  bigChance?: true;
  reason?: string;
  /** deep wave: a ruled-out goal decided after a VAR review */
  review?: true;
}

/** SD-117 (F13): is this card a player's (not a team official's)? */
export const isPlayerCard = (e: Pick<FootballEvent, 'official'>): boolean => e.official !== true;

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  open: 'Open play',
  penalty: 'Penalty',
  freekick: 'Free kick',
  header: 'Header',
};

export const EVENT_META: Record<FootballEventType, { icon: string; label: string }> = {
  goal: { icon: '⚽', label: 'Goal' },
  owngoal: { icon: '🔃', label: 'Own goal' },
  yellow: { icon: '🟨', label: 'Yellow card' },
  red: { icon: '🟥', label: 'Red card' },
  sub: { icon: '🔄', label: 'Substitution' },
  stoppage: { icon: '⏸️', label: 'Stoppage' },
  sinbin: { icon: '⏱️', label: 'Sin-bin' },
  timeout: { icon: '⏸️', label: 'Time-out' },
  nogoal: { icon: '❎', label: 'Goal ruled out' },
};

/**
 * Granular, player-attributed match stats (FIFA-style team + player breakdown).
 * Each is one tap by the scorer: pick the action, pick the player, (for a shot)
 * pick on/off target. Aggregated they give both team totals and per-player lines.
 */
export type StatKind =
  | 'shot' // onTarget distinguishes on/off target (a goal also counts as a shot on target)
  | 'foul'
  | 'offside'
  | 'corner'
  | 'tackle' // a won defensive tackle — turns possession over
  | 'interception' // turns possession over
  | 'save'
  | 'pass' // complete distinguishes accurate/misplaced (heavy — off by default)
  // Catch-all "positive contribution" buttons — when the scorer can't pick the
  // exact action fast (a dribble vs a through ball; a block vs a clearance),
  // they log the general attacking / defensive contribution instead.
  | 'cross' // a delivery into the box
  | 'dribble' // a completed take-on
  | 'handball' // a handball offence
  | 'attackContribution'
  | 'defenceContribution'
  // Penalty outcomes (recorded via the dedicated penalty flow, not the button grid).
  | 'penaltyWon' // the attacker who won the penalty
  | 'penaltyMissed' // the taker failed to score (saved or off target)
  // SD-08: the defender who blocked a shot (the shot itself is logged as
  // `blocked`, never on target — Opta: shots = on + off + blocked).
  | 'block'
  // Deep wave (optional tracking): the pass that set up a shot (Opta key
  // pass; an assist is the one that set up a goal), a defensive clearance,
  // and the restarts FIFA counts per team (goal kicks, throw-ins).
  | 'keyPass'
  | 'clearance'
  | 'goalKick'
  | 'throwIn';

export interface StatEvent {
  id: number;
  kind: StatKind;
  side: 'home' | 'away';
  playerId?: string;
  /** @deprecated legacy, read-only — IDs-only logs keep `playerId` only */
  playerName?: string;
  /** secondary player — for a foul, who was fouled (the victim).
   *  @deprecated legacy, read-only — IDs-only logs keep `secondId` only */
  secondName?: string;
  /** IDs-only scoring: the fouled player's id (new logs only) */
  secondId?: string;
  minute: number;
  /** shots: was it on target? (a blocked shot is not — SD-08) */
  onTarget?: boolean;
  /** shots: blocked by a defender before reaching goal (SD-08). Older logs
   *  recorded a block as `onTarget: true` with no flag. */
  blocked?: boolean;
  /** passes: was it completed? */
  complete?: boolean;
  /** which half it occurred in — 1/2 in regulation, 3/4 in extra time */
  half?: 1 | 2 | 3 | 4;
  /** deep wave (new logs, "Shot detail" on): where the shot was struck from,
   *  a big chance (Opta), and a shot that hit the post / bar */
  zone?: ShotZone;
  bigChance?: true;
  woodwork?: true;
  /** deep wave: a key pass — the id of the shot it set up */
  ref?: number;
}

export const STAT_META: Record<StatKind, { icon: string; label: string }> = {
  shot: { icon: '🎯', label: 'Shot' },
  foul: { icon: '🟫', label: 'Foul' },
  offside: { icon: '🚩', label: 'Offside' },
  corner: { icon: '⛳', label: 'Corner' },
  tackle: { icon: '🛡️', label: 'Tackle' },
  interception: { icon: '✂️', label: 'Interception' },
  save: { icon: '🧤', label: 'Save' },
  pass: { icon: '➡️', label: 'Pass' },
  cross: { icon: '↗️', label: 'Cross' },
  dribble: { icon: '🏃', label: 'Dribble' },
  handball: { icon: '🤾', label: 'Handball' },
  attackContribution: { icon: '⚡', label: 'Attacking play' },
  defenceContribution: { icon: '🔰', label: 'Defensive play' },
  penaltyWon: { icon: '⚖️', label: 'Penalty won' },
  penaltyMissed: { icon: '✗', label: 'Penalty missed' },
  block: { icon: '🧱', label: 'Block' },
  keyPass: { icon: '🔑', label: 'Key pass' },
  clearance: { icon: '🦶', label: 'Clearance' },
  goalKick: { icon: '🥅', label: 'Goal kick' },
  throwIn: { icon: '🙌', label: 'Throw-in' },
};
