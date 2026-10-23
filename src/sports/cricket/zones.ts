/** SD-133 — fielding zones for the wagon wheel, clockwise from straight (for a
 *  right-hander; a left-hander's tap is mirrored onto these so careers add up):
 *  1 Mid-off · 2 Cover · 3 Point · 4 Third man · 5 Fine leg · 6 Square leg ·
 *  7 Mid-wicket · 8 Mid-on. Each is 45°, zone z centred on (z − 0.5) × 45°.
 *  Perf F-15: its own module, so the career wagon wheel (a player's profile)
 *  doesn't pull the whole cricket engine into the first download. */
export const ZONES = ['Mid-off', 'Cover', 'Point', 'Third man', 'Fine leg', 'Square leg', 'Mid-wicket', 'Mid-on'] as const;
