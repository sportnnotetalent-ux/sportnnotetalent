/**
 * Per-sport profile fields — the "expert knowledge" of which dominant-side
 * choices each sport actually needs, and a helpful position hint.
 *
 * A sport can need MORE THAN ONE side dimension: a cricketer can bat
 * right-handed but bowl left-arm; a tennis player has a playing hand and a
 * one/two-handed backhand. Each dimension is independent.
 */
import type { SportId } from '../core/types';

export interface SideField {
  /** stored under SportDetail.sides[key] */
  key: string;
  label: string;
  options: string[];
}

export const SPORT_SIDE_FIELDS: Record<SportId, SideField[]> = {
  // One foot. (Some players are genuinely two-footed.)
  football: [{ key: 'foot', label: 'Preferred foot', options: ['Right', 'Left', 'Both'] }],
  // Batting hand and bowling arm are separate — a right-hand bat can be a
  // left-arm bowler, and many players don't bowl at all.
  cricket: [
    { key: 'bat', label: 'Batting', options: ['Right-handed', 'Left-handed'] },
    { key: 'bowl', label: 'Bowling arm', options: ['Right-arm', 'Left-arm', "Doesn't bowl"] },
    // Deep wave — pace or spin (with the arm above → RF / RM / OB / LB / LF / LM /
    // SLA / LWS); rides free on the scorer's bowler pick (batting vs pace / spin)
    { key: 'bowlType', label: 'Bowling type', options: ['Fast', 'Medium', 'Finger spin', 'Wrist spin'] },
  ],
  // Shooting/dominant hand.
  basketball: [{ key: 'hand', label: 'Dominant hand', options: ['Right', 'Left', 'Both'] }],
  // Racket hand plus the backhand grip — both matter in tennis.
  tennis: [
    { key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] },
    { key: 'backhand', label: 'Backhand', options: ['One-handed', 'Two-handed'] },
  ],
  // Racket hand.
  badminton: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  // Spiking/hitting hand.
  volleyball: [{ key: 'hand', label: 'Hitting hand', options: ['Right', 'Left'] }],
  // Kabaddi has no handedness worth recording — the role (raider/defender) is
  // captured by the position field, so no side dimensions here.
  kabaddi: [],
  // Racquet/paddle sports — just the playing hand.
  pickleball: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  padel: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  squash: [{ key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] }],
  tabletennis: [
    { key: 'hand', label: 'Playing hand', options: ['Right', 'Left'] },
    { key: 'grip', label: 'Grip', options: ['Shakehand', 'Penhold'] },
    { key: 'style', label: 'Style', options: ['Attacker', 'Defender', 'All-round'] },
  ],
  chess: [],
  carrom: [{ key: 'hand', label: 'Striking hand', options: ['Right', 'Left'] }],
  // Cue sports: the cue hand (the bridge hand is the other)
  pool: [{ key: 'hand', label: 'Cue hand', options: ['Right', 'Left'] }],
  snooker: [{ key: 'hand', label: 'Cue hand', options: ['Right', 'Left'] }],
  billiards: [{ key: 'hand', label: 'Cue hand', options: ['Right', 'Left'] }],
  golf: [{ key: 'hand', label: 'Plays', options: ['Right-handed', 'Left-handed'] }],
  // Track: the event group is the "position"; no handedness.
  athletics: [],
  // Hockey sticks are one-sided — no handedness worth recording.
  hockey: [],
  swimming: [],
  weightlifting: [],
  shooting: [{ key: 'eye', label: 'Dominant eye', options: ['Right', 'Left'] }],
  archery: [{ key: 'hand', label: 'Shoots', options: ['Right-handed', 'Left-handed'] }],
  rowing: [{ key: 'side', label: 'Rows', options: ['Stroke side', 'Bow side', 'Both sides / sculls', 'Cox'] }],
  canoe: [{ key: 'side', label: 'Paddles', options: ['Left', 'Right', 'Both (kayak)'] }],
  cycling: [{ key: 'type', label: 'Rides', options: ['Road', 'Track', 'Both'] }],
  // A left-hander is prized on the right side (right back / right wing).
  handball: [{ key: 'hand', label: 'Throwing hand', options: ['Right', 'Left'] }],
  // skaters shoot left / right; goalies catch with the left (regular) or right hand
  ice_hockey: [{ key: 'shoots', label: 'Shoots / catches', options: ['Left', 'Right'] }],
  american_football: [{ key: 'side', label: 'Plays mostly', options: ['Offence', 'Defence', 'Both', 'Special teams'] }],
  // bats / throws — what a scorecard and a manager want to know
  baseball: [{ key: 'bats', label: 'Bats', options: ['Right', 'Left', 'Switch'] }, { key: 'throws', label: 'Throws', options: ['Right', 'Left'] }],
  netball: [{ key: 'area', label: 'Plays mostly', options: ['Shooting circle', 'Midcourt', 'Defence circle'] }],
  rugby: [{ key: 'foot', label: 'Kicking foot', options: ['Right', 'Left', 'Both'] }],
  rugby_league: [{ key: 'foot', label: 'Kicking foot', options: ['Right', 'Left', 'Both'] }],
};

export const POSITION_HINT: Record<SportId, string> = {
  football: 'e.g. Striker, Centre-back, Goalkeeper',
  cricket: 'e.g. Opening batter, All-rounder, Wicket-keeper',
  basketball: 'e.g. Point guard, Center',
  tennis: 'e.g. Singles, Doubles',
  badminton: 'e.g. Singles, Doubles',
  volleyball: 'e.g. Setter, Libero, Outside hitter',
  kabaddi: 'e.g. Raider, Defender, All-rounder',
  pickleball: 'e.g. Singles, Doubles',
  padel: 'e.g. Doubles (left / right)',
  squash: 'e.g. Singles',
  tabletennis: 'e.g. Singles, Doubles',
  chess: 'e.g. Rapid specialist, Board 1',
  carrom: 'e.g. Singles, Doubles',
  pool: 'e.g. 8-Ball, 9-Ball, Scotch doubles',
  snooker: 'e.g. 15 reds, 6 reds',
  billiards: 'e.g. 150-up, Timed',
  golf: 'e.g. Home club, School team', // SD-84: the Handicap Index has its own field
  athletics: 'e.g. Sprints (100 / 200 m), Hurdles, Middle distance',
  hockey: 'e.g. Goalkeeper, Defender, Midfielder, Forward, Drag-flicker',
  swimming: 'e.g. Sprint freestyle, Backstroke, Individual medley',
  weightlifting: 'e.g. Senior men 79 kg, Youth girls 53 kg',
  shooting: 'e.g. 10 m Air Rifle, 10 m Air Pistol, 50 m Rifle 3 Positions',
  archery: 'e.g. Recurve, Compound, Barebow',
  rowing: 'e.g. Sculler, Stroke-side sweep, Cox',
  canoe: 'e.g. Kayak (K1 / K2 / K4), Canoe (C1 / C2)',
  cycling: 'e.g. Time trialist, Sprinter (track), Climber, Endurance (points / scratch)',
  handball: 'e.g. Goalkeeper, Left wing, Left back, Centre back, Right back, Right wing, Pivot',
  ice_hockey: 'e.g. Goalie, Defence, Centre, Left wing, Right wing',
  baseball: 'e.g. Pitcher, Catcher, Shortstop, Centre field',
  netball: 'e.g. GS, GA, WA, C, WD, GD, GK',
  american_football: 'e.g. QB, RB, WR, TE, OL, DL, LB, CB, S, K (flag: QB, C, WR, Rusher, DB)',
  rugby: 'e.g. Prop, Hooker, Lock, Flanker, Number 8, Scrum-half, Fly-half, Centre, Wing, Full-back',
  rugby_league: 'e.g. Fullback, Wing, Centre, Five-eighth / Stand-off, Halfback / Scrum-half, Prop, Hooker, Second row, Lock / Loose forward',
};

/** Tap-to-pick positions for the first-run questions (founder 2026-10-31). Up
 *  to three are saved as the profile's position text ("Striker, Winger"), so
 *  the profile's free-text field still edits them. Empty where a position means
 *  nothing (golf's details are its handicap; weightlifting's is a weight class). */
export const SPORT_POSITIONS: Record<SportId, string[]> = {
  football: ['Goalkeeper', 'Centre-back', 'Full-back', 'Defensive midfielder', 'Central midfielder', 'Attacking midfielder', 'Winger', 'Striker'],
  cricket: ['Opening batter', 'Middle-order batter', 'Wicket-keeper', 'All-rounder', 'Fast bowler', 'Spin bowler'],
  basketball: ['Point guard', 'Shooting guard', 'Small forward', 'Power forward', 'Center'],
  tennis: ['Singles', 'Doubles'],
  badminton: ['Singles', 'Doubles', 'Mixed doubles'],
  volleyball: ['Setter', 'Outside hitter', 'Opposite', 'Middle blocker', 'Libero'],
  kabaddi: ['Raider', 'Left corner', 'Right corner', 'Left cover', 'Right cover', 'All-rounder'],
  pickleball: ['Singles', 'Doubles'],
  padel: ['Left side', 'Right side'],
  squash: ['Singles', 'Doubles'],
  tabletennis: ['Singles', 'Doubles'],
  chess: ['Classical', 'Rapid', 'Blitz'],
  carrom: ['Singles', 'Doubles'],
  pool: ['8-ball', '9-ball', '10-ball'],
  snooker: ['15 reds', '6 reds'],
  billiards: ['150-up', 'Timed'],
  golf: [],
  athletics: ['Sprints', 'Hurdles', 'Middle distance', 'Long distance', 'Relays', 'Jumps', 'Throws', 'Combined events', 'Race walking'],
  hockey: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Drag-flicker'],
  swimming: ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual medley', 'Open water'],
  weightlifting: [],
  shooting: ['10 m Air Rifle', '10 m Air Pistol', '50 m Rifle 3 Positions', '25 m Pistol', 'Trap', 'Skeet'],
  archery: ['Recurve', 'Compound', 'Barebow'],
  rowing: ['Sculler', 'Sweep rower', 'Cox'],
  canoe: ['Kayak', 'Canoe'],
  cycling: ['Sprinter', 'Climber', 'Time trialist', 'Track sprint', 'Track endurance'],
  handball: ['Goalkeeper', 'Left wing', 'Left back', 'Centre back', 'Right back', 'Right wing', 'Pivot'],
  ice_hockey: ['Goalie', 'Defence', 'Centre', 'Left wing', 'Right wing'],
  baseball: ['Pitcher', 'Catcher', 'First base', 'Second base', 'Third base', 'Shortstop', 'Outfield'],
  netball: ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'],
  american_football: ['Quarterback', 'Running back', 'Wide receiver', 'Tight end', 'Offensive line', 'Defensive line', 'Linebacker', 'Cornerback', 'Safety', 'Kicker'],
  rugby: ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Full-back'],
  rugby_league: ['Fullback', 'Wing', 'Centre', 'Stand-off', 'Scrum-half', 'Prop', 'Hooker', 'Second row', 'Loose forward'],
};

/** SD-85 — typed rating fields a sport's profile offers (stored under
 *  `SportDetail.ratings[key]`; no FIDE lookup — the player types them).
 *  Chess: FIDE ID + one rating per FIDE list. */
export interface RatingField {
  key: 'fideId' | 'standard' | 'rapid' | 'blitz';
  label: string;
  placeholder: string;
}
export const SPORT_RATING_FIELDS: Partial<Record<SportId, RatingField[]>> = {
  chess: [
    { key: 'fideId', label: 'FIDE ID', placeholder: 'e.g. 46616543' },
    { key: 'standard', label: 'Standard rating', placeholder: 'e.g. 1650' },
    { key: 'rapid', label: 'Rapid rating', placeholder: 'e.g. 1600' },
    { key: 'blitz', label: 'Blitz rating', placeholder: 'e.g. 1580' },
  ],
};
