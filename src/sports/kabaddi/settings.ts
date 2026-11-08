/**
 * Deep wave (volleyball-kabaddi) — kabaddi's "⚙️ Stats to track" card (the
 * shared LiveSettings, parity #14). Event mode: before the first raid a change
 * sets the match format (`trackSkills` / `trackTouched`); after it, Apply logs
 * a SET_TRACK so it applies from the next raid. Each switch adds one
 * optional chip row to the raid form. Wave 3 (defaults-on-court-team.md):
 * raid skill is on for a NEW match (the quick raids skip it, and Skills shows
 * "X of Y described", so no zeros). Wave 4 (polish-court-team.md, K1):
 * defenders touched is on for a NEW match too — the quick "+1 touch" opens
 * an optional "Who was touched?" card (RAID_TOUCHED), and a match where nobody
 * is named reads "not tracked" (no zeros). A format without the keys — every
 * older match — keeps both off (init). PURE.
 */
import type { LiveSettings } from '../types';
import type { KabaddiState } from './engine.ts';

/** defaults-on DOC3 — the one source: what a NEW match tracks (the format
 *  fields' defaults and the card's Standard / Reset). */
export const KABADDI_STATS_DEFAULTS: Readonly<{ trackSkills: boolean; trackTouched: boolean }> = { trackSkills: true, trackTouched: true };

export const KABADDI_LIVE_SETTINGS: LiveSettings<KabaddiState> = {
  title: '⚙️ Stats to track',
  hint: 'Optional detail for this match, from the next raid on. The PKL match centre (raids, strike rates, super raids / tackles, all-outs) needs nothing extra.',
  mode: 'event',
  actionType: 'SET_TRACK',
  beforeStart: (s) => !(s?.raids ?? []).length && !(s?.events ?? []).length,
  fields: [
    { key: 'trackSkills', label: 'Raid skill', type: 'toggle', default: KABADDI_STATS_DEFAULTS.trackSkills, group: 'Stats to track', hint: 'How the points were scored: hand touch, running hand touch, toe touch, kick, dubki, escape — raid points by skill' },
    { key: 'trackTouched', label: 'Defenders touched (named)', type: 'toggle', default: KABADDI_STATS_DEFAULTS.trackTouched, group: 'Stats to track', hint: 'Optional: tap who the raider touched (in the raid form, or the “Who was touched?” card after a quick +1 touch) — who is out by name, revival order, a defender’s times out' },
  ],
  read: (s) => ({ trackSkills: !!s?.track?.skills, trackTouched: !!s?.track?.touched }),
  defaults: { ...KABADDI_STATS_DEFAULTS },
};
