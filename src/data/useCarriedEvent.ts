/** Run it again (2026-10-27): an event-setup screen opened from "Events from
 *  last time" (route param `slot`). The tournament and its carried programme
 *  event are read before the screen starts, so its choices begin as last
 *  edition's (data/carriedSetup.ts) rather than the defaults. */
import { useEffect, useRef, useState, type DependencyList, type EffectCallback } from 'react';
import type { Tournament } from '../core/types';
import { getTournaments } from './repos';
import { programmeSlot, readProgramme, type ProgrammeEvent } from './tournamentCopyPlan';

export interface CarriedEvent { loading: boolean; tournament?: Tournament; carried?: ProgrammeEvent }

export function useCarriedEvent(tournamentId: string | undefined, sport: string, slot: string | undefined): CarriedEvent {
  const want = !!(tournamentId && slot);
  const [state, setState] = useState<CarriedEvent>({ loading: want });
  useEffect(() => {
    let on = true;
    if (!want) { setState({ loading: false }); return; }
    setState({ loading: true });
    getTournaments({ includeDeleted: true })
      .then((list) => {
        const t = list.find((x) => x.id === tournamentId);
        const carried = t ? readProgramme(t.formats?.[sport as keyof NonNullable<Tournament['formats']>] as Record<string, unknown> | undefined, sport).find((e) => programmeSlot(e) === slot) : undefined;
        if (on) setState({ loading: false, tournament: t, carried });
      })
      .catch(() => { if (on) setState({ loading: false }); });
    return () => { on = false; };
  }, [want, tournamentId, sport, slot]);
  return state;
}

/** useEffect that skips its first run when the screen opened pre-filled, so
 *  the carried choices aren't reset to the defaults; when the organiser then
 *  changes something (another event, age group …) it runs as usual. */
export function useEffectAfterSeed(seeded: boolean, effect: EffectCallback, deps: DependencyList): void {
  const skip = useRef(seeded);
  useEffect(() => {
    if (skip.current) { skip.current = false; return undefined; }
    return effect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
