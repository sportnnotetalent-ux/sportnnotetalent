/**
 * Deep wave (volleyball-kabaddi) — kabaddi's "⚙️ Stats to track" card (the
 * shared LiveSettings, parity #14). Event mode: before the first raid a change
 * sets the match format (`trackSkills` / `trackTouched`); after it, Apply logs
 * a SET_TRACK so it applies from the next raid. Both off by default — the raid
 * form stays as fast as today; each switch adds one optional chip row. PURE.
 */
import type { LiveSettings } from '../types';
import type { KabaddiState } from './engine.ts';

export const KABADDI_LIVE_SETTINGS: LiveSettings<KabaddiState> = {
  title: '⚙️ Stats to track',
  hint: 'Optional detail for this match, from the next raid on. The PKL match centre (raids, strike rates, super raids / tackles, all-outs) needs nothing extra.',
  mode: 'event',
  actionType: 'SET_TRACK',
  beforeStart: (s) => !(s?.raids ?? []).length && !(s?.events ?? []).length,
  fields: [
    { key: 'trackSkills', label: 'Raid skill', type: 'toggle', default: false, group: 'Stats to track', hint: 'How the points were scored: hand touch, running hand touch, toe touch, kick, dubki, escape — raid points by skill' },
    { key: 'trackTouched', label: 'Defenders touched (named)', type: 'toggle', default: false, group: 'Stats to track', hint: 'Tap who the raider touched — who is out by name, revival order, a defender’s times out' },
  ],
  read: (s) => ({ trackSkills: !!s?.track?.skills, trackTouched: !!s?.track?.touched }),
  defaults: { trackSkills: false, trackTouched: false },
};
