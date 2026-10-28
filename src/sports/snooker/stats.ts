/** SD-15 — snooker's stat schema (see ../statSchema.ts). PURE. BASE: the
 *  match record only; the scoring keys come with the stat totals. */
import type { SportStatSchema } from '../statSchema.ts';

export const snookerStats: SportStatSchema<'snooker'> = {
  sport: 'snooker',
  splits: ['tournament', 'season', 'opponent'],
  stats: [
    { key: 'framesWon', label: 'Frames won', short: 'frames won', one: 'frame won', group: 'record', coverage: 'present' },
  ],
  sections: [{ id: 'match', title: 'Match play', rows: [{ stat: 'framesWon' }] }],
  careerView: 'sections',
  box: [{ columns: ['framesWon'] }],
  compare: ['framesWon'],
  leaders: ['framesWon'],
  headline: ['framesWon'],
  awards: [{ stat: 'framesWon', icon: '🏆', label: 'Most frames won' }],
};
