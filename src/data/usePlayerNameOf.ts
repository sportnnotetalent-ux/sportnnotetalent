/** IDs-only scoring (docs/privacy/ids-only-scoring.md): a NameOf for the given
 *  player ids, loaded through players_view for THIS viewer. Until loaded (or for
 *  an unknown id) it falls back to the legacy stored name. For surfaces outside
 *  the live match screen (records, profiles, tournament stats). */
import { useEffect, useMemo, useState } from 'react';
import { makeNameOf, type NameOf } from '../core/playerNames';
import { getPlayerNamesById } from './repos';

export function usePlayerNameOf(ids: readonly (string | undefined | null)[]): NameOf {
  const key = useMemo(() => [...new Set(ids.filter((x): x is string => !!x))].sort().join(','), [ids]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let on = true;
    if (!key) { setNames(new Map()); return; }
    void getPlayerNamesById(key.split(',')).then((m) => { if (on) setNames(m); }).catch(() => undefined);
    return () => { on = false; };
  }, [key]);
  return useMemo(() => makeNameOf(names), [names]);
}
