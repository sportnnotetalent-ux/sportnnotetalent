/**
 * Deep wave (precision-strength: weightlifting, shooting, archery) — the
 * "Stats to track" switches and the extra rule choices, on the Competition
 * rules screen (SD-141). PURE, type-only imports (competitionRules.ts spreads
 * this list into COMPETITION_RULES, so it must not import it at runtime).
 *
 * Founder rules: the default entry stays as fast as today — every extra
 * capture is OFF until the organiser switches it on; a rule that varies has
 * the federation's standard as its default. Like every competition rule they
 * are set before the meet and read-only once results exist; `phase: true`
 * copies a changed value onto each phase (`PhaseFormat.rules`), where the
 * scoring cards read it with `ruleOf`.
 */
import type { RuleDef } from './competitionRules.ts';

export const PRECISION_RULES: RuleDef[] = [
  /* ------------------------------- weightlifting ------------------------------- */
  {
    key: 'wlChanges', sports: ['weightlifting'], group: 'Lifting order', label: 'Changes of a declared weight', kind: 'choice', phase: true, default: 2,
    choices: [{ value: 2, label: 'Two changes an attempt (IWF) — the app asks before a third' }, { value: 0, label: 'No limit' }],
    help: 'How often a coach may change the weight declared for one attempt. The app counts every change (not its own automatic declaration) and asks before a third — it never refuses.',
    source: 'IWF TCRR: two changes per attempt, as remembered (verify)',
  },
  {
    key: 'wlLights', sports: ['weightlifting'], group: 'Stats to track', label: 'Referees’ lights', kind: 'choice', phase: true, default: false,
    choices: [{ value: false, label: 'Off — one tap: Good lift / No lift' }, { value: true, label: 'On — the three referees’ lights on every attempt' }],
    help: 'With lights on, each attempt is entered as the three referees’ white / red lights, so results and the commentary show 3-0 / 2-1 decisions. Lights can still be used for any single attempt when this is off.',
    source: 'IWF TCRR: three referees, two white lights = good lift',
  },
  {
    key: 'wlJury', sports: ['weightlifting'], group: 'Stats to track', label: 'Jury reversals', kind: 'choice', phase: true, default: false,
    choices: [{ value: false, label: 'Off' }, { value: true, label: 'On — a “Jury reverses” button on each decision' }],
    help: 'The jury can overrule the referees (for example after a coach’s challenge). The final decision counts; the referees’ lights stay on record and the commentary says the jury reversed it.',
    source: 'IWF TCRR jury, as remembered (verify)',
  },

  // round 2: the competition clock (a scorer aid — never a result)
  {
    key: 'wlClock', sports: ['weightlifting'], group: 'Lifting order', label: 'Lifting clock', kind: 'choice', phase: true, default: 'iwf',
    choices: [{ value: 'iwf', label: 'On — 1 minute an attempt, 2 minutes for consecutive attempts, warning at 30 s (IWF)' }, { value: 'off', label: 'Off — no clock on the entry screen' }],
    help: 'A countdown on the entry screen that the official starts when the lifter is called. It only helps the officials — the referees still decide, and nothing about the clock is saved.',
    source: 'IWF TCRR (time allowed for an attempt) — see round-2 notes',
  },
  // round 2: Robi points as well as Sinclair
  {
    key: 'robi', sports: ['weightlifting'], group: 'Medals', label: 'Best lifter (Robi points)', kind: 'choice', default: false,
    choices: [{ value: true, label: 'Show Robi points' }, { value: false, label: 'Off' }],
    help: 'Compares lifters across bodyweight categories against each category’s world-record total: the record scores 1000 points, half of it 100. Shown on each results sheet and as a best-lifter list.',
    source: 'IWF Robi points (formula by R. Nagy) — see round-2 notes',
  },
  {
    key: 'robiRefM', sports: ['weightlifting'], group: 'Medals', label: 'Robi reference totals — men / boys (kg)', kind: 'text', phase: true, default: '',
    showIf: { key: 'robi', value: true },
    help: 'The reference total for each category, "category: kg", separated by commas: "60: 290, 65: 312, +110: 470". Empty: the IWF senior world-record totals for the IWF categories; a category with no reference shows no Robi points.',
    source: 'organiser; default = IWF senior world records (see round-2 notes)',
  },
  {
    key: 'robiRefF', sports: ['weightlifting'], group: 'Medals', label: 'Robi reference totals — women / girls (kg)', kind: 'text', phase: true, default: '',
    showIf: { key: 'robi', value: true },
    help: 'As for men: "48: 200, 53: 230, +86: 330". Empty: the IWF senior world-record totals for the IWF categories.',
    source: 'organiser; default = IWF senior world records (see round-2 notes)',
  },
  // round 2: the IWF team classification — its own result next to the house table
  {
    key: 'wlTeamClass', sports: ['weightlifting'], group: 'Team classification', label: 'IWF team classification', kind: 'choice', default: 'off',
    choices: [
      { value: 'off', label: 'Off — the house table only' },
      { value: 'total', label: 'On — 28-25-23-22-21 … points per category on the total' },
      { value: 'all', label: 'On — points for the snatch, the clean & jerk and the total' },
    ],
    help: 'A team table per age group and gender: each lifter’s place in their category earns their team 28, 25, 23, 22, 21 … 1 points. Equal points: more 1st places, then more 2nd places. It is shown next to the house table, which keeps the meet’s own points.',
    source: 'IWF team classification points — see round-2 notes',
  },

  /* --------------------------------- shooting --------------------------------- */
  {
    key: 'shootPen', sports: ['shooting'], group: 'Stats to track', label: 'Penalties', kind: 'choice', phase: true, default: false,
    choices: [{ value: false, label: 'Off' }, { value: true, label: 'On — a −2 button on each series and on each final shot' }],
    help: 'A penalty deducts 2 points: from the series it happened in, or in a final from the shot it was given on (shots before START or after STOP, rule breaches). Totals, ties, eliminations and records use the score after the deduction; the sheet shows it.',
    source: 'ISSF GTR penalties (2-point deduction) — see round-2 notes',
  },

  /* ---------------------------------- archery ---------------------------------- */
  // round 2: the recurve indoor face is the organiser's choice
  {
    key: 'archIndoorFace', sports: ['archery'], group: 'Faces', label: 'Recurve indoor face (18 m)', kind: 'choice', phase: true, default: 'full',
    choices: [
      { value: 'full', label: 'Single 40 cm face — rings 1 to 10 (school default)' },
      { value: 'triple', label: 'Triple 40 cm face — rings 6 to 10, outside is a miss (World Archery indoor)' },
    ],
    help: 'Recurve archers indoors shoot either one full 40 cm face or the vertical triple face that only has the 6 to 10 rings. With the triple face the keypad shows 6 to X and M only.',
    source: 'World Archery Book 3 (indoor faces) — see round-2 notes; single face = school default (founder)',
  },
  {
    key: 'archTeamArrows', sports: ['archery'], group: 'Stats to track', label: 'Arrows per archer in team matches', kind: 'choice', phase: true, default: false,
    choices: [{ value: false, label: 'Off — each team’s arrows as one end' }, { value: true, label: 'On — enter each team’s arrows archer by archer' }],
    help: 'In team and mixed team matches each archer’s arrows are entered in turn, so every archer gets their own team-match arrows, average, 10s and X on their profile. The team’s score is the same either way.',
    source: 'World Archery team matches (2 arrows per archer an end) — see round-2 notes',
  },
];
