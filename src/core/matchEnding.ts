/**
 * Friendly setup ends with two clear buttons (docs/design/reference-video, C4):
 * "Start now" always kicks off now and opens scoring; "Save for later" files
 * it at the chosen time and never opens scoring, whatever the time field says.
 */
export type MatchEndingChoice = 'now' | 'later';

export function matchEnding(choice: MatchEndingChoice, whenMs: number, nowMs: number): { startsAt: number; openScoring: boolean } {
  return choice === 'now' ? { startsAt: nowMs, openScoring: true } : { startsAt: whenMs, openScoring: false };
}
