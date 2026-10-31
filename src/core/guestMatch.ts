/**
 * Score first, sign up later (growth plan, 2026-10-31;
 * docs/security/breaks/guest-scoring.md). A guest's friendly lives only on
 * this device until they have an account; it is scored by the same screen and
 * engines with no match id. Signing up "claims" it: the teams and match are
 * created as theirs, the taps uploaded (idempotent by client id), the board
 * saved. Pure: storage and the server are passed in. Tests: tests/guest-match.test.mts.
 */
import type { MatchEventRecord, MatchResult, SportId } from './types';
import type { ScoreAction } from '../sports/types';

export const GUEST_PREFIX = 'guest-';
export const isGuestId = (id: string | undefined | null): boolean => !!id && id.startsWith(GUEST_PREFIX);

export interface GuestMatch {
  id: string;
  sport: SportId;
  homeName: string;
  awayName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeColor: string;
  awayColor: string;
  /** the format picked on the guest setup */
  config: Record<string, unknown>;
  createdAt: string;
  events: MatchEventRecord[];
  /** a hand-ended result (end-match sheet) */
  result?: MatchResult | null;
  /** G4: set when THIS person asked to share / save, so only their sign-up claims it */
  claimRequested?: boolean;
  /** G3: what the claim has done so far, so a retry resumes instead of repeating */
  claim?: { homeTeamId?: string; awayTeamId?: string; matchId?: string; /** taps confirmed so far (by seq) */ uploadedSeq?: number };
}

export function newGuestMatch(
  input: Pick<GuestMatch, 'sport' | 'homeName' | 'awayName' | 'homeTeamName' | 'awayTeamName' | 'homeColor' | 'awayColor' | 'config'>,
  now: number, uuid: () => string,
): GuestMatch {
  return { ...input, id: `${GUEST_PREFIX}${uuid()}`, createdAt: new Date(now).toISOString(), events: [] };
}

/** A tap as a log record (the shape the server log takes; clientId makes the upload idempotent). */
export function appendGuestEvent(g: GuestMatch, action: ScoreAction, uuid: () => string, now: number): GuestMatch {
  const seq = g.events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  const rec: MatchEventRecord = {
    seq, type: action.type, side: action.side ?? null,
    payload: action.attribution2 ? { ...(action.payload ?? {}), _attr2: action.attribution2 } : action.payload ?? {},
    attribution: action.attribution ?? null,
    clientId: uuid(), created_at: new Date(now).toISOString(),
  };
  return { ...g, events: [...g.events, rec] };
}

/** Undo: the newest tap off. */
export function popGuestEvent(g: GuestMatch): GuestMatch {
  if (!g.events.length) return g;
  const top = g.events.reduce((m, e) => (e.seq >= m.seq ? e : m));
  return { ...g, events: g.events.filter((e) => e !== top) };
}

export interface GuestStore {
  get(): Promise<GuestMatch | null>;
  set(g: GuestMatch): Promise<void>;
  clear(): Promise<void>;
}

export interface ClaimDeps {
  /** the signed-in person's player id (created if they have none yet) */
  myPlayerId(): Promise<string>;
  /** G3: create with OUR id; an id that already exists counts as done (a retry
   *  after the server created it but the reply was lost never makes a second) */
  createTeam(input: { id: string; name: string; shortName: string; sport: SportId; colorHex: string; adhoc: true }): Promise<void>;
  createMatch(input: { id: string; sport: SportId; homeTeamId: string; awayTeamId: string; startsAt: string; hostIds: string[]; format: Record<string, unknown> }): Promise<void>;
  setScorer(matchId: string, playerId: string): Promise<void>;
  /** upload one tap; idempotent by clientId (append_match_event is) */
  uploadOne(matchId: string, event: MatchEventRecord): Promise<void>;
  /** the board after the taps (replayed with the same engine) */
  saveBoard(matchId: string, g: GuestMatch): Promise<void>;
  endManually(matchId: string, result: MatchResult): Promise<void>;
}

/** G3: claim a guest match for the signed-in person. The ids are chosen here
 *  and saved BEFORE anything is created, and every step is idempotent, so a
 *  retry after a crash or a dropped network (even one that lost a reply)
 *  finishes the job without making anything twice. Clears the store when
 *  done. Returns the real match id (null when there is nothing to claim). */
export async function claimGuestMatch(store: GuestStore, deps: ClaimDeps, codes: { home: string; away: string }, uuid: () => string): Promise<string | null> {
  let g = await store.get();
  if (!g) return null;
  if (!g.claim?.matchId) {
    g = { ...g, claim: { homeTeamId: uuid(), awayTeamId: uuid(), matchId: uuid() } };
    await store.set(g);
  }
  const { homeTeamId, awayTeamId, matchId } = g.claim as Required<NonNullable<GuestMatch['claim']>>;
  const me = await deps.myPlayerId();
  await deps.createTeam({ id: homeTeamId, name: g.homeTeamName, shortName: codes.home, sport: g.sport, colorHex: g.homeColor, adhoc: true });
  await deps.createTeam({ id: awayTeamId, name: g.awayTeamName, shortName: codes.away, sport: g.sport, colorHex: g.awayColor, adhoc: true });
  await deps.createMatch({ id: matchId, sport: g.sport, homeTeamId, awayTeamId, startsAt: g.createdAt, hostIds: [me], format: g.config });
  await deps.setScorer(matchId, me);
  // one tap at a time, progress saved, so a patchy network still gets through
  for (const e of [...g.events].sort((a, b) => a.seq - b.seq)) {
    if (e.seq <= (g.claim?.uploadedSeq ?? 0)) continue;
    await deps.uploadOne(matchId, e);
    g = { ...g, claim: { ...g.claim, uploadedSeq: e.seq } };
    await store.set(g);
  }
  await deps.saveBoard(matchId, g);
  if (g.result) await deps.endManually(matchId, g.result);
  await store.clear();
  return matchId;
}
