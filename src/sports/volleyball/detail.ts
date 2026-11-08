/**
 * SD-81 (VB-07 / VB-08) — volleyball's optional "Detailed stats" capture
 * mode: attack attempts per attacker (kill / error / blocked / in play) and,
 * optionally, reception quality. PURE (no React Native).
 *
 * Off by default (like the racket "Point detail", SD-107): one tap per point
 * stays the default. Turned on (`SET_DETAIL {detail}`) it applies from the
 * next point; earlier points keep what they had.
 *
 * What an attack attempt is (NCAA "hitting percentage" / FIVB VIS "attack
 * efficiency" — both count every attack swing):
 *   kill     an Attack point                          (already logged: ATTACK)
 *   error    the attacker hit out / into the net      (an "Opp. fault" typed
 *            "Attack out" that names the attacker — SD-117b)
 *   blocked  stuffed by a block for a point          (a Block point + "Who was
 *            blocked?" — VB_DETAIL kind 'blocked')
 *   in play  dug / kept alive, rally goes on         (VB_DETAIL kind 'inplay')
 * Attempts = kills + errors + blocked + in play.
 * Attack efficiency = (kills − errors − blocked) ÷ attempts (NCAA counts a
 * blocked attack as an attack error; FIVB VIS lists "blocked" separately and
 * subtracts both). Attack success % (FIVB Best Attacker) = kills ÷ attempts.
 *
 * Reception (optional within the mode): the receiver and a grade —
 * 'perfect' (#, setter can run any play), 'good' (+, positive), 'poor' (−)
 * (VB_DETAIL kind 'reception'). A reception error is the opponent's ace, so
 * it isn't graded here.
 *
 * Deep wave (volleyball-kabaddi) — "Stats to track" categories. The switch
 * now carries WHICH stats are captured (`cats`): 'attack' (attempts →
 * efficiency), 'reception' (grades + who was aced → reception errors), 'dig'
 * (digs) and 'assist' (who set each kill → set assists). A toggle without
 * `cats` (every older log, and the inline On/Off chip) means attack +
 * reception, exactly as before; the new kinds 'dig', 'assist' and 'aced' are
 * new VB_DETAIL entries an older log never has.
 *
 * Storage (REVIEW Decision 8): new optional state keys only — `detail` (the
 * on/off switches, anchored to set + rallies played) and `vd` (the detail
 * entries, anchored the same way as SD-71 subs). They are STATE STAMPS, not
 * timeline events, so a timeline correction (EDIT_LOG) keeps them and an old
 * log (neither key) replays to exactly its old state.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction } from '../types';
import type { VolleyballState } from './engine.ts';

type Side = 'home' | 'away';
const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);

/** A detail switch: from `at` rallies into `set`, detail is `on`. `cats` =
 *  the stats captured from then on (absent = attack + reception, the
 *  original mode — every toggle an older log has). */
export interface VbDetailToggle { set: number; at: number; on: boolean; cats?: VbDetailCat[] }

/** The "Stats to track" categories (deep wave). */
export type VbDetailCat = 'attack' | 'reception' | 'dig' | 'assist' | 'aced';
/** court-team batch 5: 'aced' — "Who was aced?" on its own (split out of
 *  Reception quality, which also grades every reception): the receiver aced,
 *  a reception error only. A toggle of an older log never names it. */
export const VB_DETAIL_CATS: VbDetailCat[] = ['attack', 'reception', 'dig', 'assist', 'aced'];
/** What a toggle without `cats` captures (SD-81's original mode). */
export const LEGACY_DETAIL_CATS: VbDetailCat[] = ['attack', 'reception'];
/** The format / live-settings key of each category. */
export const VB_CAT_KEY: Record<VbDetailCat, string> = { attack: 'vbAttack', reception: 'vbReception', dig: 'vbDig', assist: 'vbAssist', aced: 'vbAced' };

/** 'dig' — a dig (the rally goes on); 'assist' — who set the last Attack
 *  point; 'aced' — who failed to receive the last Ace (a reception error). */
export type VbDetailKind = 'inplay' | 'blocked' | 'reception' | 'dig' | 'assist' | 'aced';
/** Entries that annotate the last scored point (anchored to it). */
const ANCHORED: Partial<Record<VbDetailKind, string>> = { blocked: 'block', assist: 'attack', aced: 'ace' };
/** The category each entry kind belongs to. */
export const CAT_OF_KIND: Record<VbDetailKind, VbDetailCat> = { inplay: 'attack', blocked: 'attack', reception: 'reception', aced: 'reception', dig: 'dig', assist: 'assist' };
export type ReceptionGrade = 'perfect' | 'good' | 'poor';

/** One detail entry (an attack kept in play, an attacker blocked, a reception). */
export interface VbDetailEntry {
  kind: VbDetailKind;
  /** the PLAYER's side (the attacker / the receiver) */
  side: Side;
  set: number;
  /** rallies already played in the set when it was logged ('blocked' /
   *  'assist' / 'aced': the annotated point is rally `at` — logged right
   *  after it) */
  at: number;
  playerId?: string;
  /** legacy, read-only (pre IDs-only scoring): the name an older entry stored.
   *  New entries carry `playerId` only; readers show `nameOf(playerId, playerName)`. */
  playerName?: string;
  /** reception grade */
  q?: ReceptionGrade;
}

export const RECEPTION_GRADES: Array<{ key: ReceptionGrade; label: string; sign: string }> = [
  { key: 'perfect', label: 'Perfect', sign: '#' },
  { key: 'good', label: 'Good', sign: '+' },
  { key: 'poor', label: 'Poor', sign: '−' },
];

const setNo = (s: VolleyballState) => s.setsWon.home + s.setsWon.away + 1;
const scoredIn = (s: VolleyballState, n: number) =>
  (s.events ?? []).filter((e) => e.set === n && SCORED.has(e.kind ?? '') && (e.side === 'home' || e.side === 'away')).length;

/** Is detail capture on right now (for the next point)? */
export const detailOn = (s: VolleyballState | null | undefined): boolean => {
  const t = s?.detail;
  return !!t && t.length > 0 && t[t.length - 1].on;
};

/** The categories a toggle switches on (none when it's off). */
export const catsOf = (t: VbDetailToggle | undefined): VbDetailCat[] => (t?.on ? t.cats ?? LEGACY_DETAIL_CATS : []);
/** The categories captured right now (for the next point). */
export const detailCats = (s: VolleyballState | null | undefined): VbDetailCat[] => catsOf(s?.detail?.[s.detail.length - 1]);
/** Is category `cat` captured right now? */
export const catOn = (s: VolleyballState | null | undefined, cat: VbDetailCat): boolean => detailCats(s).includes(cat);
/** Did any toggle of this match name its categories (a deep-wave match)? */
const hasCats = (s: VolleyballState) => (s.detail ?? []).some((t) => !!t.cats);
/** Batch 5: did any toggle of this match name 'aced' (never on an older log)? */
const hasAcedCat = (s: VolleyballState) => (s.detail ?? []).some((t) => !!t.cats?.includes('aced'));

/** The category an entry counts towards. Batch 5: on a match that had the
 *  'aced' category, an aced receiver logged while Reception quality was off
 *  is 'aced' only (a reception error, not a graded reception). Every older
 *  log keeps CAT_OF_KIND. */
export function entryCat(s: VolleyballState, x: VbDetailEntry): VbDetailCat {
  if (x.kind === 'aced' && hasAcedCat(s) && !catCoveredAt(s, 'reception', x.set, Math.max(0, x.at - 1))) return 'aced';
  return CAT_OF_KIND[x.kind];
}

/** Was category `cat` captured in the match — at least one entry of it
 *  logged? The keyed stats of the category are written then.
 *  no-false-zeros NZC1 (wave 1, docs/security/breaks/no-false-zeros-court-team.md):
 *  the switch alone no longer counts — switched on with nothing captured is
 *  "not tracked" (no key, no row), never a 0 on every line. */
export const catTracked = (s: VolleyballState | null | undefined, cat: VbDetailCat): boolean =>
  !!s && (s.vd ?? []).some((x) => entryCat(s, x) === cat);

/** Did this match capture attack attempts? (the attack keys are written
 *  then). NZC4: only once an in-play / blocked swing was captured — kills
 *  count as attempts automatically, so the switch alone would make attempts =
 *  kills (efficiency near 100%). An older match (no `cats` anywhere) keeps
 *  SD-81's rule for its entries: any detail entry captured. */
export const detailTracked = (s: VolleyballState | null | undefined): boolean =>
  !!s && (hasCats(s) ? catTracked(s, 'attack') : (s.vd ?? []).length > 0);

/** Was rally `idx` (0-based) of set `set` played with detail on? */
export function coveredAt(s: VolleyballState, set: number, idx: number): boolean {
  let on = false;
  for (const t of s.detail ?? []) {
    if (t.set < set || (t.set === set && t.at <= idx)) on = t.on;
  }
  return on;
}

/** Was rally `idx` (0-based) of set `set` played with category `cat` on? */
export function catCoveredAt(s: VolleyballState, cat: VbDetailCat, set: number, idx: number): boolean {
  let on = false;
  for (const t of s.detail ?? []) {
    if (t.set < set || (t.set === set && t.at <= idx)) on = catsOf(t).includes(cat);
  }
  return on;
}

/** The categories a format / settings patch names (true adds, false
 *  removes), applied over `base`. null = the patch names none. */
function patchCats(base: VbDetailCat[], p: Record<string, unknown> | undefined): VbDetailCat[] | null {
  if (!p || !VB_DETAIL_CATS.some((c) => typeof p[VB_CAT_KEY[c]] === 'boolean')) return null;
  const on = new Set(base);
  for (const c of VB_DETAIL_CATS) {
    const v = p[VB_CAT_KEY[c]];
    if (v === true) on.add(c);
    else if (v === false) on.delete(c);
  }
  return VB_DETAIL_CATS.filter((c) => on.has(c));
}

/** The format keys a new match may start with detail on: `detail: true`
 *  (SD-81, attack + reception) and / or the deep-wave category keys
 *  (`vbAttack`, `vbReception`, `vbDig`, `vbAssist`, batch 5 `vbAced`). */
export function initDetail(config?: Record<string, unknown>): Pick<VolleyballState, 'detail'> {
  const legacy = config?.detail === true;
  const cats = patchCats(legacy ? LEGACY_DETAIL_CATS : [], config);
  if (!cats) return legacy ? { detail: [{ set: 1, at: 0, on: true }] } : {};
  return cats.length ? { detail: [{ set: 1, at: 0, on: true, cats }] } : {};
}

/** The categories the inline On chip turns back on: the last ones chosen
 *  (none chosen = attack + reception, SD-81). */
const lastChosen = (s: VolleyballState): VbDetailCat[] | undefined =>
  [...(s.detail ?? [])].reverse().find((t) => t.cats && t.cats.length)?.cats;

/** SET_DETAIL / VB_DETAIL — null when the action isn't one of them. */
export function detailReducer(s: VolleyballState, a: ScoreAction): VolleyballState | null {
  if (a.type === 'SET_DETAIL') {
    const p = a.payload ?? {};
    if (s.ended) return s;
    const n = setNo(s);
    // deep wave — "Stats to track": the categories named in the patch
    const cats = patchCats(detailCats(s), p);
    if (cats) {
      const cur = detailCats(s);
      if (cats.length === cur.length && cats.every((c) => cur.includes(c))) return s;
      return { ...s, detail: [...(s.detail ?? []), { set: n, at: scoredIn(s, n), on: cats.length > 0, cats }] };
    }
    // SD-81 — the inline On / Off switch (an older log: exactly as before)
    const want = p.detail;
    if (typeof want !== 'boolean' || want === detailOn(s)) return s;
    const back = want ? lastChosen(s) : undefined;
    return { ...s, detail: [...(s.detail ?? []), { set: n, at: scoredIn(s, n), on: want, ...(back ? { cats: back } : {}) }] };
  }
  if (a.type !== 'VB_DETAIL') return null;
  const kind = a.payload?.kind as VbDetailKind;
  const side = a.side;
  // the player rides in the payload (not an attribution: no live stat credit —
  // the keys are set absolutely by statTotals at completion). IDs-only
  // scoring: the id only; an older payload also carried the name.
  const who = a.payload?.player as { playerId?: string; playerName?: string } | undefined;
  const anchor = ANCHORED[kind];
  if (s.ended && !anchor) return s;
  if ((side !== 'home' && side !== 'away') || (!who?.playerName && !who?.playerId) || !Object.prototype.hasOwnProperty.call(CAT_OF_KIND, kind)) return s;
  const q = a.payload?.q as ReceptionGrade | undefined;
  if (kind === 'reception' && !RECEPTION_GRADES.some((g) => g.key === q)) return s;
  // a blocked attacker / the setter / the receiver aced annotates the last
  // Block / Attack / Ace point (the set it was in). SD-81 kept a "blocked"
  // with no Block point to annotate (anchored to the rally in play) — kept.
  const last = anchor ? lastPoint(s, anchor) : null;
  if (anchor && kind !== 'blocked' && !last) return s;
  const n = last?.set ?? setNo(s);
  const at = last?.at ?? scoredIn(s, n);
  // one entry per annotated point: a second tap replaces it
  const rest = (s.vd ?? []).filter((x) => !(anchor && x.kind === kind && x.set === n && x.at === at));
  const entry: VbDetailEntry = {
    kind, side, set: n, at, ...(who.playerName ? { playerName: who.playerName } : {}),
    ...(who.playerId ? { playerId: who.playerId } : {}), ...(kind === 'reception' ? { q } : {}),
  };
  return { ...s, vd: [...rest, entry] };
}

/** The last scored point, when it was of `kind` — its set and rally number
 *  (1-based: the count of rallies up to and including it). */
export function lastPoint(s: VolleyballState, kind: string): { set: number; at: number; side: Side; e: LiveEvent } | null {
  const ev = s.events ?? [];
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (!SCORED.has(e.kind ?? '')) continue;
    if (e.kind !== kind || (e.side !== 'home' && e.side !== 'away')) return null;
    const set = e.set ?? 1;
    const at = ev.slice(0, i + 1).filter((x) => x.set === set && SCORED.has(x.kind ?? '')).length;
    return { set, at, side: e.side, e };
  }
  return null;
}

/** The last scored point, when it was a Block (SD-81). */
export const lastBlock = (s: VolleyballState) => lastPoint(s, 'block');

/** The entry of `kind` already logged for an annotated point, if any. */
export function entryFor(s: VolleyballState, kind: VbDetailKind, b: { set: number; at: number }): VbDetailEntry | undefined {
  return (s.vd ?? []).find((x) => x.kind === kind && x.set === b.set && x.at === b.at);
}

/** The blocked attacker already named for the last Block point, if any. */
export const blockedFor = (s: VolleyballState, b: { set: number; at: number }) => entryFor(s, 'blocked', b);

/* ------------------------------------------------------------ tally -- */

export interface VbAttackLine {
  side: Side;
  /** legacy, read-only: the name an older log stored ('' for an IDs-only
   *  line) — show `nameOf(playerId, name)` */
  name: string;
  playerId?: string;
  attackAttempts: number;
  attackKills: number;
  attackErrors: number;
  attacksBlocked: number;
  receptions: number;
  receptionsPerfect: number;
  receptionsPositive: number;
  /** deep wave — aced receivers named (a reception error, counted in receptions) */
  receptionErrors: number;
  /** deep wave — digs */
  digs: number;
  /** deep wave — kills this player set (the setter named on an Attack point) */
  setAssists: number;
}

export const VB_ATTACK_KEYS = ['attackAttempts', 'attackKills', 'attackErrors', 'attacksBlocked'] as const;
export const VB_RECEPTION_KEYS = ['receptions', 'receptionsPerfect', 'receptionsPositive'] as const;
/** deep wave — written only for a match that captured the category */
export const VB_RECEPTION_ERROR_KEY = 'receptionErrors';
export const VB_DIG_KEY = 'digs';
export const VB_ASSIST_KEY = 'setAssists';

/** Did the match grade any reception? (the reception keys are written then).
 *  A deep-wave match: the reception category was on at some point. */
export const receptionTracked = (s: VolleyballState | null | undefined): boolean =>
  !!s && (hasCats(s) ? catTracked(s, 'reception') : (s.vd ?? []).some((x) => x.kind === 'reception' || x.kind === 'aced'));

/** Were aced receivers named (reception errors)? NZC2: only once one was
 *  named — the rule an older match always had. Reception quality or "Who was
 *  aced?" switched on with no aced receiver named would write
 *  `receptionErrors 0` and a reception efficiency with no errors. */
export const acedTracked = (s: VolleyballState | null | undefined): boolean =>
  !!s && (s.vd ?? []).some((x) => x.kind === 'aced');
/** Digs / set assists captured on this match? */
export const digTracked = (s: VolleyballState | null | undefined): boolean => catTracked(s, 'dig');
export const assistTracked = (s: VolleyballState | null | undefined): boolean => catTracked(s, 'assist');

/**
 * Per player ("side|id" — IDs-only scoring; an older log's name-only entry
 * "side|~name", merged into the id the same name carries elsewhere in the
 * log), for the whole match or one set: attack attempts
 * by result and receptions by grade — only rallies played with detail on
 * count kills and attack errors (an Attack point before the switch was
 * turned on isn't an attempt we saw the rest of).
 */
export function detailTally(s: VolleyballState, scope: 'all' | number = 'all'): Map<string, VbAttackLine> {
  const out = new Map<string, VbAttackLine>();
  if (!s) return out;
  // a legacy name → the id it carries elsewhere in the log (events + entries)
  const idOf = new Map<string, string>();
  const note = (side: Side, id?: string, name?: string) => { if (id && name && !idOf.has(`${side}|${name}`)) idOf.set(`${side}|${name}`, id); };
  for (const e of s.events ?? []) {
    if (e.side !== 'home' && e.side !== 'away') continue;
    note(e.side, e.playerId, e.playerName);
    note(e.side === 'home' ? 'away' : 'home', e.oe?.playerId, e.oe?.playerName);
  }
  for (const x of s.vd ?? []) note(x.side, x.playerId, x.playerName);
  const line = (side: Side, name: string | undefined, playerId?: string): VbAttackLine | null => {
    const id = playerId || (name ? idOf.get(`${side}|${name}`) : undefined);
    if (!id && !name) return null;
    const k = `${side}|${id ?? `~${name}`}`;
    let l = out.get(k);
    if (!l) {
      l = { side, name: name ?? '', attackAttempts: 0, attackKills: 0, attackErrors: 0, attacksBlocked: 0, receptions: 0, receptionsPerfect: 0, receptionsPositive: 0, receptionErrors: 0, digs: 0, setAssists: 0 };
      out.set(k, l);
    }
    if (id && !l.playerId) l.playerId = id;
    if (name && !l.name) l.name = name;
    return l;
  };
  const count = new Map<number, number>();
  for (const e of s.events ?? []) {
    if (!SCORED.has(e.kind ?? '') || (e.side !== 'home' && e.side !== 'away')) continue;
    const set = e.set ?? 1;
    const idx = count.get(set) ?? 0;
    count.set(set, idx + 1);
    if (scope !== 'all' && set !== scope) continue;
    if (!catCoveredAt(s, 'attack', set, idx)) continue;
    if (e.kind === 'attack') {
      const l = line(e.side, e.playerName, e.playerId);
      if (l) { l.attackKills += 1; l.attackAttempts += 1; }
    } else if (e.kind === 'opperror' && e.oe?.type === 'attackout') {
      const l = line(e.side === 'home' ? 'away' : 'home', e.oe.playerName, e.oe.playerId);
      if (l) { l.attackErrors += 1; l.attackAttempts += 1; }
    }
  }
  for (const x of s.vd ?? []) {
    if (scope !== 'all' && x.set !== scope) continue;
    const l = line(x.side, x.playerName, x.playerId);
    if (!l) continue;
    if (x.kind === 'inplay') l.attackAttempts += 1;
    else if (x.kind === 'blocked') { l.attacksBlocked += 1; l.attackAttempts += 1; }
    else if (x.kind === 'reception') {
      l.receptions += 1;
      if (x.q === 'perfect') l.receptionsPerfect += 1;
      if (x.q === 'perfect' || x.q === 'good') l.receptionsPositive += 1;
    } else if (x.kind === 'aced') {
      // batch 5: an aced-only entry is an error, not a graded reception
      if (entryCat(s, x) === 'reception') l.receptions += 1;
      l.receptionErrors += 1;
    }
    else if (x.kind === 'dig') l.digs += 1;
    else if (x.kind === 'assist') l.setAssists += 1;
  }
  return out;
}

/** FIVB VIS reception efficiency: (perfect − errors) ÷ receptions, or null. */
export const receptionEfficiency = (l: Pick<VbAttackLine, 'receptions' | 'receptionsPerfect' | 'receptionErrors'>): number | null =>
  l.receptions > 0 ? (l.receptionsPerfect - l.receptionErrors) / l.receptions : null;

/** Attack efficiency (kills − errors − blocked) ÷ attempts, or null. */
export const attackEfficiency = (l: Pick<VbAttackLine, 'attackAttempts' | 'attackKills' | 'attackErrors' | 'attacksBlocked'>): number | null =>
  l.attackAttempts > 0 ? (l.attackKills - l.attackErrors - l.attacksBlocked) / l.attackAttempts : null;
