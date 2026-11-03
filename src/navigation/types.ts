import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SportId } from '../core/types';

export type RootStackParamList = {
  /** mode: open on Create account ('up') or Sign in ('in') — guest prompts. */
  Auth: { mode?: 'up' | 'in' } | undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  LiveScoring: {
    sport: SportId;
    homeName: string;
    awayName: string;
    /** full team names (rosters & opponent labels); falls back to short names */
    homeTeamName?: string;
    awayTeamName?: string;
    homeColor?: string;
    awayColor?: string;
    /** when present (and Supabase configured), scores persist & broadcast live */
    matchId?: string;
    /** Score first, sign up later: a guest match kept on this device (no matchId) */
    guestId?: string;
    /** false for viewers — read-only scoreboard */
    canScore?: boolean;
    /** the open tab / "Add scorer" panel — kept in params so they survive an iPhone
     *  background unload (the nav state is saved and restored) */
    tab?: string;
    addScorer?: boolean;
  };
  MatchSquad: {
    matchId: string; side: 'home' | 'away'; teamName: string; sport: SportId; playersPerSide?: number;
    // The team id — lets the picker add/invite players straight to this team's squad.
    teamId?: string;
    // Carried so the picker can hand off to the optional positional editor.
    homeTeamName?: string; awayTeamName?: string; homeColor?: string; awayColor?: string;
    // Which sides the viewer may edit (a captain = own side only); forwarded to the pitch editor.
    editableSides?: ('home' | 'away')[];
    /** players who've already taken part — shown "played", can't be benched (parity #13) */
    lockedIds?: string[];
  };
  CreateTournament: { sport?: SportId; orgId?: string } | undefined;
  CreateCommunity: undefined;
  DiscoverOrgs: undefined;
  Teams: undefined;
  /** cloneOf: a match id to copy (parity #13) — always a friendly, kicks off now */
  ScheduleMatch: { tournamentId?: string; sport?: SportId; cloneOf?: string } | undefined;
  CreateSeries: { tournamentId?: string; sport?: SportId } | undefined;
  Series: { seriesId: string };
  EditMatch: { matchId: string };
  /** structure / groups: start on this format (Quick tournament, MVP 2026-10-31) */
  /** `day` (MVP QT-04): the quick tournament's Today / Tomorrow → the first kick-off */
  GenerateFixtures: { tournamentId: string; sport?: SportId; structure?: 'league' | 'knockout' | 'groups'; groups?: number; day?: 'today' | 'tomorrow' };
  /** MVP 2026-10-31: name, sport, teams, format → the fixtures */
  QuickTournament: { sport?: SportId } | undefined;
  /** Score first, sign up later: a signed-out person's quick game (on this device) */
  /** `from` (growth plan #6): where the visitor came from — measured, never personal */
  GuestGame: { from?: string } | undefined;
  /** SD-134 — a Swiss round: numbered pairings (share / print) + the round results sheet */
  SwissRound: { tournamentId: string; sport?: SportId; round?: number };
  /** bulk schedule import from a spreadsheet (parity #24) */
  ImportSchedule: { tournamentId: string };
  /** SD-154: CSV roster import into a school (org) and/or a team's squad */
  RosterImport: { orgId?: string; teamId?: string };
  /** Student lists (2026-10-27): a school's bulk upload — whole school, one class or section. */
  StudentImport: { orgId: string };
  /** Student lists: the parent's page from the school's email (public: /school-request?c=CODE). */
  SchoolRequest: { c?: string } | undefined;
  AssignScorers: { tournamentId: string };
  TournamentTeams: { tournamentId: string; sport?: SportId };
  Contingents: { tournamentId: string };
  Americano: { tournamentId: string; sport: SportId };
  /** with tournamentId: edits and SAVES that tournament's sport directly (parity #08) */
  SportSettings: { sport: SportId; tournamentId?: string };
  OrganizerDashboard: undefined;
  NotificationPrefs: undefined;
  RegionSettings: undefined;
  Settings: undefined;
  Support: undefined;
  /** Privacy Policy / Terms (public: /privacy, /terms). */
  Legal: { doc: 'privacy' | 'terms' };
  Feedback: undefined;
  /** Short share link /m/<matchId> → resolves to LiveScoring. */
  MatchLink: { matchId: string };
  /** Invite landing (app.sportnnote.in/i/<id>): sign up with the invited number. */
  Invite: { playerId: string; notme?: string };
  /** "Join me on SportnNote": a friend's personal invite (app.sportnnote.in/get/<inviter>). */
  GetApp: { from?: string } | undefined;
  /** Send your personal invite link (WhatsApp / SMS / share / QR). */
  InviteFriend: undefined;
  DeleteAccount: undefined;
  /** In-app messaging (migration 0027). */
  Messages: undefined;
  /** threadId = an existing conversation; playerId = message this player (resumes
   *  or starts). viaGuardian: the player is under 18, so it goes to their guardian. */
  Conversation: { threadId?: string; playerId?: string; title?: string; viaGuardian?: boolean; readOnly?: boolean };
  GuardianLink: undefined;
  /** SD-152: Settings → Your data & privacy. */
  Privacy: undefined;
  /** SD-152: the guardian's confirmation page from the email (public: /guardian-consent?c=CODE). */
  GuardianConsent: { c?: string } | undefined;
  GuardianProof: undefined;
  /** SD-152: a linked guardian manages their child's account. */
  ManageChild: { playerId: string };
  /** Verification fast lanes: a verified school / club confirms members' dates of birth */
  OrgDobs: { orgId: string };
  /** QR-verified certificates: a tournament's organisers issue + print them */
  Certificates: { tournamentId: string };
  /** the public page a certificate's QR opens (app.sportnnote.in/c/CODE) */
  Certificate: { code: string };
  /** a player's career passport — public by code (app.sportnnote.in/pp/CODE);
   *  the player / their parent opens it by playerId (makes the code) */
  Passport: { code?: string; playerId?: string };
  /** a school's / club's hall of fame — public once published (app.sportnnote.in/h/ORG) */
  HallOfFame: { orgId: string };
  /** get a school / college verified — three steps (Owners / Admins) */
  OrgVerify: { orgId: string };
  /** the Head of School confirms who manages it (…/org-confirm?c=CODE) — public */
  OrgConfirm: { c?: string } | undefined;
  /** Support: reported-message queue (migration 0027). */
  MessageReports: undefined;
  /** Golf (field event) — a round's scorecard + leaderboard, and its setup. */
  GolfRound: { eventId: string };
  /** competition/holes are primitives so the web URL round-trips (no objects). */
  GolfRoundSetup: { tournamentId?: string; nextOf?: string; competition?: string; holes?: string } | undefined;
  /** SD-122 — edit a golf course (pars, stroke indexes, tees). */
  GolfCourseEdit: { courseId: string };
  /** Results engine (SD-28): one phase of a timed / measured event — entry + sheet. */
  ResultsEvent: { phaseId: string; tab?: 'enter' | 'sheet' };
  /** SD-90 / SD-91: add a track or field event (category, entrants, rounds, lanes / order, bar heights) to a meet. */
  AthleticsEventSetup: { tournamentId?: string; sport?: 'athletics' | 'swimming' | 'weightlifting' | 'shooting' | 'archery' | 'rowing' | 'canoe' | 'cycling'; mode?: 'road' | 'combined';
    /** SD-128: set up this event of the entries matrix (pre-filled from its ticks) */
    discipline?: string; age?: string; gender?: 'M' | 'F' | 'X';
    /** Run it again: the carried programme event to start from ("ath.100m@U14-M") */
    slot?: string } | undefined;
  /** SD-128: a meet's entries — athletes × events matrix per age group / gender, event caps, bulk add. */
  MeetEntries: { tournamentId: string; sport?: string };
  /** SD-141: the competition rules an organiser picks for an event sport before the meet starts (read-only once results exist). */
  CompetitionRules: { tournamentId: string; sport: string };
  /** SD-129: a meet's timetable (day tabs, now / next, running late, clashes) and its printable sheets. */
  MeetTimetable: { tournamentId: string; day?: string };
  /** SD-130: a meet's record board — historic meet / school records entered or pasted, edited, removed. */
  RecordBoard: { tournamentId: string; sport?: string };
  /** Hidden dev entry point for the results engine (URL /ResultsLab only). */
  ResultsLab: undefined;
  TryNewSport: { sports?: SportId[] } | undefined;
  /** First-run questions (founder 2026-10-31): uses, sports, positions, city, location. */
  Personalise: undefined;
  PlayerProfile: { playerId: string };
  SportProfile: { playerId: string; sport: SportId };
  /** SD-47: head-to-head — player `a` vs `b` (no `b` = "Compare with…" picker),
   *  or team `teamA` vs `teamB`. Names are optional (shown while loading). */
  HeadToHead: { sport: SportId; a?: string; b?: string; teamA?: string; teamB?: string; aName?: string; bName?: string };
  /** asAdmin (parity #12): a manager editing an unclaimed player they added or run.
   *  On web it may come back from the URL as the string 'true'. */
  EditProfile: { playerId: string; asAdmin?: boolean };
  VerificationReview: undefined;
  /** The profile's age & guardian verification, in full (owner or support only). */
  VerificationDetails: { playerId: string };
  /** SportnNote support: every queue on one screen (claims, filters, this week). */
  SupportConsole: undefined;
  CreateListing: undefined;
  Following: undefined;
  Standings: { sport?: SportId; tournamentId?: string } | undefined;
  SportHub: { tournamentId: string; sport: SportId; tournamentName?: string };
  Bracket: { tournamentId?: string; sport?: SportId } | undefined;
  /** SD-138 — one entrant's tournament: group finish → knockout rounds → place */
  TeamJourney: { tournamentId: string; teamId: string; sport?: SportId };
  Team: { teamId: string };
  Squad: { teamId: string };
  /** correct a finished match (parity #05) */
  CorrectMatch: { matchId: string; sport: SportId };
  EditTeam: { teamId: string };
  JoinTournament: { token?: string } | undefined;
  JoinTeam: { token?: string } | undefined;
  /** The multi-sport "Team" (Club) system. Clubs = my teams list; CreateClub =
   *  the simple create flow; ClubHome = the team dashboard; ClubSport = one sport's
   *  profile (captain/VC, squad, roles). See migration 0018. */
  Clubs: undefined;
  /** every tournament that's mine: hosting / playing / officiating / following */
  MyTournaments: undefined;
  CreateClub: { orgId?: string } | undefined;
  ClubHome: { clubId: string };
  ClubSport: { clubId: string; sport: SportId; /** SD-154: one squad (JV, B team) when the club has several */ teamId?: string };
  JoinClub: { token?: string } | undefined;
  ScanQR: undefined;
  /** tab: open on a tab (e.g. 'Settings' right after creating it) */
  Tournament: { tournamentId: string; tab?: string };
  EditTournament: { tournamentId: string };
  /** Run it again (mode 'next', the organisers) / copy anyone's set-up ('clone'). */
  CopyTournament: { tournamentId: string; mode?: 'next' | 'clone' };
  /** Link a tournament run before "Run it again" as this one's earlier edition. */
  LinkEdition: { tournamentId: string };
  Organization: { orgId: string };
  Notifications: undefined;
  Calendar: undefined;
  LineupEditor: {
    matchId: string;
    sport: SportId;
    /** team size — sizes the pitch + which formations are offered (7-a-side etc.) */
    playersPerSide?: number;
    homeTeamName: string;
    awayTeamName: string;
    homeColor?: string;
    awayColor?: string;
    /** Sides the viewer may edit. A captain gets only their own side (no opponent
     *  tab); omitted/both for match runners. */
    editableSides?: ('home' | 'away')[];
  };
  CricketLineup: {
    matchId: string;
    sport: SportId;
    homeTeamName: string;
    awayTeamName: string;
    homeColor?: string;
    awayColor?: string;
    playersPerSide?: number;
    /** players who've already batted/bowled/fielded — can't be removed (parity #13) */
    lockedIds?: string[];
    /** Sides the viewer may edit. A captain gets only their own side (no opponent
     *  tab); omitted/both for match runners. */
    editableSides?: ('home' | 'away')[];
  };
};

export type TabParamList = {
  Home: undefined;
  /** Optional entry state when opened via a "See all" link. */
  Matches: { initialTab?: 'live' | 'upcoming' | 'completed'; initialSport?: SportId } | undefined;
  Organize: undefined;
  /** mode: 'people' is Search (key kept for saved URLs); focus: put the cursor in
   *  the search box (Home 🔍); in: the open result tab (parity #22). */
  Discover: { mode?: 'connect' | 'people'; focus?: boolean; in?: 'all' | 'players' | 'teams' | 'matches' | 'tournaments' } | undefined;
  Profile: undefined;
};
