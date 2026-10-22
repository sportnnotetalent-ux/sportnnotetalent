/**
 * Deep wave (volleyball-kabaddi) — volleyball's "⚙️ Stats to track" card
 * (the shared LiveSettings, parity #14). Event mode: before the first point a
 * change sets the match format (`vbAttack` / `vbReception` / `vbDig` /
 * `vbAssist`); after it, Apply logs a SET_DETAIL so it applies from the next
 * rally and earlier rallies keep what they had (detail.ts). Everything is off
 * by default — the point buttons stay one tap. PURE.
 */
import type { FormatField, LiveSettings } from '../types';
import { detailCats, VB_CAT_KEY, type VbDetailCat } from './detail.ts';
import type { VolleyballState } from './engine.ts';

const FIELDS: Array<{ cat: VbDetailCat; label: string; hint: string }> = [
  { cat: 'attack', label: 'Attack attempts (efficiency)', hint: 'Attacks kept in play and who was blocked — kills and attack errors come from the point buttons. FIVB attack efficiency / Best Attacker.' },
  { cat: 'reception', label: 'Reception quality', hint: 'Grade serve receptions (# perfect / + good / − poor) and name who was aced. FIVB reception % / Best Receiver.' },
  { cat: 'dig', label: 'Digs', hint: 'One tap on the player who dug the ball. FIVB Best Digger (digs per set).' },
  { cat: 'assist', label: 'Set assists', hint: 'After a kill, tap who set it. FIVB Best Setter.' },
];

export const VOLLEYBALL_LIVE_SETTINGS: LiveSettings<VolleyballState> = {
  title: '⚙️ Stats to track',
  hint: 'Optional detail for this match. Each switch adds a skippable prompt under the point buttons, from the next rally on. Free stats (points by skill, side-out %, rotations) need nothing extra.',
  mode: 'event',
  actionType: 'SET_DETAIL',
  beforeStart: (s) => !(s?.events ?? []).length,
  fields: FIELDS.map((f): FormatField => ({ key: VB_CAT_KEY[f.cat], label: f.label, type: 'toggle', default: false, group: 'Stats to track', hint: f.hint })),
  read: (s) => {
    const on = detailCats(s);
    return Object.fromEntries(FIELDS.map((f) => [VB_CAT_KEY[f.cat], on.includes(f.cat)]));
  },
  defaults: Object.fromEntries(FIELDS.map((f) => [VB_CAT_KEY[f.cat], false])),
};
