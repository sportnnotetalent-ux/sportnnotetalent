/**
 * Doubles serve diagram (2026-10-22): for the NEXT point, who serves, from
 * which half, to whom, and where the two partners stand — tennis, padel,
 * badminton and pickleball. Replaces the generic "Lineups" court on the Score
 * tab for these sports (a singles match shows no court: one player per side,
 * changing halves every point, so there is nothing to place).
 *
 * All DERIVED from the score and the existing serve rules — never stored:
 *   tennis / padel  serve.ts `serveInfo` (side + doubles slot, tiebreak turns);
 *                   the server's half follows the points played in the game
 *                   (even → deuce / right, odd → ad / left; tiebreak likewise);
 *                   the receiver is the receiving pair's player in that half,
 *                   known only once the pair's receiving order is picked for
 *                   the set (`recvOrder`, ITF Rule 14) — else "not known".
 *   badminton       doublesOrder.ts `badmintonDoublesTurn` (BWF Law 11).
 *   pickleball      rallyEngine `serveSpot` / `serverId` / `rightCourtId`.
 * The receiver always stands in the diagonal court, i.e. the same named half
 * (right / left) from their own side. PURE (no React Native).
 */
import { serveInfo, deuceReceiverSlot, type ServeState } from './serve.ts';
import { badmintonDoublesTurn } from './doublesOrder.ts';
import { serveSpot, serverId, rightCourtId, type RallyState } from './rallyEngine.ts';

export type Side = 'home' | 'away';
export type Half = 'right' | 'left';
export type CourtRole = 'server' | 'serverPartner' | 'receiver' | 'receiverPartner';
export type ServeCourtSport = 'tennis' | 'padel' | 'badminton' | 'pickleball';

export interface CourtPlayer {
  side: Side;
  role: CourtRole;
  half: Half;
  /** absent = not known (tennis / padel receiving order not picked) */
  playerId?: string;
}

export interface ServeCourtView {
  sport: ServeCourtSport;
  serverSide: Side;
  /** the server's half; the receiver is in the same named half on their side */
  half: Half;
  players: CourtPlayer[];
  receiverKnown: boolean;
  /** tennis no-ad / padel golden point at 40-40: the receivers choose the half */
  deciding?: boolean;
  /** pickleball side-out doubles: the called score, e.g. "4-2-1" */
  call?: string;
}

type Rosters = { home: string[]; away: string[] };
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const flip = (h: Half): Half => (h === 'right' ? 'left' : 'right');
const pairs = (r: Rosters) => (r.home.length >= 2 && r.away.length >= 2 ? { home: r.home.slice(0, 2), away: r.away.slice(0, 2) } : null);

/** Tennis / padel doubles. `inTb` = the sport's own tiebreak test;
 *  `deciding` = a no-ad / golden deciding point is about to be played. */
export function setServeCourt(
  sport: 'tennis' | 'padel',
  s: ServeState & { doubles?: boolean; ended?: boolean; serverPicked?: boolean; events?: unknown[] },
  rosters: Rosters,
  inTb: boolean,
  deciding = false,
): ServeCourtView | null {
  if (!s?.doubles || s.ended) return null;
  if (!s.serverPicked && !(s.events ?? []).length) return null; // the toss isn't in yet
  const P = pairs(rosters);
  if (!P) return null;
  const { side, slot } = serveInfo(s, inTb);
  const half: Half = (s.pts.home + s.pts.away) % 2 === 0 ? 'right' : 'left';
  const recv = other(side);
  const r = deuceReceiverSlot(s, recv);
  const receiverSlot = r === undefined ? undefined : half === 'right' ? r : ((1 - r) as 0 | 1);
  return {
    sport, serverSide: side, half, receiverKnown: receiverSlot !== undefined,
    ...(deciding ? { deciding: true } : {}),
    players: [
      { side, role: 'server', half, playerId: P[side][slot] },
      { side, role: 'serverPartner', half: flip(half), playerId: P[side][1 - slot] },
      { side: recv, role: 'receiver', half, ...(receiverSlot !== undefined ? { playerId: P[recv][receiverSlot] } : {}) },
      { side: recv, role: 'receiverPartner', half: flip(half), ...(receiverSlot !== undefined ? { playerId: P[recv][1 - receiverSlot] } : {}) },
    ],
  };
}

/** Badminton doubles (BWF Law 11). */
export function badmintonServeCourt(s: Parameters<typeof badmintonDoublesTurn>[0], rosters: Rosters): ServeCourtView | null {
  const P = pairs(rosters);
  if (!P) return null;
  const t = badmintonDoublesTurn(s, P);
  if (!t || !t.court) return null;
  const recv = other(t.serverSide);
  const mate = (side: Side, id: string) => P[side].find((x) => x !== id);
  return {
    sport: 'badminton', serverSide: t.serverSide, half: t.court, receiverKnown: true,
    players: [
      { side: t.serverSide, role: 'server', half: t.court, playerId: t.server },
      { side: t.serverSide, role: 'serverPartner', half: flip(t.court), playerId: mate(t.serverSide, t.server) },
      { side: recv, role: 'receiver', half: t.court, playerId: t.receiver },
      { side: recv, role: 'receiverPartner', half: flip(t.court), playerId: mate(recv, t.receiver) },
    ],
  };
}

/** Pickleball doubles (side-out or rally scoring). */
export function pickleballServeCourt(s: RallyState, rosters: Rosters): ServeCourtView | null {
  if (!s?.doubles || s.ended) return null;
  if (!s.serverPicked && !(s.events ?? []).length) return null;
  const P = pairs(rosters);
  if (!P) return null;
  const spot = serveSpot(s);
  const side = spot.side;
  const recv = other(side);
  const srv = serverId(s, P);
  const mate = (sd: Side, id?: string) => P[sd].find((x) => x !== id);
  const recvRight = rightCourtId(s, recv, P[recv]);
  const receiver = spot.court === 'right' ? recvRight : mate(recv, recvRight);
  return {
    sport: 'pickleball', serverSide: side, half: spot.court, receiverKnown: !!receiver,
    ...(spot.call ? { call: spot.call } : {}),
    players: [
      { side, role: 'server', half: spot.court, ...(srv ? { playerId: srv } : {}) },
      { side, role: 'serverPartner', half: flip(spot.court), ...(mate(side, srv) ? { playerId: mate(side, srv) } : {}) },
      { side: recv, role: 'receiver', half: spot.court, ...(receiver ? { playerId: receiver } : {}) },
      { side: recv, role: 'receiverPartner', half: flip(spot.court), ...(mate(recv, receiver) ? { playerId: mate(recv, receiver) } : {}) },
    ],
  };
}

/** Where each role stands, as CourtMap coordinates (x: 0→1 left→right from the
 *  player's own side; y: 0 own baseline → 1 net). */
const DEPTH: Record<ServeCourtSport, Record<CourtRole, number>> = {
  tennis: { server: 0.02, serverPartner: 0.8, receiver: 0.02, receiverPartner: 0.55 },
  padel: { server: 0.1, serverPartner: 0.8, receiver: 0.1, receiverPartner: 0.55 },
  badminton: { server: 0.62, serverPartner: 0.3, receiver: 0.62, receiverPartner: 0.3 },
  pickleball: { server: 0.02, serverPartner: 0.02, receiver: 0.02, receiverPartner: 0.78 },
};

export function spotXY(sport: ServeCourtSport, p: CourtPlayer): { x: number; y: number } {
  return { x: p.half === 'right' ? 0.74 : 0.26, y: DEPTH[sport][p.role] };
}

/** The half's name in the sport's own words. */
export function halfName(sport: ServeCourtSport, half: Half): string {
  if (sport === 'tennis' || sport === 'padel') return half === 'right' ? 'deuce court' : 'ad court';
  return half === 'right' ? 'right service court' : 'left service court';
}
