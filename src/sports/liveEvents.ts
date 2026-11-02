/**
 * A sport-agnostic live timeline event. Net/raid sports (badminton, tennis,
 * volleyball, kabaddi) emit these; the generic <LiveTimeline/> renders them.
 * `stamp` is the left-column marker — a minute ("12'"), a game ("G2"), a set,
 * or "Raid" — whatever reads naturally for that sport.
 */
export interface LiveEvent {
  id: number;
  stamp: string;
  icon: string;
  label: string;
  /** IDs-only scoring: racket / volleyball events store no name in here (the
   *  score, a reason); the player's name is put back when shown
   *  (racketNames.ts). An older event's detail may still hold one. */
  detail?: string;
  side?: 'home' | 'away';
  /** Optional structured fields for sports that support timeline correction
   *  (remove/edit a past moment) — e.g. kabaddi. Ignored by sports that don't. */
  kind?: string; // e.g. 'raid' | 'tackle' | 'sub' | 'point' | 'ace'
  points?: number;
  /** @deprecated legacy, read-only (pre IDs-only scoring —
   *  docs/privacy/ids-only-scoring.md): the credited player's name as an older
   *  log stored it. New racket / volleyball events keep `playerId` only; a
   *  reader shows `nameOf(playerId, playerName)`. Other sports still write it
   *  until their stage converts them. */
  playerName?: string;
  /** SD-29: the credited player's id (volleyball points once the court six is
   *  stamped) — sets played reach the right stat line */
  playerId?: string;
  minute?: number;
  half?: number;
  set?: number; // volleyball: which set this point belongs to (per-set stats)
  game?: number; // badminton: which game this point belongs to (per-game stats)
  /** SD-21 — side-out sports: who WON a rally that scored no point (kind
   *  'rally'). `side` keeps its legacy meaning on those events. */
  wonBy?: 'home' | 'away';
  /** SD-104 — tennis: this point (won by `side`) was the opponent's double
   *  fault; the faulting server, if named. Only on points recorded with the
   *  `df` payload flag (older double faults carry no marker). */
  df?: { playerId?: string; /** legacy, read-only (pre IDs-only) */ playerName?: string };
  /** SD-107 — optional point detail (racket sports, "Point detail" on): how
   *  the point was won. Set by POINT_DETAIL; absent on every older point. */
  pd?: import('./pointDetail').PointDetail;
  /** SD-107 — tennis 1st / 2nd serve, on points served while "1st / 2nd
   *  serve" tracking was on (absent = not tracked). A double fault is 2. */
  serve?: 1 | 2;
  /** tennis (tennis-endings-depth FT1): the type of the 1st serve's fault
   *  before this point, and (a double fault) of the 2nd serve's */
  sf1?: import('./pointDetail').FaultKind;
  sf2?: import('./pointDetail').FaultKind;
  /** SD-157 — tennis "Net points" tracking: who came to the net on this
   *  point (set by POINT_DETAIL). Absent = not marked (an older point, or
   *  nobody came in). A legacy `pd.net` means the point winner was at net. */
  atNet?: import('./pointDetail').NetMark;
  /** SD-157 — tennis "Rally length" tracking: the shots in the rally, by
   *  bucket (0–4 · 5–8 · 9+). Absent = not tracked on this point. */
  rallyLen?: import('./pointDetail').RallyBucket;
  /** SD-157 — tennis "Serve speed" tracking: km/h of the serve that started
   *  the point (the 1st serve if it went in, else the 2nd). Absent = none. */
  kmh?: number;
  /** Deep wave (racket) — pickleball "3rd shot" tracking: the serving team's
   *  3rd shot of the rally (drop / drive / lob). Absent = not tracked. */
  third?: import('./pointDetail').ThirdShot;
  /** SD-117b — volleyball "Opp. fault" detail (optional): what went wrong
   *  (VB_ERROR_TYPES key) and the erring OPPONENT (charged `errors`). Only on
   *  faults logged with it. */
  oe?: { type?: string; playerId?: string; /** legacy, read-only (pre IDs-only) */ playerName?: string };
  /** SD-117b — kabaddi: how the raider was tackled (optional chip). */
  tackleType?: string;
  /** SD-53 — racket conduct: on a `kind: 'conduct'` record (warning, game
   *  penalty header, default…) and on a penalty POINT (`kind: 'point'`, `side` =
   *  who it was awarded to). See conduct.ts. Absent on every older event. */
  pen?: import('./conduct').PenMark;
  /** SD-136 — a volleyball sanction record (`kind: 'conduct'`: warning,
   *  expulsion, disqualification, delay warning). A penalty point carries `pen`
   *  instead. See volleyball/sanctions.ts. Absent on every older event. */
  vs?: import('./volleyball/sanctions').VbSanction;
  /** SD-54 — racket timeouts (`kind: 'timeout'`): which one. */
  tmo?: 'timeout' | 'medical' | 'toilet';
  /** racket-batch5 RB14 — a squash video review (`kind: 'review'`): its outcome. */
  rev?: 'upheld' | 'rejected';
  /** SD-54 — when the step was logged (ms, from the action's `payload.at`);
   *  match / game durations are derived from it. Absent on older events. */
  at?: number;
  /** Optional outcome accent for the timeline node/label — e.g. cricket colours a
   *  boundary green, a wicket red, an extra amber. Absent → node uses the side colour. */
  tone?: 'boundary' | 'wicket' | 'extra';
}
