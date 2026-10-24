/** What a match's tournament requires of every player's age (verification fast
 *  lanes, Phase 3 — tournaments.age_verification). 'none' for friendlies, while
 *  loading, and before the migration. docs/verification/fast-lanes.md */
import { useEffect, useState } from 'react';
import type { AgeRequirement } from '../core/eligibility';
import { getMatch, getTournaments } from './repos';

export function useAgeRequirement(opts: { matchId?: string; tournamentId?: string }): AgeRequirement {
  const [req, setReq] = useState<AgeRequirement>('none');
  useEffect(() => {
    let on = true;
    void (async () => {
      const tid = opts.tournamentId ?? (opts.matchId ? (await getMatch(opts.matchId).catch(() => null))?.tournamentId : undefined);
      if (!tid) { if (on) setReq('none'); return; }
      const t = (await getTournaments().catch(() => [])).find((x) => x.id === tid);
      if (on) setReq(t?.ageVerification ?? 'none');
    })();
    return () => { on = false; };
  }, [opts.matchId, opts.tournamentId]);
  return req;
}
