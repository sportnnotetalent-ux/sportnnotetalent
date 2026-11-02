/**
 * Deep wave (volleyball-kabaddi) — volleyball's "⚙️ Stats to track" card
 * (the shared LiveSettings, parity #14). Event mode: before the first point a
 * change sets the match format (`vbAttack` / `vbReception` / `vbDig` /
 * `vbAssist`); after it, Apply logs a SET_DETAIL so it applies from the next
 * rally and earlier rallies keep what they had (detail.ts). The point
 * buttons stay one tap. Batch 3 (founder 2026-11-02, only what is captured in
 * scoring reaches the stats): Set assists is on for a NEW match ("Set by?" is
 * a non-blocking row after a kill — no Skip needed); attack attempts,
 * reception grades and digs (a tap every rally) stay off. A format without
 * the keys — every older match — keeps all four off (initDetail). PURE.
 */
import type { FormatField, LiveSettings } from '../types';
import { detailCats, VB_CAT_KEY, type VbDetailCat } from './detail.ts';
import type { VolleyballState } from './engine.ts';

const FIELDS: Array<{ cat: VbDetailCat; label: string; hint: string; on?: boolean }> = [
  { cat: 'attack', label: 'Attack attempts (efficiency)', hint: 'Attacks kept in play and who was blocked — kills and attack errors come from the point buttons. FIVB attack efficiency / Best Attacker.' },
  { cat: 'reception', label: 'Reception quality', hint: 'Grade serve receptions (# perfect / + good / − poor) and name who was aced. FIVB reception % / Best Receiver.' },
  { cat: 'dig', label: 'Digs', hint: 'One tap on the player who dug the ball. FIVB Best Digger (digs per set).' },
  { cat: 'assist', label: 'Set assists', hint: 'After a kill, tap who set it. FIVB Best Setter.', on: true },
];

export const VOLLEYBALL_LIVE_SETTINGS: LiveSettings<VolleyballState> = {
  title: '⚙️ Stats to track',
  hint: 'Optional detail for this match. Each switch adds a skippable prompt under the point buttons, from the next rally on. Free stats (points by skill, side-out %, rotations) need nothing extra.',
  mode: 'event',
  actionType: 'SET_DETAIL',
  beforeStart: (s) => !(s?.events ?? []).length,
  fields: FIELDS.map((f): FormatField => ({ key: VB_CAT_KEY[f.cat], label: f.label, type: 'toggle', default: f.on === true, group: 'Stats to track', hint: f.hint })),
  read: (s) => {
    const on = detailCats(s);
    return Object.fromEntries(FIELDS.map((f) => [VB_CAT_KEY[f.cat], on.includes(f.cat)]));
  },
  defaults: Object.fromEntries(FIELDS.map((f) => [VB_CAT_KEY[f.cat], f.on === true])),
};
