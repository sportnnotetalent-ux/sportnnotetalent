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

  /* --------------------------------- shooting --------------------------------- */
  {
    key: 'shootPen', sports: ['shooting'], group: 'Stats to track', label: 'Penalties', kind: 'choice', phase: true, default: false,
    choices: [{ value: false, label: 'Off' }, { value: true, label: 'On — a −2 button on each series' }],
    help: 'A penalty deducts 2 points from the series it happened in (shots before START or after STOP, rule breaches). Totals, ties and records use the score after the deduction; the sheet shows it.',
    source: 'ISSF GTR penalties (2-point deduction), as remembered (verify)',
  },
];
